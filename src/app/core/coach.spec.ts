import { describe, expect, it } from 'vitest';
import { buildProgram, computeTargets, weeksToGoal, type CoachProfile } from './coach';

const profile = (patch: Partial<CoachProfile> = {}): CoachProfile => ({
  sex: 'male',
  age: 30,
  heightCm: 180,
  weightKg: 90,
  goalKg: 80,
  activity: 'sedentary',
  pace: 'moderate',
  sessionsPerWeek: 3,
  level: 'beginner',
  equipment: 'gym',
  ...patch,
});

describe('computeTargets', () => {
  it('sets a deficit matching the pace when losing weight', () => {
    // BMR = 900 + 1125 - 150 + 5 = 1880 ; maintenance = 1880 × 1.2 = 2256
    const t = computeTargets(profile());
    expect(t.maintenanceKcal).toBe(2260);
    expect(t.kcal).toBe(1710); // 2256 - 550, rounded to 10
    expect(t.weeklyChangeKg).toBeCloseTo(-0.5, 1);
    expect(t.protein).toBe(145); // 1.8 g per kg of goal weight
  });

  it('keeps the macros consistent with the calorie target', () => {
    const t = computeTargets(profile());
    expect(Math.abs(t.protein * 4 + t.carbs * 4 + t.fat * 9 - t.kcal)).toBeLessThan(40);
  });

  it('never goes below the safe calorie floor', () => {
    const t = computeTargets(
      profile({ sex: 'female', age: 60, heightCm: 155, weightKg: 55, goalKg: 50, pace: 'fast' }),
    );
    expect(t.kcal).toBe(1200);
    expect(t.weeklyChangeKg).toBeGreaterThan(-0.75);
  });

  it('adds a smaller surplus when gaining', () => {
    const t = computeTargets(profile({ weightKg: 65, goalKg: 72 }));
    expect(t.kcal).toBeGreaterThan(t.maintenanceKcal);
    expect(t.weeklyChangeKg).toBeCloseTo(0.25, 1);
  });

  it('stays at maintenance when the goal is the current weight', () => {
    const t = computeTargets(profile({ goalKg: 90 }));
    expect(t.kcal).toBe(t.maintenanceKcal);
    expect(t.weeklyChangeKg).toBe(0);
  });
});

describe('weeksToGoal', () => {
  it('divides the distance by the weekly pace', () => {
    // 10 kg at just under 0.5 kg per week (the target is rounded to 10 kcal)
    const p = profile();
    expect(weeksToGoal(p, computeTargets(p))).toBe(21);
  });

  it('is zero at maintenance', () => {
    const p = profile({ goalKg: 90 });
    expect(weeksToGoal(p, computeTargets(p))).toBe(0);
  });
});

describe('buildProgram', () => {
  it('plans four weeks of the requested number of sessions', () => {
    const program = buildProgram(profile({ sessionsPerWeek: 3 }), '2026-10-05');
    expect(program).toHaveLength(12);
    expect(program[0].date).toBe('2026-10-05');
    expect(program[1].date).toBe('2026-10-07');
    expect(program.at(-1)!.date).toBe('2026-10-30');
  });

  it('alternates templates and builds volume over the weeks', () => {
    const program = buildProgram(profile({ sessionsPerWeek: 2 }), '2026-10-05');
    expect(program[0].name).not.toBe(program[1].name);
    expect(program[0].exercises[0].sets).toBe(2);
    expect(program.at(-1)!.exercises[0].sets).toBe(3);
  });

  it('uses bodyweight exercises without equipment and adds walking only when losing', () => {
    const losing = buildProgram(profile({ equipment: 'none' }), '2026-10-05');
    expect(losing[0].name).toContain('Poids du corps');
    expect(losing[0].exercises.at(-1)!.name).toBe('Marche rapide');

    const gaining = buildProgram(profile({ weightKg: 65, goalKg: 72 }), '2026-10-05');
    expect(gaining[0].exercises.some((e) => e.name === 'Marche rapide')).toBe(false);
  });
});
