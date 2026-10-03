import { shiftDateKey, type Workout, type WorkoutExercise } from './models';

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active';
export type Pace = 'slow' | 'moderate' | 'fast';
export type TrainingLevel = 'beginner' | 'intermediate';
export type Equipment = 'none' | 'gym';

/** Answers of the welcome questionnaire. */
export interface CoachProfile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  goalKg: number;
  activity: ActivityLevel;
  pace: Pace;
  sessionsPerWeek: 2 | 3 | 4;
  level: TrainingLevel;
  equipment: Equipment;
}

export interface CoachTargets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Estimated calories to keep the current weight. */
  maintenanceKcal: number;
  /** Expected change per week at `kcal`; negative when losing. */
  weeklyChangeKg: number;
}

export const ACTIVITY_LEVELS: { id: ActivityLevel; label: string; factor: number }[] = [
  { id: 'sedentary', label: 'Sédentaire (bureau, peu de marche)', factor: 1.2 },
  { id: 'light', label: 'Légèrement actif (marche quotidienne)', factor: 1.375 },
  { id: 'moderate', label: 'Actif (travail debout, sport régulier)', factor: 1.55 },
  { id: 'active', label: 'Très actif (travail physique)', factor: 1.725 },
];

export const PACES: { id: Pace; label: string; kgPerWeek: number }[] = [
  { id: 'slow', label: 'Doux', kgPerWeek: 0.25 },
  { id: 'moderate', label: 'Modéré', kgPerWeek: 0.5 },
  { id: 'fast', label: 'Soutenu', kgPerWeek: 0.75 },
];

export const PROGRAM_WEEKS = 4;

const KCAL_PER_KG = 7700;
/** Below these, a diet should be medically supervised — the plan never goes under. */
const MIN_KCAL: Record<Sex, number> = { male: 1500, female: 1200 };
const FAT_SHARE = 0.28;

const roundTo = (value: number, step: number) => Math.round(value / step) * step;

/**
 * Daily targets from the questionnaire: Mifflin-St Jeor resting metabolism ×
 * activity factor, shifted by the chosen pace towards the goal weight.
 * Gaining goes at half the pace of losing, to limit fat gain.
 */
export function computeTargets(profile: CoachProfile): CoachTargets {
  const { sex, age, heightCm, weightKg, goalKg } = profile;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
  const factor = ACTIVITY_LEVELS.find((a) => a.id === profile.activity)!.factor;
  const maintenance = bmr * factor;

  const direction = Math.sign(goalKg - weightKg);
  const pace = PACES.find((p) => p.id === profile.pace)!.kgPerWeek;
  const wantedWeekly = direction < 0 ? -pace : direction > 0 ? pace / 2 : 0;
  const kcal = roundTo(Math.max(maintenance + (wantedWeekly * KCAL_PER_KG) / 7, MIN_KCAL[sex]), 10);

  // Protein follows the weight aimed for when losing, so it is not inflated by the excess.
  const protein = roundTo((direction < 0 ? 1.8 * goalKg : 1.6 * weightKg) || 0, 5);
  const fat = roundTo((kcal * FAT_SHARE) / 9, 5);
  const carbs = Math.max(0, roundTo((kcal - protein * 4 - fat * 9) / 4, 5));

  return {
    kcal,
    protein,
    carbs,
    fat,
    maintenanceKcal: roundTo(maintenance, 10),
    weeklyChangeKg: direction === 0 ? 0 : ((kcal - maintenance) * 7) / KCAL_PER_KG,
  };
}

/** Weeks needed to reach the goal at the plan's pace; null when it never gets there. */
export function weeksToGoal(profile: CoachProfile, targets: CoachTargets): number | null {
  const remaining = profile.goalKg - profile.weightKg;
  if (remaining === 0) return 0;
  if (remaining * targets.weeklyChangeKg <= 0) return null;
  return Math.ceil(remaining / targets.weeklyChangeKg);
}

