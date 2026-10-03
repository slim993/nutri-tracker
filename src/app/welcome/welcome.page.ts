import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ACTIVITY_LEVELS,
  PACES,
  PROGRAM_WEEKS,
  buildProgram,
  computeTargets,
  weeksToGoal,
  type ActivityLevel,
  type CoachProfile,
  type Equipment,
  type Pace,
  type Sex,
  type TrainingLevel,
} from '../core/coach';
import { fromDateKey, toDateKey, type Workout } from '../core/models';
import { DEFAULT_SETTINGS, SettingsService } from '../core/settings.service';
import { WeightService } from '../core/weight.service';
import { WorkoutsService } from '../core/workouts.service';
import { AccountPanel } from '../shared/account-panel';

type Step = 'questions' | 'proposal';

/**
 * First-launch flow: the app ships with no personal values, so a short
 * questionnaire works out daily targets and a four-week training programme
 * (see `core/coach.ts`), which the user can adjust before starting. `App`
 * renders this for as long as no settings are saved.
 */
@Component({
  selector: 'app-welcome',
  imports: [FormsModule, AccountPanel, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './welcome.page.html',
  styleUrl: './welcome.page.scss',
})
export class WelcomePage {
  private readonly settings = inject(SettingsService);
  private readonly weight = inject(WeightService);
  private readonly workouts = inject(WorkoutsService);

  protected readonly activityLevels = ACTIVITY_LEVELS;
  protected readonly paces = PACES;
  protected readonly programWeeks = PROGRAM_WEEKS;

  protected readonly step = signal<Step>('questions');

  // Questionnaire answers.
  protected readonly sex = signal<Sex>('male');
  protected readonly age = signal<number | null>(null);
  protected readonly heightCm = signal<number | null>(null);
  protected readonly currentKg = signal<number | null>(null);
  protected readonly goalKg = signal<number | null>(null);
  protected readonly activity = signal<ActivityLevel>('light');
  protected readonly pace = signal<Pace>('moderate');
  protected readonly sessionsPerWeek = signal<2 | 3 | 4>(3);
  protected readonly level = signal<TrainingLevel>('beginner');
  protected readonly equipment = signal<Equipment>('gym');

  // Proposed targets, editable before starting.
  protected readonly kcal = signal<number | null>(DEFAULT_SETTINGS.kcalTarget);
  protected readonly protein = signal<number | null>(DEFAULT_SETTINGS.proteinTarget);
  protected readonly carbs = signal<number | null>(DEFAULT_SETTINGS.carbsTarget);
  protected readonly fat = signal<number | null>(DEFAULT_SETTINGS.fatTarget);

  /** Null when the user skipped the questionnaire and types their own targets. */
  protected readonly profile = signal<CoachProfile | null>(null);
  protected readonly addProgram = signal(true);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly plan = computed(() => {
    const profile = this.profile();
    if (!profile) return null;
    const targets = computeTargets(profile);
    return { targets, weeks: weeksToGoal(profile, targets) };
  });

  protected readonly program = computed<Omit<Workout, 'id'>[]>(() => {
    const profile = this.profile();
    return profile ? buildProgram(profile, toDateKey(new Date())) : [];
  });

  /** The first week of the programme, as a preview — the other weeks repeat its pattern. */
  protected readonly firstWeek = computed(() =>
    this.program().slice(0, this.profile()?.sessionsPerWeek ?? 0),
  );

  protected hasWeights(): boolean {
    return Number(this.currentKg()) > 0 && Number(this.goalKg()) > 0;
  }

  protected canCompute(): boolean {
    return this.hasWeights() && Number(this.age()) > 0 && Number(this.heightCm()) > 0;
  }

  protected canStart(): boolean {
    return !this.busy() && this.hasWeights();
  }

  protected compute(): void {
    const profile: CoachProfile = {
      sex: this.sex(),
      age: Number(this.age()),
      heightCm: Number(this.heightCm()),
      weightKg: Number(this.currentKg()),
      goalKg: Number(this.goalKg()),
      activity: this.activity(),
      pace: this.pace(),
      sessionsPerWeek: this.sessionsPerWeek(),
      level: this.level(),
      equipment: this.equipment(),
    };
    const targets = computeTargets(profile);
    this.kcal.set(targets.kcal);
    this.protein.set(targets.protein);
    this.carbs.set(targets.carbs);
    this.fat.set(targets.fat);
    this.profile.set(profile);
    this.addProgram.set(true);
    this.step.set('proposal');
  }

  /** Straight to the targets form, for users who already know their numbers. */
  protected skip(): void {
    this.profile.set(null);
    this.step.set('proposal');
  }

  protected dayLabel(dateKey: string): string {
    return fromDateKey(dateKey).toLocaleDateString('fr-FR', { weekday: 'long' });
  }

  protected async start(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const currentKg = Number(this.currentKg());
      await this.weight.add(toDateKey(new Date()), currentKg);
      if (this.profile() && this.addProgram()) await this.workouts.createMany(this.program());
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
