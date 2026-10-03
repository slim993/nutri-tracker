import type { CoachProfile } from './coach';

export type MealSlot = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'other';

export const MEAL_SLOTS: { id: MealSlot; label: string }[] = [
  { id: 'breakfast', label: 'Petit-déj' },
  { id: 'lunch', label: 'Déjeuner' },
  { id: 'snack', label: 'Collation' },
  { id: 'dinner', label: 'Dîner' },
  { id: 'other', label: 'Autre' },
];

/** Macros for a given amount (already scaled, not per 100 g). */
export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Food extends Macros {
  id: string;
  name: string;
  /** All macro values above are expressed per 100 g. */
  unit: 'g';
  isFavorite: boolean;
}

export interface MealItem {
  foodId: string;
  grams: number;
}

export interface Meal {
  id: string;
  name: string;
  items: MealItem[];
}

export interface LogEntry {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  slot: MealSlot;
  foodId: string;
  grams: number;
  /** Set when the entry was logged as part of a whole meal, for grouping/undo. */
  mealId?: string;
}

export interface WeightEntry {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  weightKg: number;
}

/** One set actually performed, logged by the user during/after the session. */
export interface PerformedSet {
  weightKg: number;
  reps: number;
}

export interface WorkoutExercise {
  name: string;
  sets: number;
  /** Free text so ranges and durations work: "8-12", "5", "30 s". */
  reps: string;
  weightKg?: number;
  /** What was actually done, per set. Absent until the user logs it. */
  performed?: PerformedSet[];
}

export interface Workout {
  id: string;
  /** YYYY-MM-DD — planned day of the session. */
  date: string;
  name: string;
  exercises: WorkoutExercise[];
  done: boolean;
  notes?: string;
}

export interface Settings {
  id: 'settings';
  kcalTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  weightGoalKg: number;
  startWeightKg: number;
  /** Last questionnaire answers, kept to prefill it; absent if it was skipped. */
  profile?: CoachProfile;
}

/** How the Claude prompts describe the user's aim, from where they are and where they want to be. */
export function weightGoalLabel(currentKg: number, goalKg: number): string {
  if (goalKg < currentKg) return 'perte de poids en préservant le muscle';
  if (goalKg > currentKg) return 'prise de poids, surtout du muscle';
  return 'maintien du poids';
}

export const EMPTY_MACROS: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

/** Scales a food's per-100 g values to the given amount in grams. */
export function macrosFor(food: Macros, grams: number): Macros {
  const k = grams / 100;
  return {
    kcal: food.kcal * k,
    protein: food.protein * k,
    carbs: food.carbs * k,
    fat: food.fat * k,
  };
}

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  };
}

export function sumMacros(list: Macros[]): Macros {
  return list.reduce(addMacros, EMPTY_MACROS);
}

/** YYYY-MM-DD in local time (never UTC — the day must match the user's day). */
export function toDateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function shiftDateKey(key: string, days: number): string {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function newId(): string {
  return crypto.randomUUID();
}
