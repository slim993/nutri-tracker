import { Injectable, inject } from '@angular/core';
import { FoodsService } from './foods.service';
import { LogService } from './log.service';
import { MealsService } from './meals.service';
import { SettingsService } from './settings.service';
import { WeightService } from './weight.service';
import { WorkoutsService } from './workouts.service';
import {
  MEAL_SLOTS,
  shiftDateKey,
  toDateKey,
  weightGoalLabel,
  type LogEntry,
  type MealSlot,
  type Workout,
  type WorkoutExercise,
} from './models';
import { LANG, t } from './i18n';

export interface ParsedMealPlan {
  /** New foods Claude introduced, per-100 g values. */
  newFoods: { name: string; kcal: number; protein: number; carbs: number; fat: number }[];
  days: {
    date: string;
    meals: { slot: MealSlot; items: { food: string; grams: number }[] }[];
  }[];
}

/**
 * The copy/paste bridge to the Claude app: builds a self-contained context
 * prompt, and parses the JSON plan Claude returns. No network, no API key —
 * the user carries the text across manually.
 */
@Injectable({ providedIn: 'root' })
export class ClaudeBridgeService {
  private readonly settings = inject(SettingsService);
  private readonly weight = inject(WeightService);
  private readonly log = inject(LogService);
  private readonly workouts = inject(WorkoutsService);
  private readonly foods = inject(FoodsService);
  private readonly meals = inject(MealsService);

  buildWorkoutPrompt(): string {
    const s = this.settings.settings();
    const today = toDateKey(new Date());
    const latest = this.weight.latest();

    const recentWeights = this.weight
      .entries()
      .slice(-8)
      .map((e) => `- ${e.date} : ${e.weightKg} kg`)
      .join('\n');

    const recentWorkouts = this.workouts
      .forRange(shiftDateKey(today, -28), today)
      .map(
        (w) =>
          `- ${w.date} ${w.done ? t('[faite]') : t('[prévue]')} ${w.name} : ` +
          w.exercises.map((e) => this.exerciseLabel(e)).join(', '),
      )
      .join('\n');

    const nutrition = this.recentNutritionSummary();

    if (LANG === 'en') return this.workoutPromptEn(recentWeights, recentWorkouts, nutrition);

    return `Tu es mon coach sportif. Programme-moi les séances d'entraînement de la semaine à venir.

## Mon profil
- Poids actuel : ${latest?.weightKg ?? s.startWeightKg} kg (départ ${s.startWeightKg} kg, objectif ${s.weightGoalKg} kg — ${weightGoalLabel(latest?.weightKg ?? s.startWeightKg, s.weightGoalKg)})
- Cibles nutrition quotidiennes : ${s.kcalTarget} kcal, ${s.proteinTarget} g protéines, ${s.carbsTarget} g glucides, ${s.fatTarget} g lipides

## Pesées récentes
${recentWeights || t('- (aucune)')}

## Nutrition des 7 derniers jours (moyennes réelles)
${nutrition}

## Séances des 4 dernières semaines
${recentWorkouts || t('- (aucune — pars sur un programme débutant/reprise progressif)')}

## Ce que j'attends
Propose un programme pour les 7 prochains jours (à partir du ${today}), cohérent avec mon historique et mon objectif. Explique brièvement tes choix, PUIS termine ta réponse par un bloc de code JSON strictement au format suivant (dates réelles au format YYYY-MM-DD, poids en kg ou champ omis pour le poids du corps) :

\`\`\`json
{
  "sessions": [
    {
      "date": "${today}",
      "name": "Push (pectoraux/épaules/triceps)",
      "notes": "optionnel",
      "exercises": [
        { "name": "Développé couché", "sets": 4, "reps": "8-10", "weightKg": 60 },
        { "name": "Pompes", "sets": 3, "reps": "max" }
      ]
    }
  ]
}
\`\`\`

Ce JSON sera importé tel quel dans mon application de suivi : n'invente pas d'autres champs et ne mets qu'un seul bloc JSON dans ta réponse.`;
  }

