/** Stores mirrored to the server. Sync bookkeeping stores are deliberately absent. */
export const SYNC_STORES = [
  'foods',
  'meals',
  'logEntries',
  'weightEntries',
  'settings',
  'workouts',
] as const;

export type SyncStore = (typeof SYNC_STORES)[number];

/** A row of the server `records` table. */
export interface RemoteRow {
  store: SyncStore;
  id: string;
  data: unknown;
  deleted: boolean;
}

/** A record to write (`data`) or delete (`data === null`). */
export interface Change {
  store: SyncStore;
  id: string;
  data: unknown;
}

export interface SyncPlan {
  /** Remote changes to write into the local stores. */
  apply: Change[];
  /** Local changes to send to the server. */
  push: Change[];
  /** Shadow entries to set (`string`) or drop (`null`) once `apply` is written. */
  shadow: Map<string, string | null>;
}

export function recordKey(store: SyncStore, id: string): string {
  return `${store}:${id}`;
}

export function parseRecordKey(key: string): { store: SyncStore; id: string } {
  const i = key.indexOf(':');
  return { store: key.slice(0, i) as SyncStore, id: key.slice(i + 1) };
}

/**
 * JSON with object keys sorted, so the same record always yields the same
 * string — Postgres `jsonb` does not preserve key order.
 */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

/**
 * Decides what to write locally and what to send, given three views keyed by
 * `recordKey`: `local` (current records), `shadow` (records as last synced) and
 * the `remote` rows changed since the last pull.
 *
 * A record differing from its shadow is an unsent local change. When the same
 * record also changed remotely, the local change wins and is pushed.
 */
export function planSync(
  local: ReadonlyMap<string, string>,
  shadow: ReadonlyMap<string, string>,
  remote: RemoteRow[],
): SyncPlan {
  const apply: Change[] = [];
  const shadowUpdates = new Map<string, string | null>();
  const nextLocal = new Map(local);
  const nextShadow = new Map(shadow);

  for (const row of remote) {
    const key = recordKey(row.store, row.id);
    const remoteJson = row.deleted ? undefined : canonical(row.data);
    const localJson = local.get(key);
    const inSync = localJson === remoteJson;
    if (!inSync && localJson !== shadow.get(key)) continue;

    if (!inSync) apply.push({ store: row.store, id: row.id, data: row.deleted ? null : row.data });
    shadowUpdates.set(key, remoteJson ?? null);
    if (remoteJson === undefined) {
      nextLocal.delete(key);
      nextShadow.delete(key);
    } else {
      nextLocal.set(key, remoteJson);
      nextShadow.set(key, remoteJson);
    }
  }

  const push: Change[] = [];
  for (const key of new Set([...nextLocal.keys(), ...nextShadow.keys()])) {
    const json = nextLocal.get(key);
    if (json === nextShadow.get(key)) continue;
    push.push({ ...parseRecordKey(key), data: json === undefined ? null : JSON.parse(json) });
  }

  return { apply, push, shadow: shadowUpdates };
}
