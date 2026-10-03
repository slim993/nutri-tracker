import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaudeBridgeService } from './claude-bridge.service';

// These assertions read French text: pin the language before the modules under test load.
vi.hoisted(() => localStorage.setItem('nutri-lang', 'fr'));

const VALID_PLAN = `{
  "sessions": [
    {
      "date": "2026-07-20",
      "name": "Push",
      "exercises": [
        { "name": "Développé couché", "sets": 4, "reps": "8-10", "weightKg": 60 },
        { "name": "Pompes", "sets": 3, "reps": "max" }
      ]
    }
  ]
}`;

describe('ClaudeBridgeService.parseWorkoutPlan', () => {
  let service: ClaudeBridgeService;

  beforeEach(() => {
    service = TestBed.inject(ClaudeBridgeService);
  });

  it('parses a raw JSON plan', () => {
    const sessions = service.parseWorkoutPlan(VALID_PLAN);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].name).toBe('Push');
    expect(sessions[0].done).toBe(false);
    expect(sessions[0].exercises[0]).toEqual({
      name: 'Développé couché',
      sets: 4,
      reps: '8-10',
      weightKg: 60,
    });
    // Bodyweight exercise: weightKg must be absent, not 0/null.
    expect(sessions[0].exercises[1]).toEqual({ name: 'Pompes', sets: 3, reps: 'max' });
  });

  it('extracts the fenced JSON block from a full Claude answer', () => {
    const answer = `Voici ton programme, pensé pour ta perte de poids.\n\n\`\`\`json\n${VALID_PLAN}\n\`\`\`\n\nBon courage !`;
    expect(service.parseWorkoutPlan(answer)).toHaveLength(1);
  });

  it('rejects text without JSON', () => {
    expect(() => service.parseWorkoutPlan('Désolé, je ne peux pas.')).toThrow(/JSON/);
  });

  it('rejects a session with a malformed date', () => {
    const bad = VALID_PLAN.replace('2026-07-20', '20/07/2026');
    expect(() => service.parseWorkoutPlan(bad)).toThrow(/date/i);
  });

  it('rejects an empty sessions array', () => {
    expect(() => service.parseWorkoutPlan('{ "sessions": [] }')).toThrow(/sessions/);
  });
});

const VALID_MEAL_PLAN = `{
  "newFoods": [
    { "name": "Courgette", "kcal": 17, "protein": 1.2, "carbs": 3.1, "fat": 0.3 }
  ],
  "days": [
    {
      "date": "2026-07-20",
      "meals": [
        { "slot": "breakfast", "items": [ { "food": "Œuf entier", "grams": 220 } ] },
        { "slot": "dinner", "items": [ { "food": "Courgette", "grams": 300 } ] }
      ]
    }
  ]
}`;

describe('ClaudeBridgeService.parseMealPlan', () => {
  let service: ClaudeBridgeService;

  beforeEach(() => {
    service = TestBed.inject(ClaudeBridgeService);
  });

  it('parses days, slots and new foods', () => {
    const plan = service.parseMealPlan(VALID_MEAL_PLAN);
    expect(plan.days).toHaveLength(1);
    expect(plan.days[0].meals[0].slot).toBe('breakfast');
    expect(plan.days[0].meals[0].items[0]).toEqual({ food: 'Œuf entier', grams: 220 });
    expect(plan.newFoods[0].name).toBe('Courgette');
  });

  it('tolerates a missing newFoods array', () => {
    const plan = service.parseMealPlan(
      '{ "days": ' +
        JSON.stringify([
          { date: '2026-07-20', meals: [{ slot: 'lunch', items: [{ food: 'Riz', grams: 80 }] }] },
        ]) +
        ' }',
    );
    expect(plan.newFoods).toEqual([]);
  });

  it('maps an unknown slot to "other"', () => {
    const plan = service.parseMealPlan(VALID_MEAL_PLAN.replace('"dinner"', '"souper"'));
    expect(plan.days[0].meals[1].slot).toBe('other');
  });

  it('extracts the fenced JSON block from a full answer', () => {
    const answer = `Voici ton plan.\n\n\`\`\`json\n${VALID_MEAL_PLAN}\n\`\`\`\nBon appétit !`;
    expect(service.parseMealPlan(answer).days).toHaveLength(1);
  });

  it('rejects an item without grams', () => {
    const bad = VALID_MEAL_PLAN.replace('"grams": 220', '"grams": 0');
    expect(() => service.parseMealPlan(bad)).toThrow(/quantité/);
  });

  it('rejects a plan without days', () => {
    expect(() => service.parseMealPlan('{ "days": [] }')).toThrow(/days/);
  });
});
