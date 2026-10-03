import { describe, expect, it } from 'vitest';
import { macrosFor, shiftDateKey, sumMacros, toDateKey, weightGoalLabel } from './models';

describe('weightGoalLabel', () => {
  it('follows the direction from current weight to goal', () => {
    expect(weightGoalLabel(90, 80)).toContain('perte');
    expect(weightGoalLabel(60, 68)).toContain('prise');
    expect(weightGoalLabel(70, 70)).toContain('maintien');
  });
});

describe('macrosFor', () => {
  it('scales per-100 g values to the logged amount', () => {
    const food = { kcal: 120, protein: 23, carbs: 0, fat: 2.5 };
    expect(macrosFor(food, 180)).toEqual({ kcal: 216, protein: 41.4, carbs: 0, fat: 4.5 });
  });

  it('returns zeroes for a zero amount', () => {
    expect(macrosFor({ kcal: 400, protein: 80, carbs: 8, fat: 6 }, 0)).toEqual({
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });
});

describe('sumMacros', () => {
  it('adds every component', () => {
    expect(
      sumMacros([
        { kcal: 100, protein: 10, carbs: 5, fat: 1 },
        { kcal: 50, protein: 2, carbs: 8, fat: 3 },
      ]),
    ).toEqual({ kcal: 150, protein: 12, carbs: 13, fat: 4 });
  });
});

describe('date keys', () => {
  it('formats in local time, not UTC', () => {
    // 23:30 local on the 5th must stay the 5th even when UTC has rolled over.
    expect(toDateKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('crosses month boundaries when shifting', () => {
    expect(shiftDateKey('2026-01-31', 1)).toBe('2026-02-01');
    expect(shiftDateKey('2026-03-01', -1)).toBe('2026-02-28');
  });
});
