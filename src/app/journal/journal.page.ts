import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LogService, type ResolvedEntry } from '../core/log.service';
import { SettingsService } from '../core/settings.service';
import { MacroProgress } from '../shared/macro-progress';
import { AddSheet } from './add-sheet';
import {
  MEAL_SLOTS,
  fromDateKey,
  shiftDateKey,
  toDateKey,
  type Macros,
  type MealSlot,
} from '../core/models';
import { LOCALE, t } from '../core/i18n';

interface SlotGroup {
  id: MealSlot;
  label: string;
  entries: ResolvedEntry[];
  kcal: number;
}

@Component({
  selector: 'app-journal',
  imports: [FormsModule, DecimalPipe, MacroProgress, AddSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './journal.page.html',
  styleUrl: './journal.page.scss',
})
export class JournalPage {
  protected readonly t = t;
  private readonly log = inject(LogService);
  private readonly settings = inject(SettingsService);

  protected readonly date = signal(toDateKey(new Date()));
  protected readonly sheetSlot = signal<MealSlot | null>(null);
  protected readonly editing = signal<ResolvedEntry | null>(null);
  protected readonly editGrams = signal(0);

  protected readonly totals = computed<Macros>(() => this.log.totalsForDate(this.date()));

  protected readonly targets = computed<Macros>(() => {
    const s = this.settings.settings();
    return {
      kcal: s.kcalTarget,
      protein: s.proteinTarget,
      carbs: s.carbsTarget,
      fat: s.fatTarget,
    };
  });

  protected readonly groups = computed<SlotGroup[]>(() => {
    const grouped = this.log.groupedForDate(this.date());
    return MEAL_SLOTS.map(({ id, label }) => {
      const entries = grouped.get(id) ?? [];
      return {
        id,
        label,
        entries,
        kcal: entries.reduce((sum, e) => sum + e.macros.kcal, 0),
      };
    }).filter((g) => g.entries.length > 0);
  });

  protected readonly isToday = computed(() => this.date() === toDateKey(new Date()));

  protected readonly prettyDate = computed(() =>
    fromDateKey(this.date()).toLocaleDateString(LOCALE, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
  );

  protected shift(days: number): void {
    this.date.set(shiftDateKey(this.date(), days));
  }

  protected today(): void {
    this.date.set(toDateKey(new Date()));
  }

  protected startEdit(resolved: ResolvedEntry): void {
    this.editGrams.set(resolved.entry.grams);
    this.editing.set(resolved);
  }

  protected async saveEdit(): Promise<void> {
    const current = this.editing();
    const grams = Number(this.editGrams());
    if (!current || !grams || grams <= 0) return;
    await this.log.update({ ...current.entry, grams });
    this.editing.set(null);
  }

  protected async remove(id: string): Promise<void> {
    await this.log.remove(id);
    if (this.editing()?.entry.id === id) this.editing.set(null);
  }
}
