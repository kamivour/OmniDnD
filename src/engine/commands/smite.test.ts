import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { computeSheet, type CharacterState } from '../calc/sheet';
import { smite } from './smite';
import { freshState, Session } from './test-utils';

const DIVINE = 'feature.paladin.divine-smite';
const ELDRITCH = 'feature.warlock.eldritch-invocation-eldritch-smite';

function classed(classId: string, level: number, featureIds: string[] = []): CharacterState {
  const state = structuredClone(freshState);
  state.build.classes = [{ classId, level }];
  state.build.featureIds = [...state.build.featureIds, ...featureIds];
  state.build.hpEntries = Array.from({ length: level }, (_, index) => ({
    level: index + 1,
    classId,
    value: index === 0 ? 10 : 6,
    method: index === 0 ? ('max' as const) : ('average' as const),
  }));
  return state;
}

describe('smites', () => {
  it('Divine Smite spends the slot and scales its dice', () => {
    const session = new Session(classed('class.paladin', 5));
    expect(session.run(smite, { featureId: DIVINE, slotLevel: 1 })).toBe(
      'Divine Smite (L1 slot): roll 2d8 radiant',
    );
    expect(session.state.live.slotsUsed[1]).toBe(1);
    expect(session.run(smite, { featureId: DIVINE, slotLevel: 2, bonusTarget: true })).toBe(
      'Divine Smite (L2 slot): roll 4d8 radiant, vs undead or fiend',
    );
    session.undo();
    expect(session.state.live.slotsUsed[2]).toBe(0);
  });

  it('caps Divine Smite at 5d8 before the undead or fiend die', () => {
    const session = new Session(classed('class.paladin', 19));
    expect(session.run(smite, { featureId: DIVINE, slotLevel: 5 })).toContain('roll 5d8 radiant');
    expect(session.run(smite, { featureId: DIVINE, slotLevel: 5, bonusTarget: true })).toContain(
      'roll 6d8 radiant',
    );
  });

  it('blocks without the feature or a free slot', () => {
    expect(new Session().preview(smite, { featureId: DIVINE, slotLevel: 1 }).result).toBe(
      'blocked',
    );
    const session = new Session(classed('class.paladin', 5));
    session.state.live.slotsUsed[2] = 2;
    expect(session.preview(smite, { featureId: DIVINE, slotLevel: 2 }).reasons).toEqual([
      'No level 2 slots left',
    ]);
    expect(session.preview(smite, { featureId: DIVINE }).reasons).toEqual(['Choose a slot level']);
  });

  it('Eldritch Smite needs a pact slot and uses its level', () => {
    const session = new Session(classed('class.warlock', 5, [ELDRITCH]));
    expect(session.preview(smite, { featureId: ELDRITCH, slotLevel: 1 }).result).toBe('blocked');
    const text = session.run(smite, { featureId: ELDRITCH, pact: true });
    expect(session.state.live.pactSlotsUsed).toBe(1);
    expect(text).toMatch(/^Eldritch Invocation: Eldritch Smite \(pact slot L3\): roll 4d8 force/);
  });

  it('Improved Divine Smite adds 1d8 radiant to melee weapon hits', () => {
    const extra = (state: CharacterState) =>
      computeSheet(state, registry).attacks.find((attack) => attack.instanceId === 'rapier-1')
        ?.extraDamage;
    expect(extra(classed('class.paladin', 10))).toBeUndefined();
    expect(extra(classed('class.paladin', 11))).toEqual([
      { dice: '1d8', type: 'radiant', source: 'Improved Divine Smite' },
    ]);
  });
});
