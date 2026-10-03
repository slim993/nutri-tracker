import { Injectable, signal } from '@angular/core';
import { dbTry, getDb } from './db';
import type { Settings } from './models';

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  kcalTarget: 2300,
  proteinTarget: 195,
  carbsTarget: 215,
  fatTarget: 75,
  weightGoalKg: 85,
  startWeightKg: 106.7,
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly _settings = signal<Settings>(DEFAULT_SETTINGS);
  readonly settings = this._settings.asReadonly();

  async load(): Promise<void> {
    const db = await getDb();
    const stored = await dbTry('lecture des réglages', () => db.get('settings', 'settings'));
    this._settings.set(stored ?? DEFAULT_SETTINGS);
  }

  async save(settings: Settings): Promise<void> {
    const db = await getDb();
    await dbTry('enregistrement des réglages', () => db.put('settings', settings));
    this._settings.set(settings);
  }
}
