import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DataService } from './data.service';
import { getDb, type SyncMeta } from './db';
import { FoodsService } from './foods.service';
import { LogService } from './log.service';
import { MealsService } from './meals.service';
import { seedIfEmpty } from './seed';
import { SettingsService } from './settings.service';
import { SUPABASE_ANON_KEY, SUPABASE_CONFIGURED, SUPABASE_URL } from './supabase.config';
import { SYNC_STORES, canonical, planSync, recordKey, type RemoteRow } from './sync-plan';
import { WeightService } from './weight.service';
import { WorkoutsService } from './workouts.service';
import { t } from './i18n';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

/** Minimal store surface used when the store name is only known at runtime. */
interface AnyStore {
  put(value: unknown): Promise<unknown>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

const PAGE_SIZE = 1000;
const PUSH_CHUNK = 500;
const DEBOUNCE_MS = 2000;

/**
 * PostgREST `or` filter selecting the rows that sort after `row` in
 * (updated_at, store, id) order — the order `pull()` reads in.
 */
function rowsAfter(row: { updated_at: string; store: string; id: string }): string {
  // Values are double-quoted: timestamps and ids contain characters the filter syntax reserves.
  const quote = (value: string) => `"${value.replace(/[\\"]/g, '\\$&')}"`;
  const at = quote(row.updated_at);
  const store = quote(row.store);
  return [
    `updated_at.gt.${at}`,
    `and(updated_at.eq.${at},store.gt.${store})`,
    `and(updated_at.eq.${at},store.eq.${store},id.gt.${quote(row.id)})`,
  ].join(',');
}

/** French messages for the Supabase auth error codes a user can actually trigger. */
const AUTH_MESSAGES: Record<string, string> = {
  otp_expired: t('Code incorrect ou expiré. Demande un nouveau code.'),
  over_email_send_rate_limit: t('Trop de codes demandés. Réessaie dans quelques minutes.'),
  over_request_rate_limit: t('Trop de tentatives. Réessaie dans quelques minutes.'),
  email_address_invalid: t('Cette adresse e-mail n’est pas valide.'),
  validation_failed: t('Cette adresse e-mail n’est pas valide.'),
};

function authError(error: { code?: string; message: string }): Error {
  return new Error(
    AUTH_MESSAGES[error.code ?? ''] ??
      t('Connexion impossible : {message}', { message: error.message }),
  );
}

/**
 * Optional account + sync on top of the local database. IndexedDB stays the
 * source the app reads from; this service mirrors it to Supabase and merges
 * what other devices sent. Without a signed-in user it does nothing, so the
 * app keeps working fully offline and local-only.
 *
 * Stores are not instrumented: changes are found by diffing each record
 * against its `syncShadow` copy (see `planSync`), which also covers import
 * and reset.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly data = inject(DataService);
  private readonly foods = inject(FoodsService);
  private readonly meals = inject(MealsService);
  private readonly log = inject(LogService);
  private readonly weight = inject(WeightService);
  private readonly settings = inject(SettingsService);
  private readonly workouts = inject(WorkoutsService);

  /** False when no Supabase project is configured — the account UI hides itself. */
  readonly available = SUPABASE_CONFIGURED;
  readonly email = signal<string | null>(null);
  readonly status = signal<SyncStatus>('idle');
  readonly error = signal<string | null>(null);
  readonly lastSyncAt = signal<Date | null>(null);
  /**
   * Set when this device already holds data that is not the signed-in
   * account's: syncing waits for `confirmReplace()` or a sign-out.
   */
  readonly needsReplace = signal(false);

