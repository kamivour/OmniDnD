import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { computeSheet, type CharacterState } from '../calc/sheet';
import { featureUseDetails, useFeature } from './features';
import { applyDamage, heal, rollDeathSave } from './hp';
import { completeLongRest } from './rest';
import { freshState, Session } from './test-utils';

const ENDURANCE = 'feature.relentless-endurance';

function halfOrc(classId?: string, level = 1): CharacterState {
  const state = structuredClone(freshState);
  state.build.raceId = 'race.half-orc';
  delete state.build.subraceId;
  if (classId) {
    state.build.classes = [{ classId, level }];
    state.build.hpEntries = Array.from({ length: level }, (_, index) => ({
      level: index + 1,
      classId,
      value: index === 0 ? 12 : 7,
      method: index === 0 ? ('max' as const) : ('average' as const),
    }));
  }
  return state;
}

const attack = (state: CharacterState, id: string) =>
  computeSheet(state, registry).attacks.find((entry) => entry.instanceId === id);

describe('critical hit dice', () => {
  it('Savage Attacks adds one weapon die to melee crits only', () => {
    expect(attack(freshState, 'rapier-1')?.critExtra).toBeUndefined();
    const state = halfOrc();
    expect(attack(state, 'rapier-1')?.critExtra).toEqual({
      dice: '1d8',
      sources: ['Savage Attacks'],
    });
    state.build.items.push({ instanceId: 'bow-1', itemId: 'item.shortbow' });
    state.live.items['bow-1'] = { qty: 1, equipped: true, attuned: false };
    expect(attack(state, 'bow-1')?.critExtra).toBeUndefined();
  });

  it('Brutal Critical scales by barbarian level and stacks with Savage Attacks', () => {
    expect(attack(halfOrc('class.barbarian', 8), 'rapier-1')?.critExtra?.dice).toBe('1d8');
    expect(attack(halfOrc('class.barbarian', 9), 'rapier-1')?.critExtra).toEqual({
      dice: '2d8',
      sources: ['Savage Attacks', 'Brutal Critical'],
    });
    expect(attack(halfOrc('class.barbarian', 13), 'dagger-1')?.critExtra?.dice).toBe('3d4');
    expect(attack(halfOrc('class.barbarian', 17), 'dagger-1')?.critExtra?.dice).toBe('4d4');
  });
});

describe('Relentless Endurance', () => {
  it('works only at 0 HP, stands you up at 1 HP, and undoes', () => {
    const session = new Session(halfOrc());
    expect(session.preview(useFeature, { featureId: ENDURANCE }).reasons).toEqual([
      'Relentless Endurance works only when you drop to 0 HP',
    ]);
    session.run(applyDamage, { amount: 19 });
    expect(session.live.conditions.some((entry) => entry === 'unconscious')).toBe(true);
    expect(session.run(useFeature, { featureId: ENDURANCE })).toContain('back up at 1 HP');
    expect(session.live.hp).toBe(1);
    expect(session.live.conditions.some((entry) => entry === 'unconscious')).toBe(false);
    session.undo();
    expect(session.live.hp).toBe(0);
  });

  it('warns when death saves are already recorded and resets them', () => {
    const session = new Session(halfOrc());
    session.run(applyDamage, { amount: 19 });
    session.run(rollDeathSave, { roll: 5 });
    expect(session.preview(useFeature, { featureId: ENDURANCE }).reasons).toEqual([
      'Death saves already recorded; this applies as you drop to 0 HP',
    ]);
    session.run(useFeature, { featureId: ENDURANCE }, true);
    expect(session.live.deathSaves).toEqual({ success: 0, fail: 0 });
  });

  it('is once per long rest', () => {
    const session = new Session(halfOrc());
    session.run(applyDamage, { amount: 19 });
    session.run(useFeature, { featureId: ENDURANCE });
    session.run(applyDamage, { amount: 1 });
    expect(featureUseDetails(session, ENDURANCE).unavailableReason).toBeDefined();
    expect(session.preview(useFeature, { featureId: ENDURANCE }).result).toBe('blocked');
    session.run(heal, { amount: 5 });
    session.run(completeLongRest, null);
    session.run(applyDamage, { amount: 30 });
    expect(session.preview(useFeature, { featureId: ENDURANCE }).result).not.toBe('blocked');
  });
});
