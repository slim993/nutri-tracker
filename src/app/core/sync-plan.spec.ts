import { describe, expect, it } from 'vitest';
import { canonical, parseRecordKey, planSync, type RemoteRow } from './sync-plan';

const food = (name: string) => ({ id: 'a', name });
const entries = (records: Record<string, unknown>) =>
  new Map(Object.entries(records).map(([key, value]) => [key, canonical(value)]));

describe('canonical', () => {
  it('ignores key order, including in nested objects', () => {
    expect(canonical({ b: 1, a: { d: 2, c: [{ f: 3, e: 4 }] } })).toBe(
      canonical({ a: { c: [{ e: 4, f: 3 }], d: 2 }, b: 1 }),
    );
  });
});

describe('parseRecordKey', () => {
  it('keeps colons that belong to the id', () => {
    expect(parseRecordKey('foods:a:b')).toEqual({ store: 'foods', id: 'a:b' });
  });
});

describe('planSync', () => {
  it('pushes records never synced', () => {
    const plan = planSync(entries({ 'foods:a': food('Riz') }), new Map(), []);
    expect(plan.push).toEqual([{ store: 'foods', id: 'a', data: food('Riz') }]);
    expect(plan.apply).toEqual([]);
  });

  it('pushes a deletion for a synced record removed locally', () => {
    const plan = planSync(new Map(), entries({ 'foods:a': food('Riz') }), []);
    expect(plan.push).toEqual([{ store: 'foods', id: 'a', data: null }]);
  });

  it('does nothing when local matches the shadow', () => {
    const state = entries({ 'foods:a': food('Riz') });
    expect(planSync(state, state, [])).toEqual({ apply: [], push: [], shadow: new Map() });
  });

  it('applies a remote change to an untouched record', () => {
    const state = entries({ 'foods:a': food('Riz') });
    const remote: RemoteRow[] = [
      { store: 'foods', id: 'a', data: food('Riz complet'), deleted: false },
    ];
    const plan = planSync(state, state, remote);
    expect(plan.apply).toEqual([{ store: 'foods', id: 'a', data: food('Riz complet') }]);
    expect(plan.push).toEqual([]);
    expect(plan.shadow.get('foods:a')).toBe(canonical(food('Riz complet')));
  });

  it('applies a remote deletion to an untouched record', () => {
    const state = entries({ 'foods:a': food('Riz') });
    const plan = planSync(state, state, [{ store: 'foods', id: 'a', data: null, deleted: true }]);
    expect(plan.apply).toEqual([{ store: 'foods', id: 'a', data: null }]);
    expect(plan.push).toEqual([]);
    expect(plan.shadow.get('foods:a')).toBeNull();
  });

  it('lets an unsent local change win over a remote change', () => {
    const plan = planSync(
      entries({ 'foods:a': food('Riz local') }),
      entries({ 'foods:a': food('Riz') }),
      [{ store: 'foods', id: 'a', data: food('Riz distant'), deleted: false }],
    );
    expect(plan.apply).toEqual([]);
    expect(plan.push).toEqual([{ store: 'foods', id: 'a', data: food('Riz local') }]);
  });

  it('treats our own pushed row coming back as already synced', () => {
    const local = entries({ 'foods:a': food('Riz') });
    const plan = planSync(local, new Map(), [
      { store: 'foods', id: 'a', data: { name: 'Riz', id: 'a' }, deleted: false },
    ]);
    expect(plan.apply).toEqual([]);
    expect(plan.push).toEqual([]);
    expect(plan.shadow.get('foods:a')).toBe(canonical(food('Riz')));
  });
});
