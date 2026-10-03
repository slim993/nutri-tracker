import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import type { ChartConfiguration } from 'chart.js';
import { LogService } from '../core/log.service';
import { SettingsService } from '../core/settings.service';
import { WeightService } from '../core/weight.service';
import { fromDateKey, toDateKey } from '../core/models';
import { BAR_CHART_OPTIONS, LINE_CHART_OPTIONS } from '../shared/chart-defaults';
import { LOCALE, t } from '../core/i18n';

/** Monday of the ISO week containing `date`, as a date key. */
function weekStart(date: string): string {
  const d = fromDateKey(date);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return toDateKey(d);
}

const MS_PER_WEEK = 7 * 24 * 3600 * 1000;

@Component({
  selector: 'app-stats',
  imports: [DecimalPipe, BaseChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stats.page.html',
  styleUrl: './stats.page.scss',
})
export class StatsPage {
  protected readonly t = t;
  private readonly log = inject(LogService);
  private readonly weight = inject(WeightService);
  private readonly settingsService = inject(SettingsService);

  protected readonly settings = this.settingsService.settings;
  protected readonly barOptions = BAR_CHART_OPTIONS;
  protected readonly lineOptions = LINE_CHART_OPTIONS;

  /**
   * Per-day kcal and protein totals, oldest first. Future dates are excluded:
   * a Claude meal plan pre-fills coming days, and those are intentions, not
   * consumption — they must not distort averages or adherence.
   */
  private readonly dailyTotals = computed(() => {
    const today = toDateKey(new Date());
    return this.log
      .loggedDates()
      .filter((date) => date <= today)
      .map((date) => ({ date, ...this.log.totalsForDate(date) }));
  });

  /** Mean daily kcal per calendar week (weeks with no log are skipped). */
  private readonly weeklyKcal = computed(() => {
    const byWeek = new Map<string, number[]>();
    for (const day of this.dailyTotals()) {
      const key = weekStart(day.date);
      byWeek.set(key, [...(byWeek.get(key) ?? []), day.kcal]);
    }
    return [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([week, values]) => ({
        week,
        average: values.reduce((a, b) => a + b, 0) / values.length,
      }));
  });

  protected readonly kcalChart = computed<ChartConfiguration<'bar'>['data']>(() => {
    const weeks = this.weeklyKcal();
    return {
      labels: weeks.map((w) =>
        fromDateKey(w.week).toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit' }),
      ),
      datasets: [
        {
          data: weeks.map((w) => w.average),
          label: t('kcal / jour'),
          backgroundColor: '#f59e0b',
          borderRadius: 6,
        },
      ],
    };
  });

  /** 1 when the protein target was met that day, 0 otherwise — last 30 logged days. */
  protected readonly adherenceChart = computed<ChartConfiguration<'bar'>['data']>(() => {
    const target = this.settings().proteinTarget;
    const days = this.dailyTotals().slice(-30);
    return {
      labels: days.map((d) =>
        fromDateKey(d.date).toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit' }),
      ),
      datasets: [
        {
          data: days.map((d) => (d.protein >= target ? 1 : 0)),
          label: t('Cible protéines atteinte'),
          backgroundColor: days.map((d) => (d.protein >= target ? '#60a5fa' : '#2a2f3a')),
          borderRadius: 4,
        },
      ],
    };
  });

  protected readonly adherenceRate = computed(() => {
    const target = this.settings().proteinTarget;
    const days = this.dailyTotals();
    if (days.length === 0) return 0;
    return days.filter((d) => d.protein >= target).length / days.length;
  });

  protected readonly weightChart = computed<ChartConfiguration<'line'>['data']>(() => {
    const raw = this.weight.entries();
    const smoothed = this.weight.movingAverage();
    return {
      labels: raw.map((e) =>
        fromDateKey(e.date).toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit' }),
      ),
      datasets: [
        {
          data: raw.map((e) => e.weightKg),
          label: t('Poids'),
          borderColor: 'rgba(154, 161, 177, 0.5)',
          pointRadius: 2,
          fill: false,
        },
        {
          data: smoothed.map((e) => e.weightKg),
          label: t('Moyenne 7 j'),
          borderColor: '#4ade80',
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.35,
          fill: false,
        },
      ],
    };
  });

  protected readonly totalLoss = computed(() => {
    const first = this.weight.first();
    const last = this.weight.latest();
    if (!first || !last) return 0;
    return first.weightKg - last.weightKg;
  });

  /** Average kg lost per week over the whole weigh-in history. */
  protected readonly weeklyRate = computed(() => {
    const first = this.weight.first();
    const last = this.weight.latest();
    if (!first || !last || first.id === last.id) return 0;
    const weeks =
      (fromDateKey(last.date).getTime() - fromDateKey(first.date).getTime()) / MS_PER_WEEK;
    return weeks > 0 ? this.totalLoss() / weeks : 0;
  });

  /** Projected goal date at the current rate, or null when it is not on track. */
  protected readonly projection = computed(() => {
    const last = this.weight.latest();
    const rate = this.weeklyRate();
    if (!last || rate <= 0) return null;
    const remaining = last.weightKg - this.settings().weightGoalKg;
    if (remaining <= 0) return null;
    const date = fromDateKey(last.date);
    date.setDate(date.getDate() + Math.ceil((remaining / rate) * 7));
    return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
  });

  protected readonly hasLogs = computed(() => this.dailyTotals().length > 0);
}