/** Days from the start of a week on which sessions fall, with rest days in between. */
const SESSION_DAYS: Record<CoachProfile['sessionsPerWeek'], number[]> = {
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
};

type Template = { name: string; exercises: [name: string, reps: string][] };

const GYM_FULL_BODY: Template[] = [
  {
    name: 'Corps entier A',
    exercises: [
      ['Squat', '8-10'],
      ['Développé couché', '8-10'],
      ['Tirage horizontal', '10-12'],
      ['Gainage planche', '30 s'],
    ],
  },
  {
    name: 'Corps entier B',
    exercises: [
      ['Soulevé de terre roumain', '8-10'],
      ['Développé militaire', '8-10'],
      ['Tirage vertical', '10-12'],
      ['Fentes', '10 par jambe'],
    ],
  },
];

const GYM_SPLIT: Template[] = [
  {
    name: 'Haut du corps A',
    exercises: [
      ['Développé couché', '8-10'],
      ['Tirage horizontal', '10-12'],
      ['Développé militaire', '8-10'],
      ['Curl biceps', '12-15'],
    ],
  },
  {
    name: 'Bas du corps A',
    exercises: [
      ['Squat', '8-10'],
      ['Soulevé de terre roumain', '8-10'],
      ['Presse à cuisses', '10-12'],
      ['Gainage planche', '30 s'],
    ],
  },
  {
    name: 'Haut du corps B',
    exercises: [
      ['Tirage vertical', '10-12'],
      ['Développé incliné haltères', '10-12'],
      ['Élévations latérales', '12-15'],
      ['Extension triceps', '12-15'],
    ],
  },
  {
    name: 'Bas du corps B',
    exercises: [
      ['Fentes', '10 par jambe'],
      ['Leg curl', '10-12'],
      ['Mollets debout', '12-15'],
      ['Relevé de jambes', '10-12'],
    ],
  },
];

const BODYWEIGHT: Template[] = [
  {
    name: 'Poids du corps A',
    exercises: [
      ['Squat', '12-15'],
      ['Pompes (sur les genoux si besoin)', '8-12'],
      ['Pont fessier', '12-15'],
      ['Gainage planche', '30 s'],
    ],
  },
  {
    name: 'Poids du corps B',
    exercises: [
      ['Fentes', '10 par jambe'],
      ['Pompes inclinées', '8-12'],
      ['Superman', '12-15'],
      ['Mountain climbers', '30 s'],
    ],
  },
];

/** Sets per exercise for a 1-based week: volume builds up, heavier for trained users. */
function setsFor(level: TrainingLevel, week: number): number {
  const base = level === 'beginner' ? 2 : 3;
  return week >= 3 ? base + 1 : base;
}

/**
 * A four-week training programme starting on `startDate` (YYYY-MM-DD), ready
 * for `WorkoutsService.createMany()`. Sessions alternate between templates so
 * the same one never comes twice in a row; a brisk walk is added when losing weight.
 */
export function buildProgram(profile: CoachProfile, startDate: string): Omit<Workout, 'id'>[] {
  const templates =
    profile.equipment === 'none'
      ? BODYWEIGHT
      : profile.sessionsPerWeek === 4
        ? GYM_SPLIT
        : GYM_FULL_BODY;
  const losing = profile.goalKg < profile.weightKg;
  const program: Omit<Workout, 'id'>[] = [];

  for (let week = 1; week <= PROGRAM_WEEKS; week++) {
    const sets = setsFor(profile.level, week);
    for (const day of SESSION_DAYS[profile.sessionsPerWeek]) {
      const template = templates[program.length % templates.length];
      const exercises: WorkoutExercise[] = template.exercises.map(([name, reps]) => ({
        name,
        sets,
        reps,
      }));
      if (losing) exercises.push({ name: 'Marche rapide', sets: 1, reps: '20 min' });
      program.push({
        date: shiftDateKey(startDate, (week - 1) * 7 + day),
        name: `S${week} · ${template.name}`,
        exercises,
        done: false,
      });
    }
  }
  return program;
}
