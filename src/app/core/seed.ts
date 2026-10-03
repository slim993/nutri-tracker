import { getDb } from './db';
import { newId, toDateKey, type Food, type Meal, type Settings, type WeightEntry } from './models';
import { DEFAULT_SETTINGS } from './settings.service';

/** [name, kcal, protein, carbs, fat] per 100 g. */
const SEED_FOODS: [string, number, number, number, number][] = [
  ['Œuf entier', 143, 13, 1, 10],
  ['Flocons d’avoine', 380, 13, 60, 7],
  ['Poulet (blanc, cru)', 120, 23, 0, 2.5],
  ['Riz basmati (cru)', 350, 7, 78, 1],
  ['Fromage blanc 0%', 47, 8, 4, 0.2],
  ['Amandes', 600, 21, 6, 53],
  ['Saumon (cru)', 200, 20, 0, 13],
  ['Bœuf maigre 5% (cru)', 130, 21, 0, 5],
  ['Pommes de terre (crues)', 80, 2, 17, 0.1],
  ['Pain complet', 250, 9, 45, 3],
  ['Whey (pour 100 g)', 400, 80, 8, 6],
  ['Banane', 89, 1.1, 23, 0.3],
  ['Huile d’olive', 900, 0, 0, 100],
];

/** Foods used only as meal ingredients are not pinned as favorites. */
const NON_FAVORITE = new Set(['Banane', 'Huile d’olive']);

const SEED_MEALS: [string, [string, number][]][] = [
  [
    'Petit-déjeuner',
    [
      ['Œuf entier', 220],
      ['Flocons d’avoine', 60],
      ['Banane', 120],
    ],
  ],
  [
    'Déjeuner',
    [
      ['Poulet (blanc, cru)', 180],
      ['Riz basmati (cru)', 80],
      ['Huile d’olive', 10],
    ],
  ],
  [
    'Collation',
    [
      ['Fromage blanc 0%', 200],
      ['Amandes', 30],
      ['Banane', 120],
    ],
  ],
  [
    'Dîner',
    [
      ['Saumon (cru)', 200],
      ['Pommes de terre (crues)', 300],
    ],
  ],
  ['Avant-coucher', [['Whey (pour 100 g)', 30]]],
];

const INITIAL_WEIGHT_KG = 97;

/**
 * Populates the database on first launch. No-op once any food exists, so it never
 * fights with user data or re-runs after a manual reset + import.
 */
export async function seedIfEmpty(): Promise<boolean> {
  const db = await getDb();
  if ((await db.count('foods')) > 0) return false;

  const foods: Food[] = SEED_FOODS.map(([name, kcal, protein, carbs, fat]) => ({
    id: newId(),
    name,
    kcal,
    protein,
    carbs,
    fat,
    unit: 'g',
    isFavorite: !NON_FAVORITE.has(name),
  }));
  const idByName = new Map(foods.map((f) => [f.name, f.id]));

  const meals: Meal[] = SEED_MEALS.map(([name, items]) => ({
    id: newId(),
    name,
    items: items.map(([foodName, grams]) => ({ foodId: idByName.get(foodName)!, grams })),
  }));

  const settings: Settings = { ...DEFAULT_SETTINGS };
  const weight: WeightEntry = {
    id: newId(),
    date: toDateKey(new Date()),
    weightKg: INITIAL_WEIGHT_KG,
  };

  const tx = db.transaction(['foods', 'meals', 'settings', 'weightEntries'], 'readwrite');
  await Promise.all([
    ...foods.map((f) => tx.objectStore('foods').put(f)),
    ...meals.map((m) => tx.objectStore('meals').put(m)),
    tx.objectStore('settings').put(settings),
    tx.objectStore('weightEntries').put(weight),
    tx.done,
  ]);
  return true;
}
