import { Injectable, computed, signal } from '@angular/core';
import { dbTry, getDb } from './db';
import { newId, type Workout } from './models';

@Injectable({ providedIn: 'root' })
export class WorkoutsService {
  private readonly _workouts = signal<Workout[]>([]);

  /** Sorted by planned date, oldest first. */
  readonly workouts = computed(() =>
    [...this._workouts()].sort((a, b) => a.date.localeCompare(b.date)),
  );

  forRange(from: string, to: string): Workout[] {
    return this.workouts().filter((w) => w.date >= from && w.date <= to);
  }

  async load(): Promise<void> {
    const db = await getDb();
    this._workouts.set(await dbTry('lecture des séances', () => db.getAll('workouts')));
  }

  async create(data: Omit<Workout, 'id'>): Promise<Workout> {
    const workout: Workout = { ...data, id: newId() };
    const db = await getDb();
    await dbTry('création de la séance', () => db.put('workouts', workout));
    this._workouts.update((list) => [...list, workout]);
    return workout;
  }

  /** Bulk insert used by the Claude plan import — one transaction. */
  async createMany(items: Omit<Workout, 'id'>[]): Promise<void> {
    const workouts: Workout[] = items.map((w) => ({ ...w, id: newId() }));
    const db = await getDb();
    await dbTry('import du plan', async () => {
      const tx = db.transaction('workouts', 'readwrite');
      await Promise.all([...workouts.map((w) => tx.store.put(w)), tx.done]);
    });
    this._workouts.update((list) => [...list, ...workouts]);
  }

  async update(workout: Workout): Promise<void> {
    const db = await getDb();
    await dbTry('mise à jour de la séance', () => db.put('workouts', workout));
    this._workouts.update((list) => list.map((w) => (w.id === workout.id ? workout : w)));
  }

  async toggleDone(id: string): Promise<void> {
    const workout = this._workouts().find((w) => w.id === id);
    if (!workout) return;
    await this.update({ ...workout, done: !workout.done });
  }

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await dbTry('suppression de la séance', () => db.delete('workouts', id));
    this._workouts.update((list) => list.filter((w) => w.id !== id));
  }
}