  private clientPromise: Promise<SupabaseClient> | null = null;
  private userId: string | null = null;
  private running = false;
  private queued = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // Any change to a store signal means there may be something to send.
    effect(() => {
      this.foods.foods();
      this.meals.meals();
      this.log.entries();
      this.weight.entries();
      this.settings.settings();
      this.workouts.workouts();
      untracked(() => this.schedule());
    });
  }

  /** Restores the saved session, if any, and starts syncing. Call once the local data is loaded. */
  async start(): Promise<void> {
    if (!this.available) return;
    try {
      const client = await this.client();
      const { data } = await client.auth.getSession();
      this.setUser(data.session?.user ?? null);
      client.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') this.setUser(null);
      });
      addEventListener('online', () => this.schedule(0));
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.schedule(0);
      });
      this.schedule(0);
    } catch (err) {
      console.error('[sync] démarrage', err);
    }
  }

  /**
   * E-mails a one-time code. There is no password and no separate sign-up: an
   * unknown address gets an account when its first code is verified.
   */
  async sendCode(email: string): Promise<void> {
    const client = await this.client();
    const { error } = await client.auth.signInWithOtp({ email });
    if (error) throw authError(error);
  }

  async verifyCode(email: string, code: string): Promise<void> {
    const client = await this.client();
    const { data, error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) throw authError(error);
    this.setUser(data.user);
    await this.syncNow();
  }

  /** Local data stays on the device; it just stops syncing. */
  async signOut(): Promise<void> {
    await this.syncNow();
    const client = await this.client();
    await client.auth.signOut({ scope: 'local' });
    this.setUser(null);
  }

  syncNow(): Promise<void> {
    return this.run(false);
  }

  /** Replaces this device's data with the signed-in account's. */
  confirmReplace(): Promise<void> {
    return this.run(true);
  }

  private client(): Promise<SupabaseClient> {
    // Loaded on demand so local-only users never download the Supabase client.
    this.clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { detectSessionInUrl: false } }),
    );
    return this.clientPromise;
  }

  private setUser(user: { id: string; email?: string } | null): void {
    this.userId = user?.id ?? null;
    this.email.set(user ? (user.email ?? '') : null);
    if (!user) {
      this.needsReplace.set(false);
      this.status.set('idle');
      this.error.set(null);
    }
  }

  private schedule(delay = DEBOUNCE_MS): void {
    if (!this.userId) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(false), delay);
  }

  private async run(replace: boolean): Promise<void> {
    if (!this.userId || (this.needsReplace() && !replace)) return;
    if (this.running) {
      this.queued = true;
      return;
    }
    if (!navigator.onLine) {
      this.status.set('offline');
      return;
    }
    this.running = true;
    this.status.set('syncing');
    try {
      const done = await this.syncOnce(this.userId, replace);
      this.status.set('idle');
      this.error.set(null);
      if (done) this.lastSyncAt.set(new Date());
    } catch (err) {
      console.error('[sync]', err);
      this.status.set(navigator.onLine ? 'error' : 'offline');
      this.error.set(t('La synchronisation a échoué. Elle sera retentée automatiquement.'));
    } finally {
      this.running = false;
      if (this.queued) {
        this.queued = false;
        this.schedule();
      }
    }
  }

  /** One pull → merge → push round. Returns false when it stopped to ask for `confirmReplace()`. */
  private async syncOnce(userId: string, replace: boolean): Promise<boolean> {
    const client = await this.client();
    const db = await getDb();
    let meta: SyncMeta = (await db.get('syncMeta', 'meta')) ?? {
      id: 'meta',
      userId: null,
      cursor: null,
    };
    const linked = meta.userId === userId;

    const remote = await this.pull(client, userId, linked ? meta.cursor : null);
    const cursor = remote.at(-1)?.updated_at ?? (linked ? meta.cursor : null);

    let wiped = false;
    if (!linked) {
      // First sync of this account on this device. Local data is uploaded only
      // when it belongs to nobody yet and the account is empty; otherwise the
      // account's data replaces it.
      const adopt = meta.userId === null && remote.length === 0;
      if (!adopt && !replace && this.settings.configured()) {
        this.needsReplace.set(true);
        return false;
      }
      meta = { id: 'meta', userId, cursor: null };
      const tx = db.transaction([...SYNC_STORES, 'syncShadow', 'syncMeta'], 'readwrite');
      const clears = [tx.objectStore('syncShadow').clear()];
      if (!adopt) {
        wiped = true;
        for (const store of SYNC_STORES) {
          clears.push((tx.objectStore(store) as unknown as AnyStore).clear());
        }
      }
      await Promise.all([...clears, tx.objectStore('syncMeta').put(meta), tx.done]);
    }
    this.needsReplace.set(false);

    const local = new Map<string, string>();
    for (const store of SYNC_STORES) {
      for (const record of await db.getAll(store)) {
        local.set(recordKey(store, record.id), canonical(record));
      }
    }
    const shadow = new Map((await db.getAll('syncShadow')).map((s) => [s.key, s.json]));
    const plan = planSync(local, shadow, remote);

    if (plan.apply.length > 0 || plan.shadow.size > 0) {
      const tx = db.transaction([...SYNC_STORES, 'syncShadow'], 'readwrite');
      const shadowStore = tx.objectStore('syncShadow');
      await Promise.all([
        ...plan.apply.map((change) => {
          const store = tx.objectStore(change.store) as unknown as AnyStore;
          return change.data === null ? store.delete(change.id) : store.put(change.data);
        }),
        ...[...plan.shadow].map(([key, json]) =>
          json === null ? shadowStore.delete(key) : shadowStore.put({ key, json }),
        ),
        tx.done,
      ]);
    }

    // Reload before pushing: if the push below fails, the screens must still show what was just
    // written to IndexedDB — the next round would find nothing left to apply and never reload.
    if (wiped || plan.apply.length > 0) {
      // A brand-new account has no catalogue yet: give it the starter foods and meals. They are
      // pushed by the round the reload triggers.
      if (wiped) await seedIfEmpty();
      await this.data.reloadAll();
    }

    for (let i = 0; i < plan.push.length; i += PUSH_CHUNK) {
      const chunk = plan.push.slice(i, i + PUSH_CHUNK);
      const { error } = await client.from('records').upsert(
        chunk.map((change) => ({
          user_id: userId,
          store: change.store,
          id: change.id,
          data: change.data,
          deleted: change.data === null,
        })),
        { onConflict: 'user_id,store,id' },
      );
      if (error) throw error;
      const tx = db.transaction('syncShadow', 'readwrite');
      await Promise.all([
        ...chunk.map((change) => {
          const key = recordKey(change.store, change.id);
          return change.data === null
            ? tx.store.delete(key)
            : tx.store.put({ key, json: canonical(change.data) });
        }),
        tx.done,
      ]);
    }

    await db.put('syncMeta', { ...meta, cursor });
    return true;
  }

  /** Every row of the account changed at or after `cursor` (all rows when null), oldest first. */
  private async pull(
    client: SupabaseClient,
    userId: string,
    cursor: string | null,
  ): Promise<(RemoteRow & { updated_at: string })[]> {
    type Row = RemoteRow & { updated_at: string };
    const rows: Row[] = [];
    let last: Row | undefined;
    for (;;) {
      let query = client
        .from('records')
        .select('store,id,data,deleted,updated_at')
        .eq('user_id', userId);
      if (last) {
        // Keyset pagination: continue strictly after the last row seen. Offsets would skip a
        // row whenever another device writes during the pull and shifts the ordering.
        query = query.or(rowsAfter(last));
      } else if (cursor) {
        // `gte`, not `gt`: rows written in the same instant as the cursor row must not be skipped.
        query = query.gte('updated_at', cursor);
      }
      const { data, error } = await query
        .order('updated_at')
        .order('store')
        .order('id')
        .limit(PAGE_SIZE);
      if (error) throw error;
      rows.push(...(data as Row[]));
      if (data.length < PAGE_SIZE) return rows;
      last = rows.at(-1);
    }
  }
}
