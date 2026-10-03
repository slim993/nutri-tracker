import { Injectable, signal } from '@angular/core';
import { dbTry, getDb } from './db';
import type { Settings } from './models';

/** Neutral starting point shown in the welcome form — weights are left for the user to fill. */
export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  kcalTarget: 2000,
  proteinTarget: 120,
  carbsTarget: 220,
  fatTarget: 70,
  weightGoalKg: 0,
  startWeightKg: 0,
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly _settings = signal<Settings>(DEFAULT_SETTINGS);
  readonly settings = this._settings.asReadonly();

  /** False until the user has saved their own targets — `App` shows the welcome form meanwhile. */
  private readonly _configured = signal(false);
  readonly configured = this._configured.asReadonly();

  async load(): Promise<void> {
    const db = await getDb();
    const stored = await dbTry('lecture des réglages', () => db.get('settings', 'settings'));
    this._settings.set(stored ?? DEFAULT_SETTINGS);
    this._configured.set(stored !== undefined);
  }

  async save(settings: Settings): Promise<void> {
    const db = await getDb();
    await dbTry('enregistrement des réglages', () => db.put('settings', settings));
    this._settings.set(settings);
    this._configured.set(true);
  }
}
