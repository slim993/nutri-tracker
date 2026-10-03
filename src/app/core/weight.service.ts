import { Injectable, computed, signal } from '@angular/core';
import { dbTry, getDb } from './db';
import { newId, type WeightEntry } from './models';

@Injectable({ providedIn: 'root' })
export class WeightService {
  private readonly _entries = signal<WeightEntry[]>([]);

  /** Oldest first — every chart and average below relies on this order. */
  readonly entries = computed(() =>
    [...this._entries()].sort((a, b) => a.date.localeCompare(b.date)),
  );

  readonly latest = computed(() => this.entries().at(-1));
  readonly first = computed(() => this.entries().at(0));

  /** 7-day rolling average, aligned with `entries()`. */
  readonly movingAverage = computed(() => {
    const list = this.entries();
    return list.map((entry, i) => {
      const window = list.slice(Math.max(0, i - 6), i + 1);
      const sum = window.reduce((acc, e) => acc + e.weightKg, 0);
      return { date: entry.date, weightKg: sum / window.length };
    });
  });

  async load(): Promise<void> {
    const db = await getDb();
    this._entries.set(await dbTry('lecture des pesées', () => db.getAll('weightEntries')));
  }

  /** One weigh-in per day: re-adding the same date overwrites it. */
  async add(date: string, weightKg: number): Promise<void> {
    const existing = this._entries().find((e) => e.date === date);
    const entry: WeightEntry = { id: existing?.id ?? newId(), date, weightKg };
    const db = await getDb();
    await dbTry('enregistrement de la pesée', () => db.put('weightEntries', entry));
    this._entries.update((list) =>
      existing ? list.map((e) => (e.id === entry.id ? entry : e)) : [...list, entry],
    );
  }

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await dbTry('suppression de la pesée', () => db.delete('weightEntries', id));
    this._entries.update((list) => list.filter((e) => e.id !== id));
  }
}
