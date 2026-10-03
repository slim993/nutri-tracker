import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Food, LogEntry, Meal, Settings, WeightEntry, Workout } from './models';

export interface NutriDB extends DBSchema {
  foods: { key: string; value: Food };
  meals: { key: string; value: Meal };
  logEntries: { key: string; value: LogEntry; indexes: { 'by-date': string } };
  weightEntries: { key: string; value: WeightEntry; indexes: { 'by-date': string } };
  settings: { key: string; value: Settings };
  workouts: { key: string; value: Workout; indexes: { 'by-date': string } };
}

export const DB_NAME = 'nutri-tracker';
export const DB_VERSION = 2; // v2: workouts store

/** Every store the app expects — used by the self-healing check below. */
const EXPECTED_STORES = [
  'foods',
  'meals',
  'logEntries',
  'weightEntries',
  'settings',
  'workouts',
] as const;

let dbPromise: Promise<IDBPDatabase<NutriDB>> | null = null;

function upgrade(db: IDBPDatabase<NutriDB>): void {
  if (!db.objectStoreNames.contains('foods')) {
    db.createObjectStore('foods', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('meals')) {
    db.createObjectStore('meals', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('logEntries')) {
    const store = db.createObjectStore('logEntries', { keyPath: 'id' });
    store.createIndex('by-date', 'date');
  }
  if (!db.objectStoreNames.contains('weightEntries')) {
    const store = db.createObjectStore('weightEntries', { keyPath: 'id' });
    store.createIndex('by-date', 'date');
  }
  if (!db.objectStoreNames.contains('settings')) {
    db.createObjectStore('settings', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('workouts')) {
    const store = db.createObjectStore('workouts', { keyPath: 'id' });
    store.createIndex('by-date', 'date');
  }
}

function openAt(version: number): Promise<IDBPDatabase<NutriDB>> {
  return openDB<NutriDB>(DB_NAME, version, {
    upgrade,
    blocked() {
      console.warn('[db] Un autre onglet bloque la mise à jour de la base — ferme-le.');
    },
    blocking(_v, _b, event) {
      // Another tab needs a newer version: release our connection and let the
      // next getDb() call reopen lazily at the new version.
      (event.target as IDBDatabase | null)?.close();
      dbPromise = null;
    },
    terminated() {
      dbPromise = null;
    },
  });
}

/**
 * Opens the database, then verifies every expected store exists. A store can
 * be missing if a past deploy bumped the version before its stores landed
 * (IndexedDB never replays an upgrade for a reached version) — in that case,
 * reopen at version+1 to force the upgrade to create what's missing.
 */
async function openAndHeal(): Promise<IDBPDatabase<NutriDB>> {
  let db = await openAt(DB_VERSION);
  const missing = EXPECTED_STORES.filter((s) => !db.objectStoreNames.contains(s));
  if (missing.length > 0) {
    console.warn(`[db] Stores manquants (${missing.join(', ')}) — migration de réparation.`);
    const next = db.version + 1;
    db.close();
    db = await openAt(next);
  }
  return db;
}

export function getDb(): Promise<IDBPDatabase<NutriDB>> {
  dbPromise ??= openAndHeal().catch((err) => {
    // Reset the memoized promise so a later call can retry (e.g. private mode, quota).
    dbPromise = null;
    throw new DbError('Impossible d’ouvrir la base locale.', err);
  });
  return dbPromise;
}

export class DbError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DbError';
  }
}

/** Wraps a DB operation so callers get a typed, user-presentable error. */
export async function dbTry<T>(label: string, op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    console.error(`[db] ${label}`, err);
    throw new DbError(`Erreur base de données : ${label}`, err);
  }
}
