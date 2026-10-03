import { Injectable, computed, signal } from '@angular/core';
import { dbTry, getDb } from './db';
import { newId, type Food } from './models';
import { LOCALE, t } from './i18n';

@Injectable({ providedIn: 'root' })
export class FoodsService {
  private readonly _foods = signal<Food[]>([]);

  readonly foods = computed(() =>
    [...this._foods()].sort((a, b) => a.name.localeCompare(b.name, LOCALE)),
  );
  readonly favorites = computed(() => this.foods().filter((f) => f.isFavorite));

  private readonly byId = computed(() => new Map(this._foods().map((f) => [f.id, f])));

  get(id: string): Food | undefined {
    return this.byId().get(id);
  }

  name(id: string): string {
    return this.get(id)?.name ?? t('Aliment supprimé');
  }

  search(query: string): Food[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.foods();
    return this.foods().filter((f) => f.name.toLowerCase().includes(q));
  }

  async load(): Promise<void> {
    const db = await getDb();
    this._foods.set(await dbTry('lecture des aliments', () => db.getAll('foods')));
  }

  async create(data: Omit<Food, 'id' | 'unit'>): Promise<Food> {
    const food: Food = { ...data, id: newId(), unit: 'g' };
    const db = await getDb();
    await dbTry('création de l’aliment', () => db.put('foods', food));
    this._foods.update((list) => [...list, food]);
    return food;
  }

  async update(food: Food): Promise<void> {
    const db = await getDb();
    await dbTry('mise à jour de l’aliment', () => db.put('foods', food));
    this._foods.update((list) => list.map((f) => (f.id === food.id ? food : f)));
  }

  async toggleFavorite(id: string): Promise<void> {
    const food = this.get(id);
    if (!food) return;
    await this.update({ ...food, isFavorite: !food.isFavorite });
  }

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await dbTry('suppression de l’aliment', () => db.delete('foods', id));
    this._foods.update((list) => list.filter((f) => f.id !== id));
  }
}
