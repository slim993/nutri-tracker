import { Injectable, computed, inject, signal } from '@angular/core';
import { dbTry, getDb } from './db';
import { FoodsService } from './foods.service';
import { macrosFor, newId, sumMacros, type Macros, type Meal } from './models';
import { LOCALE } from './i18n';

@Injectable({ providedIn: 'root' })
export class MealsService {
  private readonly foods = inject(FoodsService);
  private readonly _meals = signal<Meal[]>([]);

  readonly meals = computed(() =>
    [...this._meals()].sort((a, b) => a.name.localeCompare(b.name, LOCALE)),
  );

  get(id: string): Meal | undefined {
    return this._meals().find((m) => m.id === id);
  }

  /** Total macros of a meal, resolved against the current food list. */
  totals(meal: Meal): Macros {
    return sumMacros(
      meal.items.flatMap((item) => {
        const food = this.foods.get(item.foodId);
        return food ? [macrosFor(food, item.grams)] : [];
      }),
    );
  }

  async load(): Promise<void> {
    const db = await getDb();
    this._meals.set(await dbTry('lecture des repas types', () => db.getAll('meals')));
  }

  async create(data: Omit<Meal, 'id'>): Promise<Meal> {
    const meal: Meal = { ...data, id: newId() };
    const db = await getDb();
    await dbTry('création du repas type', () => db.put('meals', meal));
    this._meals.update((list) => [...list, meal]);
    return meal;
  }

  async update(meal: Meal): Promise<void> {
    const db = await getDb();
    await dbTry('mise à jour du repas type', () => db.put('meals', meal));
    this._meals.update((list) => list.map((m) => (m.id === meal.id ? meal : m)));
  }

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await dbTry('suppression du repas type', () => db.delete('meals', id));
    this._meals.update((list) => list.filter((m) => m.id !== id));
  }
}
