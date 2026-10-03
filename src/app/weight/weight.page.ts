import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import type { ChartConfiguration } from 'chart.js';
import { SettingsService } from '../core/settings.service';
import { WeightService } from '../core/weight.service';
import { fromDateKey, toDateKey } from '../core/models';
import { LINE_CHART_OPTIONS } from '../shared/chart-defaults';

@Component({
  selector: 'app-weight',
  imports: [FormsModule, DecimalPipe, BaseChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './weight.page.html',
  styleUrl: './weight.page.scss',
})
export class WeightPage {
  protected readonly weight = inject(WeightService);
  private readonly settingsService = inject(SettingsService);

  protected readonly settings = this.settingsService.settings;
  protected readonly newDate = signal(toDateKey(new Date()));
  protected readonly newWeight = signal<number | null>(null);

  protected readonly current = computed(
    () => this.weight.latest()?.weightKg ?? this.settings().startWeightKg,
  );

  /** Change since the configured starting weight (negative = loss). */
  protected readonly sinceStart = computed(() => this.current() - this.settings().startWeightKg);
  protected readonly toGoal = computed(() => this.current() - this.settings().weightGoalKg);

  protected readonly chartOptions = LINE_CHART_OPTIONS;

  protected readonly chartData = computed<ChartConfiguration<'line'>['data']>(() => {
    const entries = this.weight.entries();
    const goal = this.settings().weightGoalKg;
    return {
      labels: entries.map((e) =>
        fromDateKey(e.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      ),
      datasets: [
        {
          data: entries.map((e) => e.weightKg),
          label: 'Poids (kg)',
          borderColor: '#4ade80',
          backgroundColor: 'rgba(74, 222, 128, 0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
        },
        {
          data: entries.map(() => goal),
          label: 'Objectif',
          borderColor: '#f59e0b',
          borderDash: [6, 6],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
      ],
    };
  });

  protected async add(): Promise<void> {
    const value = Number(this.newWeight());
    if (!value || value <= 0) return;
    await this.weight.add(this.newDate(), value);
    this.newWeight.set(null);
  }

  protected async remove(id: string): Promise<void> {
    await this.weight.remove(id);
  }

  protected pretty(date: string): string {
    return fromDateKey(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    });
  }
}
