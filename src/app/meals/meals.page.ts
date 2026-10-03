import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClaudeBridgeService } from '../core/claude-bridge.service';
import { FoodsService } from '../core/foods.service';
import { LogService } from '../core/log.service';
import { MealsService } from '../core/meals.service';
import { ClaudePanel } from '../shared/claude-panel';
import { macrosFor, sumMacros, type Macros, type Meal, type MealItem } from '../core/models';
import { t } from '../core/i18n';

type Draft = Omit<Meal, 'id'> & { id?: string };

@Component({
  selector: 'app-meals',
  imports: [FormsModule, DecimalPipe, ClaudePanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './meals.page.html',
  styleUrl: './meals.page.scss',
})
export class MealsPage {
  protected readonly t = t;
  protected readonly meals = inject(MealsService);
  protected readonly foods = inject(FoodsService);
  private readonly claude = inject(ClaudeBridgeService);
  private readonly log = inject(LogService);

  /** Bound as inputs of the Claude panel. */
  protected readonly buildMealPrompt = () => this.claude.buildMealPlanPrompt();
  protected readonly importMealPlan = async (text: string): Promise<string> => {
    const plan = this.claude.parseMealPlan(text);
    const dates = [...new Set(plan.days.map((d) => d.date))];
    const conflicting = dates.filter((d) => this.log.forDate(d).length > 0);
    if (
      conflicting.length > 0 &&
      !confirm(
        t(
          'Le journal contient déjà des entrées pour {n} jour(s) du plan. Les remplacer par le plan ?',
          { n: conflicting.length },
        ),
      )
    ) {
      throw new Error(t('Import annulé.'));
    }
    return this.claude.applyMealPlan(plan, conflicting);
  };

  protected readonly draft = signal<Draft | null>(null);
  protected readonly newFoodId = signal('');
  protected readonly newGrams = signal(100);

  /** Live totals of the meal being edited. */
  protected readonly draftTotals = computed<Macros>(() => {
    const items = this.draft()?.items ?? [];
    return sumMacros(
      items.flatMap((item) => {
        const food = this.foods.get(item.foodId);
        return food ? [macrosFor(food, item.grams)] : [];
      }),
    );
  });

  protected startCreate(): void {
    this.draft.set({ name: '', items: [] });
    this.resetItemForm();
  }

  protected startEdit(meal: Meal): void {
    this.draft.set({ ...meal, items: meal.items.map((i) => ({ ...i })) });
    this.resetItemForm();
  }

  private resetItemForm(): void {
    this.newFoodId.set(this.foods.foods()[0]?.id ?? '');
    this.newGrams.set(100);
  }

  protected setName(name: string): void {
    this.draft.update((d) => (d ? { ...d, name } : d));
  }

  protected addItem(): void {
    const foodId = this.newFoodId();
    const grams = Number(this.newGrams());
    if (!foodId || !grams || grams <= 0) return;
    this.draft.update((d) => (d ? { ...d, items: [...d.items, { foodId, grams }] } : d));
    this.newGrams.set(100);
  }

  protected removeItem(index: number): void {
    this.draft.update((d) => (d ? { ...d, items: d.items.filter((_, i) => i !== index) } : d));
  }

  protected itemMacros(item: MealItem): Macros {
    const food = this.foods.get(item.foodId);
    return food ? macrosFor(food, item.grams) : { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  }

  protected async save(): Promise<void> {
    const draft = this.draft();
    if (!draft?.name.trim() || draft.items.length === 0) return;
    const data = { name: draft.name.trim(), items: draft.items };
    if (draft.id) await this.meals.update({ ...data, id: draft.id });
    else await this.meals.create(data);
    this.draft.set(null);
  }

  protected async remove(id: string): Promise<void> {
    if (!confirm(t('Supprimer ce repas type ?'))) return;
    await this.meals.remove(id);
    this.draft.set(null);
  }
}
