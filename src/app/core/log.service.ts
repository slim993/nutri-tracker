import { Injectable, computed, inject, signal } from '@angular/core';
import { dbTry, getDb } from './db';
import { FoodsService } from './foods.service';
import { MealsService } from './meals.service';
import {
  EMPTY_MACROS,
  macrosFor,
  newId,
  sumMacros,
  type LogEntry,
  type Macros,
  type MealSlot,
} from './models';
import { t } from './i18n';

export interface ResolvedEntry {
  entry: LogEntry;
  foodName: string;
  macros: Macros;
}

@Injectable({ providedIn: 'root' })
export class LogService {
  private readonly foods = inject(FoodsService);
  private readonly meals = inject(MealsService);

  private readonly _entries = signal<LogEntry[]>([]);
  readonly entries = this._entries.asReadonly();

  /** All entries indexed by date key, so day lookups stay O(1). */
  private readonly byDate = computed(() => {
    const map = new Map<string, LogEntry[]>();
    for (const entry of this._entries()) {
      const list = map.get(entry.date);
      if (list) list.push(entry);
      else map.set(entry.date, [entry]);
    }
    return map;
  });

  forDate(date: string): LogEntry[] {
    return this.byDate().get(date) ?? [];
  }

  resolve(entry: LogEntry): ResolvedEntry {
    const food = this.foods.get(entry.foodId);
    return {
      entry,
      foodName: food?.name ?? t('Aliment supprimé'),
      macros: food ? macrosFor(food, entry.grams) : EMPTY_MACROS,
    };
  }

  /** Entries of a day grouped by meal slot, in slot order. */
  groupedForDate(date: string): Map<MealSlot, ResolvedEntry[]> {
    const grouped = new Map<MealSlot, ResolvedEntry[]>();
    for (const entry of this.forDate(date)) {
      const list = grouped.get(entry.slot) ?? [];
      list.push(this.resolve(entry));
      grouped.set(entry.slot, list);
    }
    return grouped;
  }

  totalsForDate(date: string): Macros {
    return sumMacros(this.forDate(date).map((e) => this.resolve(e).macros));
  }

  /** Distinct dates that have at least one entry, oldest first. */
  loggedDates(): string[] {
    return [...this.byDate().keys()].sort();
  }

  async load(): Promise<void> {
    const db = await getDb();
    this._entries.set(await dbTry('lecture du journal', () => db.getAll('logEntries')));
  }

  async add(data: Omit<LogEntry, 'id'>): Promise<void> {
    const entry: LogEntry = { ...data, id: newId() };
    const db = await getDb();
    await dbTry('ajout au journal', () => db.put('logEntries', entry));
    this._entries.update((list) => [...list, entry]);
  }

  /** Bulk insert used by the Claude meal-plan import — one transaction. */
  async addMany(data: Omit<LogEntry, 'id'>[]): Promise<void> {
    const entries: LogEntry[] = data.map((e) => ({ ...e, id: newId() }));
    const db = await getDb();
    await dbTry('import du plan de repas', async () => {
      const tx = db.transaction('logEntries', 'readwrite');
      await Promise.all([...entries.map((e) => tx.store.put(e)), tx.done]);
    });
    this._entries.update((list) => [...list, ...entries]);
  }

  /** Clears whole days — used when re-importing a plan over existing entries. */
  async removeForDates(dates: string[]): Promise<void> {
    const target = new Set(dates);
    const ids = this._entries()
      .filter((e) => target.has(e.date))
      .map((e) => e.id);
    if (ids.length === 0) return;
    const db = await getDb();
    await dbTry('remplacement des jours', async () => {
      const tx = db.transaction('logEntries', 'readwrite');
      await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
    });
    this._entries.update((list) => list.filter((e) => !target.has(e.date)));
  }

  /** Logs every item of a meal type as individual entries — one tap from the journal. */
  async addMeal(mealId: string, date: string, slot: MealSlot): Promise<void> {
    const meal = this.meals.get(mealId);
    if (!meal) return;
    const entries: LogEntry[] = meal.items.map((item) => ({
      id: newId(),
      date,
      slot,
      foodId: item.foodId,
      grams: item.grams,
      mealId,
    }));
    const db = await getDb();
    await dbTry('ajout du repas au journal', async () => {
      const tx = db.transaction('logEntries', 'readwrite');
      await Promise.all([...entries.map((e) => tx.store.put(e)), tx.done]);
    });
    this._entries.update((list) => [...list, ...entries]);
  }

  async update(entry: LogEntry): Promise<void> {
    const db = await getDb();
    await dbTry('mise à jour de l’entrée', () => db.put('logEntries', entry));
    this._entries.update((list) => list.map((e) => (e.id === entry.id ? entry : e)));
  }

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await dbTry('suppression de l’entrée', () => db.delete('logEntries', id));
    this._entries.update((list) => list.filter((e) => e.id !== id));
  }
}