  /**
   * Parses the JSON plan pasted back from Claude. Accepts either a raw JSON
   * object or a full answer containing a \`\`\`json fenced block.
   */
  parseWorkoutPlan(text: string): Omit<Workout, 'id'>[] {
    const json = this.extractJson(text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error(t('JSON introuvable ou invalide. Colle la réponse complète de Claude.'));
    }

    const sessions = (parsed as { sessions?: unknown }).sessions;
    if (!Array.isArray(sessions) || sessions.length === 0) {
      throw new Error(t('Le JSON ne contient pas de tableau "sessions".'));
    }

    return sessions.map((raw, i) => {
      const session = raw as Record<string, unknown>;
      const date = String(session['date'] ?? '');
      const name = String(session['name'] ?? '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name) {
        throw new Error(t('Séance {n} : date (YYYY-MM-DD) ou nom manquant.', { n: i + 1 }));
      }
      const exercisesRaw = session['exercises'];
      if (!Array.isArray(exercisesRaw) || exercisesRaw.length === 0) {
        throw new Error(t('Séance {n} ({name}) : aucun exercice.', { n: i + 1, name }));
      }
      const exercises: WorkoutExercise[] = exercisesRaw.map((e) => {
        const ex = e as Record<string, unknown>;
        return {
          name: String(ex['name'] ?? t('Exercice')).trim(),
          sets: Number(ex['sets']) || 1,
          reps: String(ex['reps'] ?? '').trim() || '—',
          ...(ex['weightKg'] != null && Number(ex['weightKg']) > 0
            ? { weightKg: Number(ex['weightKg']) }
            : {}),
        };
      });
      return {
        date,
        name,
        exercises,
        done: false,
        ...(session['notes'] ? { notes: String(session['notes']) } : {}),
      };
    });
  }

  // --- Meal plan ---

  buildMealPlanPrompt(): string {
    const s = this.settings.settings();
    const today = toDateKey(new Date());
    const latest = this.weight.latest();

    const foods = this.foods
      .foods()
      .map(
        (f) =>
          `- ${f.name} — ${f.kcal} kcal, P ${f.protein}, ${t('G')} ${f.carbs}, ${t('L')} ${f.fat}` +
          (f.isFavorite ? t(' (favori)') : ''),
      )
      .join('\n');

    const meals = this.meals
      .meals()
      .map((m) => {
        const totals = this.meals.totals(m);
        const items = m.items.map((i) => `${this.foods.name(i.foodId)} ${i.grams} g`).join(' + ');
        return `- ${m.name} : ${items} (~${Math.round(totals.kcal)} kcal, P ${Math.round(totals.protein)})`;
      })
      .join('\n');

    if (LANG === 'en') return this.mealPlanPromptEn(foods, meals);

    return `Tu es mon coach nutrition. Planifie tous mes repas des 7 prochains jours (à partir du ${today}).

## Mon profil
- Poids actuel : ${latest?.weightKg ?? s.startWeightKg} kg, objectif ${s.weightGoalKg} kg (${weightGoalLabel(latest?.weightKg ?? s.startWeightKg, s.weightGoalKg)})
- Cibles quotidiennes : ${s.kcalTarget} kcal, ${s.proteinTarget} g protéines, ${s.carbsTarget} g glucides, ${s.fatTarget} g lipides

## Mes aliments (valeurs pour 100 g — réutilise ces noms EXACTS)
${foods || t('- (aucun)')}

## Mes repas types habituels (pour t'inspirer)
${meals || t('- (aucun)')}

## Nutrition récente
${this.recentNutritionSummary()}

## Ce que j'attends
- 7 jours complets, 4 à 5 repas par jour, chaque jour proche de mes cibles (±5 %).
- Priorité à mes aliments existants (noms exacts). Si tu introduis un nouvel aliment, déclare-le dans "newFoods" avec ses valeurs pour 100 g.
- Simple à cuisiner, varié, quantités réalistes en grammes (poids cru).

Explique brièvement tes choix, PUIS termine ta réponse par UN SEUL bloc de code JSON strictement au format suivant. Slots autorisés : "breakfast" (petit-déj), "lunch" (déjeuner), "snack" (collation), "dinner" (dîner), "other" (avant-coucher…) :

\`\`\`json
{
  "newFoods": [
    { "name": "Courgette", "kcal": 17, "protein": 1.2, "carbs": 3.1, "fat": 0.3 }
  ],
  "days": [
    {
      "date": "${today}",
      "meals": [
        { "slot": "breakfast", "items": [ { "food": "Œuf entier", "grams": 220 } ] }
      ]
    }
  ]
}
\`\`\`

Ce JSON sera importé tel quel dans mon application : n'invente pas d'autres champs et ne mets qu'un seul bloc JSON dans ta réponse.`;
  }

