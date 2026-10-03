import { Injectable, inject, signal } from '@angular/core';
import { DbError, dbTry, getDb } from './db';
import { FoodsService } from './foods.service';
import { LogService } from './log.service';
import { MealsService } from './meals.service';
import { seedIfEmpty } from './seed';
import { SettingsService } from './settings.service';
import { WeightService } from './weight.service';
import { WorkoutsService } from './workouts.service';
import type { Food, LogEntry, Meal, Settings, WeightEntry, Workout } from './models';
import { t } from './i18n';

export interface BackupFile {
  app: 'nutri-tracker';
  version: 1;
  exportedAt: string;
  foods: Food[];
  meals: Meal[];
  logEntries: LogEntry[];
  weightEntries: WeightEntry[];
  settings: Settings | null;
  /** Absent from backups made before the workouts feature. */
  workouts?: Workout[];
}

/** Loads every store into memory and owns backup/restore of the whole database. */
@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly foods = inject(FoodsService);
  private readonly meals = inject(MealsService);
  private readonly log = inject(LogService);
  private readonly weight = inject(WeightService);
  private readonly settings = inject(SettingsService);
  private readonly workouts = inject(WorkoutsService);

  readonly ready = signal(false);
  readonly error = signal<string | null>(null);

  async init(): Promise<void> {
    try {
      await seedIfEmpty();
      await this.reloadAll();
      this.error.set(null);
      this.ready.set(true);
    } catch (err) {
      this.error.set(
        err instanceof DbError
          ? err.message
          : t(
              'Impossible de charger les données locales. Vérifie que le stockage du navigateur est autorisé.',
            ),
      );
      this.ready.set(true);
    }
  }

  /** Re-reads every store into its signal — sync calls it after applying remote changes. */
  async reloadAll(): Promise<void> {
    await Promise.all([
      this.foods.load(),
      this.meals.load(),
      this.log.load(),
      this.weight.load(),
      this.settings.load(),
      this.workouts.load(),
    ]);
  }

  async exportJson(): Promise<string> {
    const db = await getDb();
    const backup: BackupFile = await dbTry('export des données', async () => ({
      app: 'nutri-tracker',
      version: 1,
      exportedAt: new Date().toISOString(),
      foods: await db.getAll('foods'),
      meals: await db.getAll('meals'),
      logEntries: await db.getAll('logEntries'),
      weightEntries: await db.getAll('weightEntries'),
      settings: (await db.get('settings', 'settings')) ?? null,
      workouts: await db.getAll('workouts'),
    }));
    return JSON.stringify(backup, null, 2);
  }

  /** Replaces the whole database with the backup's contents. */
  async importJson(json: string): Promise<void> {
    let backup: BackupFile;
    try {
      backup = JSON.parse(json);
    } catch {
      throw new Error(t('Fichier illisible : ce n’est pas du JSON valide.'));
    }
    if (backup?.app !== 'nutri-tracker' || !Array.isArray(backup.foods)) {
      throw new Error(t('Ce fichier n’est pas une sauvegarde Nutri-Tracker.'));
    }

    const db = await getDb();
    await dbTry('import des données', async () => {
      const tx = db.transaction(
        ['foods', 'meals', 'logEntries', 'weightEntries', 'settings', 'workouts'],
        'readwrite',
      );
      await Promise.all([
        tx.objectStore('foods').clear(),
        tx.objectStore('meals').clear(),
        tx.objectStore('logEntries').clear(),
        tx.objectStore('weightEntries').clear(),
        tx.objectStore('settings').clear(),
        tx.objectStore('workouts').clear(),
      ]);
      await Promise.all([
        ...(backup.foods ?? []).map((f) => tx.objectStore('foods').put(f)),
        ...(backup.meals ?? []).map((m) => tx.objectStore('meals').put(m)),
        ...(backup.logEntries ?? []).map((e) => tx.objectStore('logEntries').put(e)),
        ...(backup.weightEntries ?? []).map((e) => tx.objectStore('weightEntries').put(e)),
        ...(backup.workouts ?? []).map((w) => tx.objectStore('workouts').put(w)),
        backup.settings ? tx.objectStore('settings').put(backup.settings) : Promise.resolve(),
        tx.done,
      ]);
    });
    await this.reloadAll();
  }

  /** Wipes everything, then re-seeds so the app is never left in an empty state. */
  async reset(): Promise<void> {
    const db = await getDb();
    await dbTry('réinitialisation', async () => {
      const tx = db.transaction(
        ['foods', 'meals', 'logEntries', 'weightEntries', 'settings', 'workouts'],
        'readwrite',
      );
      await Promise.all([
        tx.objectStore('foods').clear(),
        tx.objectStore('meals').clear(),
        tx.objectStore('logEntries').clear(),
        tx.objectStore('weightEntries').clear(),
        tx.objectStore('settings').clear(),
        tx.objectStore('workouts').clear(),
        tx.done,
      ]);
    });
    await seedIfEmpty();
    await this.reloadAll();
  }
}
