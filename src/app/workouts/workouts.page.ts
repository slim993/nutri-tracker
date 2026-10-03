import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClaudeBridgeService } from '../core/claude-bridge.service';
import { WorkoutsService } from '../core/workouts.service';
import { ClaudePanel } from '../shared/claude-panel';
import {
  fromDateKey,
  shiftDateKey,
  toDateKey,
  type PerformedSet,
  type Workout,
  type WorkoutExercise,
} from '../core/models';

type Draft = Omit<Workout, 'id'> & { id?: string };

/** Monday of the week containing `date`. */
function weekStart(date: string): string {
  const d = fromDateKey(date);
  const offset = (d.getDay() + 6) % 7;
  return shiftDateKey(date, -offset);
}

@Component({
  selector: 'app-workouts',
  imports: [FormsModule, ClaudePanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './workouts.page.html',
  styleUrl: './workouts.page.scss',
})
export class WorkoutsPage {
  protected readonly workouts = inject(WorkoutsService);
  private readonly claude = inject(ClaudeBridgeService);

  protected readonly weekOf = signal(weekStart(toDateKey(new Date())));
  protected readonly draft = signal<Draft | null>(null);

  protected readonly today = toDateKey(new Date());

  /** Bound as inputs of the Claude panel. */
  protected readonly buildWorkoutPrompt = () => this.claude.buildWorkoutPrompt();
  protected readonly importWorkoutPlan = async (text: string): Promise<string> => {
    const sessions = this.claude.parseWorkoutPlan(text);
    await this.workouts.createMany(sessions);
    this.weekOf.set(weekStart(sessions[0].date));
    return `${sessions.length} séance(s) importée(s).`;
  };

  protected readonly weekLabel = computed(() => {
    const start = fromDateKey(this.weekOf());
    const end = fromDateKey(shiftDateKey(this.weekOf(), 6));
    const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return `${fmt(start)} – ${fmt(end)}`;
  });

  protected readonly weekWorkouts = computed(() =>
    this.workouts.forRange(this.weekOf(), shiftDateKey(this.weekOf(), 6)),
  );

  protected shiftWeek(weeks: number): void {
    this.weekOf.set(shiftDateKey(this.weekOf(), weeks * 7));
  }

  protected pretty(date: string): string {
    return fromDateKey(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' });
  }

  protected exerciseLabel(e: WorkoutExercise): string {
    return `${e.sets}×${e.reps}${e.weightKg ? ` @ ${e.weightKg} kg` : ''}`;
  }

  /** Compact summary of the sets actually performed, e.g. "60kg×10, 60kg×8". */
  protected performedSummary(e: WorkoutExercise): string {
    if (!e.performed?.length) return '';
    return e.performed.map((p) => `${p.weightKg || '—'}kg×${p.reps}`).join(', ');
  }

  // --- Manual CRUD ---

  protected startCreate(): void {
    this.draft.set({
      date: this.today,
      name: '',
      exercises: [{ name: '', sets: 3, reps: '10' }],
      done: false,
    });
  }

  protected startEdit(workout: Workout): void {
    this.draft.set({
      ...workout,
      exercises: workout.exercises.map((e) => ({
        ...e,
        performed: e.performed?.map((p) => ({ ...p })),
      })),
    });
  }

  protected patch<K extends keyof Draft>(key: K, value: Draft[K]): void {
    this.draft.update((d) => (d ? { ...d, [key]: value } : d));
  }

  protected patchExercise(index: number, key: keyof WorkoutExercise, value: unknown): void {
    this.draft.update((d) => {
      if (!d) return d;
      const exercises = d.exercises.map((e, i) => (i === index ? { ...e, [key]: value } : e));
      return { ...d, exercises };
    });
  }

  protected addExercise(): void {
    this.draft.update((d) =>
      d ? { ...d, exercises: [...d.exercises, { name: '', sets: 3, reps: '10' }] } : d,
    );
  }

  protected removeExercise(index: number): void {
    this.draft.update((d) =>
      d ? { ...d, exercises: d.exercises.filter((_, i) => i !== index) } : d,
    );
  }

  // --- Performed sets (what was actually lifted) ---

  /** Adds a set, pre-filled from the last logged set or the planned weight. */
  protected addPerformedSet(exIndex: number): void {
    this.draft.update((d) => {
      if (!d) return d;
      const exercises = d.exercises.map((e, i) => {
        if (i !== exIndex) return e;
        const performed = e.performed ? [...e.performed] : [];
        const last = performed[performed.length - 1];
        performed.push({ weightKg: last?.weightKg ?? e.weightKg ?? 0, reps: last?.reps ?? 0 });
        return { ...e, performed };
      });
      return { ...d, exercises };
    });
  }

  protected patchPerformedSet(
    exIndex: number,
    setIndex: number,
    key: keyof PerformedSet,
    value: unknown,
  ): void {
    this.draft.update((d) => {
      if (!d) return d;
      const exercises = d.exercises.map((e, i) => {
        if (i !== exIndex) return e;
        const performed = (e.performed ?? []).map((p, j) =>
          j === setIndex ? { ...p, [key]: value } : p,
        );
        return { ...e, performed };
      });
      return { ...d, exercises };
    });
  }

  protected removePerformedSet(exIndex: number, setIndex: number): void {
    this.draft.update((d) => {
      if (!d) return d;
      const exercises = d.exercises.map((e, i) =>
        i === exIndex
          ? { ...e, performed: (e.performed ?? []).filter((_, j) => j !== setIndex) }
          : e,
      );
      return { ...d, exercises };
    });
  }

  protected async save(): Promise<void> {
    const draft = this.draft();
    if (!draft?.name.trim()) return;
    const exercises = draft.exercises
      .filter((e) => e.name.trim())
      .map((e) => {
        const performed = (e.performed ?? [])
          .map((p) => ({ weightKg: Number(p.weightKg) || 0, reps: Number(p.reps) || 0 }))
          .filter((p) => p.reps > 0 || p.weightKg > 0);
        return {
          name: e.name.trim(),
          sets: Number(e.sets) || 1,
          reps: String(e.reps).trim() || '—',
          ...(e.weightKg && Number(e.weightKg) > 0 ? { weightKg: Number(e.weightKg) } : {}),
          ...(performed.length > 0 ? { performed } : {}),
        };
      });
    if (exercises.length === 0) return;
    const data = {
      date: draft.date,
      name: draft.name.trim(),
      exercises,
      done: draft.done,
      ...(draft.notes ? { notes: draft.notes } : {}),
    };
    if (draft.id) await this.workouts.update({ ...data, id: draft.id });
    else await this.workouts.create(data);
    this.draft.set(null);
  }

  protected async remove(id: string): Promise<void> {
    if (!confirm('Supprimer cette séance ?')) return;
    await this.workouts.remove(id);
    this.draft.set(null);
  }
}