  parseMealPlan(text: string): ParsedMealPlan {
    const json = this.extractJson(text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error(t('JSON introuvable ou invalide. Colle la réponse complète de Claude.'));
    }

    const root = parsed as Record<string, unknown>;
    const daysRaw = root['days'];
    if (!Array.isArray(daysRaw) || daysRaw.length === 0) {
      throw new Error(t('Le JSON ne contient pas de tableau "days".'));
    }

    const validSlots = new Set<string>(MEAL_SLOTS.map((s) => s.id));
    const newFoods = (Array.isArray(root['newFoods']) ? root['newFoods'] : []).map((raw) => {
      const f = raw as Record<string, unknown>;
      const name = String(f['name'] ?? '').trim();
      if (!name) throw new Error(t('Un aliment de "newFoods" n’a pas de nom.'));
      return {
        name,
        kcal: Number(f['kcal']) || 0,
        protein: Number(f['protein']) || 0,
        carbs: Number(f['carbs']) || 0,
        fat: Number(f['fat']) || 0,
      };
    });

    const days = daysRaw.map((raw, i) => {
      const day = raw as Record<string, unknown>;
      const date = String(day['date'] ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error(
          t('Jour {n} : date manquante ou invalide (attendu YYYY-MM-DD).', { n: i + 1 }),
        );
      }
      const mealsRaw = day['meals'];
      if (!Array.isArray(mealsRaw) || mealsRaw.length === 0) {
        throw new Error(t('Jour {date} : aucun repas.', { date }));
      }
      const meals = mealsRaw.map((m) => {
        const meal = m as Record<string, unknown>;
        const slotRaw = String(meal['slot'] ?? 'other');
        const slot = (validSlots.has(slotRaw) ? slotRaw : 'other') as MealSlot;
        const itemsRaw = meal['items'];
        if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
          throw new Error(t('Jour {date} : un repas est vide.', { date }));
        }
        const items = itemsRaw.map((it) => {
          const item = it as Record<string, unknown>;
          const food = String(item['food'] ?? '').trim();
          const grams = Number(item['grams']);
          if (!food || !grams || grams <= 0) {
            throw new Error(t('Jour {date} : aliment ou quantité invalide.', { date }));
          }
          return { food, grams };
        });
        return { slot, items };
      });
      return { date, meals };
    });

