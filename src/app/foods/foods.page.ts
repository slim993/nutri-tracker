import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FoodsService } from '../core/foods.service';
import type { Food } from '../core/models';
import { t } from '../core/i18n';

type Draft = Omit<Food, 'id' | 'unit'> & { id?: string };

const BLANK_DRAFT: Draft = {
  name: '',
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  isFavorite: false,
};

@Component({
  selector: 'app-foods',
  imports: [FormsModule, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './foods.page.html',
  styleUrl: './foods.page.scss',
})
export class FoodsPage {
  protected readonly t = t;
  protected readonly foods = inject(FoodsService);

  protected readonly query = signal('');
  protected readonly draft = signal<Draft | null>(null);

  /** Favorites first, then the rest — both already alphabetical. */
  protected readonly listed = computed(() => {
    const matching = this.foods.search(this.query());
    return [...matching.filter((f) => f.isFavorite), ...matching.filter((f) => !f.isFavorite)];
  });

  protected startCreate(): void {
    this.draft.set({ ...BLANK_DRAFT });
  }

  protected startEdit(food: Food): void {
    this.draft.set({ ...food });
  }

  protected patch<K extends keyof Draft>(key: K, value: Draft[K]): void {
    this.draft.update((d) => (d ? { ...d, [key]: value } : d));
  }

  protected async save(): Promise<void> {
    const draft = this.draft();
    if (!draft?.name.trim()) return;
    const data = {
      name: draft.name.trim(),
      kcal: Number(draft.kcal) || 0,
      protein: Number(draft.protein) || 0,
      carbs: Number(draft.carbs) || 0,
      fat: Number(draft.fat) || 0,
      isFavorite: draft.isFavorite,
    };
    if (draft.id) {
      await this.foods.update({ ...data, id: draft.id, unit: 'g' });
    } else {
      await this.foods.create(data);
    }
    this.draft.set(null);
  }

  protected async remove(id: string): Promise<void> {
    if (!confirm(t('Supprimer cet aliment ? Les entrées déjà loguées resteront sans détail.')))
      return;
    await this.foods.remove(id);
    this.draft.set(null);
  }
}
