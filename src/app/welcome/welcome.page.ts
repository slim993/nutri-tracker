import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toDateKey } from '../core/models';
import { DEFAULT_SETTINGS, SettingsService } from '../core/settings.service';
import { WeightService } from '../core/weight.service';
import { AccountPanel } from '../shared/account-panel';

/**
 * First-launch form: the app ships with no personal values, so the user's
 * weight, goal and daily targets are asked here before anything else shows.
 * `App` renders it for as long as no settings are saved.
 */
@Component({
  selector: 'app-welcome',
  imports: [FormsModule, AccountPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './welcome.page.html',
  styleUrl: './welcome.page.scss',
})
export class WelcomePage {
  private readonly settings = inject(SettingsService);
  private readonly weight = inject(WeightService);

  protected readonly currentKg = signal<number | null>(null);
  protected readonly goalKg = signal<number | null>(null);
  protected readonly kcal = signal<number | null>(DEFAULT_SETTINGS.kcalTarget);
  protected readonly protein = signal<number | null>(DEFAULT_SETTINGS.proteinTarget);
  protected readonly carbs = signal<number | null>(DEFAULT_SETTINGS.carbsTarget);
  protected readonly fat = signal<number | null>(DEFAULT_SETTINGS.fatTarget);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected canStart(): boolean {
    return !this.busy() && Number(this.currentKg()) > 0 && Number(this.goalKg()) > 0;
  }

  protected async start(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const currentKg = Number(this.currentKg());
      await this.weight.add(toDateKey(new Date()), currentKg);
      // Saved last: it is what makes `App` leave this screen.
      await this.settings.save({
        id: 'settings',
        kcalTarget: Number(this.kcal()) || 0,
        proteinTarget: Number(this.protein()) || 0,
        carbsTarget: Number(this.carbs()) || 0,
        fatTarget: Number(this.fat()) || 0,
        weightGoalKg: Number(this.goalKg()),
        startWeightKg: currentKg,
      });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      this.busy.set(false);
    }
  }
}