    return { newFoods, days };
  }

  /**
   * Writes a parsed plan into the journal. Creates the plan's new foods first,
   * clears the days listed in `replaceDates`, then bulk-inserts the entries.
   * Throws before any write if the plan references unknown foods.
   */
  async applyMealPlan(plan: ParsedMealPlan, replaceDates: string[] = []): Promise<string> {
    const nameKey = (n: string) => n.trim().toLowerCase();
    const known = new Map(this.foods.foods().map((f) => [nameKey(f.name), f.id]));

    const missing = new Set<string>();
    for (const day of plan.days) {
      for (const meal of day.meals) {
        for (const item of meal.items) {
          const key = nameKey(item.food);
          if (!known.has(key) && !plan.newFoods.some((f) => nameKey(f.name) === key)) {
            missing.add(item.food);
          }
        }
      }
    }
    if (missing.size > 0) {
      throw new Error(
        t('Aliments inconnus : {names}. Demande à Claude de les déclarer dans "newFoods".', {
          names: [...missing].join(', '),
        }),
      );
    }

    for (const f of plan.newFoods) {
      if (known.has(nameKey(f.name))) continue; // already exists — reuse
      const created = await this.foods.create({ ...f, isFavorite: false });
      known.set(nameKey(f.name), created.id);
    }

    const entries: Omit<LogEntry, 'id'>[] = plan.days.flatMap((day) =>
      day.meals.flatMap((meal) =>
        meal.items.map((item) => ({
          date: day.date,
          slot: meal.slot,
          foodId: known.get(nameKey(item.food))!,
          grams: item.grams,
        })),
      ),
    );

    if (replaceDates.length > 0) await this.log.removeForDates(replaceDates);
    await this.log.addMany(entries);

    const created = plan.newFoods.length;
    return created > 0
      ? t('{days} jour(s) planifié(s) dans le journal (+{foods} nouvel(aux) aliment(s)).', {
          days: plan.days.length,
          foods: created,
        })
      : t('{days} jour(s) planifié(s) dans le journal.', { days: plan.days.length });
  }

  // --- English versions of the two prompts. The JSON contract is identical in both languages. ---

  private workoutPromptEn(
    recentWeights: string,
    recentWorkouts: string,
    nutrition: string,
  ): string {
    const s = this.settings.settings();
    const today = toDateKey(new Date());
    const current = this.weight.latest()?.weightKg ?? s.startWeightKg;

    return `You are my fitness coach. Plan my training sessions for the coming week.

## My profile
- Current weight: ${current} kg (started at ${s.startWeightKg} kg, goal ${s.weightGoalKg} kg — ${weightGoalLabel(current, s.weightGoalKg)})
- Daily nutrition targets: ${s.kcalTarget} kcal, ${s.proteinTarget} g protein, ${s.carbsTarget} g carbs, ${s.fatTarget} g fat

## Recent weigh-ins
${recentWeights || t('- (aucune)')}

## Nutrition over the last 7 days (actual averages)
${nutrition}

## Sessions of the last 4 weeks
${recentWorkouts || t('- (aucune — pars sur un programme débutant/reprise progressif)')}

## What I expect
Suggest a programme for the next 7 days (starting ${today}), consistent with my history and my goal. Briefly explain your choices, THEN end your answer with a JSON code block in exactly this format (real dates as YYYY-MM-DD, weights in kg, or the field left out for bodyweight):

\`\`\`json
{
  "sessions": [
    {
      "date": "${today}",
      "name": "Push (chest/shoulders/triceps)",
      "notes": "optional",
      "exercises": [
        { "name": "Bench press", "sets": 4, "reps": "8-10", "weightKg": 60 },
        { "name": "Push-ups", "sets": 3, "reps": "max" }
      ]
    }
  ]
}
\`\`\`

This JSON will be imported as is into my tracking app: do not invent other fields and put only one JSON block in your answer.`;
  }

  private mealPlanPromptEn(foods: string, meals: string): string {
    const s = this.settings.settings();
    const today = toDateKey(new Date());
    const current = this.weight.latest()?.weightKg ?? s.startWeightKg;

    return `You are my nutrition coach. Plan all my meals for the next 7 days (starting ${today}).

## My profile
- Current weight: ${current} kg, goal ${s.weightGoalKg} kg (${weightGoalLabel(current, s.weightGoalKg)})
- Daily targets: ${s.kcalTarget} kcal, ${s.proteinTarget} g protein, ${s.carbsTarget} g carbs, ${s.fatTarget} g fat

## My foods (values per 100 g — reuse these EXACT names)
${foods || t('- (aucun)')}

## My usual meals (for inspiration)
${meals || t('- (aucun)')}

## Recent nutrition
${this.recentNutritionSummary()}

## What I expect
- 7 full days, 4 to 5 meals a day, each day close to my targets (±5%).
- Prefer my existing foods (exact names). If you introduce a new food, declare it in "newFoods" with its values per 100 g.
- Easy to cook, varied, realistic quantities in grams (raw weight).

Briefly explain your choices, THEN end your answer with ONE SINGLE JSON code block in exactly this format. Allowed slots: "breakfast", "lunch", "snack", "dinner", "other" (e.g. before bed):

\`\`\`json
{
  "newFoods": [
    { "name": "Courgette", "kcal": 17, "protein": 1.2, "carbs": 3.1, "fat": 0.3 }
  ],
  "days": [
    {
      "date": "${today}",
      "meals": [
        { "slot": "breakfast", "items": [ { "food": "Whole egg", "grams": 220 } ] }
      ]
    }
  ]
}
\`\`\`

This JSON will be imported as is into my app: do not invent other fields and put only one JSON block in your answer.`;
  }

  private extractJson(text: string): string {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return fenced[1].trim();
    // No fence: take from the first { to the last } so surrounding prose is ignored.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return text.slice(start, end + 1);
    return text.trim();
  }

  private exerciseLabel(e: WorkoutExercise): string {
    const planned = `${e.name} ${e.sets}×${e.reps}${e.weightKg ? ` @${e.weightKg} kg` : ''}`;
    if (!e.performed?.length) return planned;
    const done = e.performed.map((p) => `${p.weightKg || 0}kg×${p.reps}`).join(', ');
    return t('{planned} (réalisé : {done})', { planned, done });
  }

  private recentNutritionSummary(): string {
    const today = toDateKey(new Date());
    const days = this.log.loggedDates().filter((d) => d >= shiftDateKey(today, -7) && d <= today);
    if (days.length === 0) return t('- (aucune entrée au journal)');
    const totals = days.map((d) => this.log.totalsForDate(d));
    const avg = (pick: (day: (typeof totals)[0]) => number) =>
      Math.round(totals.reduce((sum, day) => sum + pick(day), 0) / totals.length);
    return t(
      '- {kcal} kcal/j, {protein} g protéines/j, {carbs} g glucides/j, {fat} g lipides/j (sur {days} jours logués)',
      {
        kcal: avg((d) => d.kcal),
        protein: avg((d) => d.protein),
        carbs: avg((d) => d.carbs),
        fat: avg((d) => d.fat),
        days: days.length,
      },
    );
  }
}
