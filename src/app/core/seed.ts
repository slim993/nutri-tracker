import { getDb } from './db';
import { t } from './i18n';
import { newId, type Food, type Meal } from './models';

/** [French name — translated when seeding —, kcal, protein, carbs, fat] per 100 g. */
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

/**
 * Populates the food and meal catalogue on first launch — nothing personal: targets and
 * weight come from the welcome form. No-op once any food exists, so it never
 * fights with user data or re-runs after a manual reset + import.
 */
export async function seedIfEmpty(): Promise<boolean> {
  const db = await getDb();
  if ((await db.count('foods')) > 0) return false;

  // Seeded once, in the language of the first launch; the user can rename anything afterwards.
  const idByName = new Map<string, string>();
  const foods: Food[] = SEED_FOODS.map(([name, kcal, protein, carbs, fat]) => {
    const id = newId();
    idByName.set(name, id);
    return {
      id,
      name: t(name),
      kcal,
      protein,
      carbs,
      fat,
      unit: 'g',
      isFavorite: !NON_FAVORITE.has(name),
    };
  });

  const meals: Meal[] = SEED_MEALS.map(([name, items]) => ({
    id: newId(),
    name: t(name),
    items: items.map(([foodName, grams]) => ({ foodId: idByName.get(foodName)!, grams })),
  }));

  const tx = db.transaction(['foods', 'meals'], 'readwrite');
  await Promise.all([
    ...foods.map((f) => tx.objectStore('foods').put(f)),
    ...meals.map((m) => tx.objectStore('meals').put(m)),
    tx.done,
  ]);
  return true;
}
