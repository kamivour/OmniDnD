import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { computeSheet, type CharacterState } from '../calc/sheet';
import { takeCombatAction } from './actions';
import { startCombat, startTurn } from './combat';
import { useFeature } from './features';
import { freshState, Session } from './test-utils';

function fighter(level: number): CharacterState {
  const state = structuredClone(freshState);
  state.build.classes = [{ classId: 'class.fighter', level }];
  state.build.hpEntries = Array.from({ length: level }, (_, index) => ({
    level: index + 1,
    classId: 'class.fighter',
    value: index === 0 ? 10 : 6,
    method: index === 0 ? ('max' as const) : ('average' as const),
  }));
  return state;
}

function inTurn(state: CharacterState) {
  const session = new Session(state);
  session.run(startCombat, null);
  session.run(startTurn, null);
  return session;
}

const rapier = { action: 'weapon-attack', instanceId: 'rapier-1' } as const;

describe('Extra Attack', () => {
  it('counts attacks per Attack action by class level', () => {
    const count = (state: CharacterState) => computeSheet(state, registry).attackAction;
    expect(count(freshState)).toEqual({ count: 1, sources: [] });
    expect(count(fighter(4)).count).toBe(1);
    expect(count(fighter(5))).toEqual({ count: 2, sources: ['Extra Attack'] });
    expect(count(fighter(11)).count).toBe(3);
    expect(count(fighter(20)).count).toBe(4);
    const paladin = structuredClone(freshState);
    paladin.build.classes = [{ classId: 'class.paladin', level: 5 }];
    expect(count(paladin).count).toBe(2);
  });

  it('a second weapon attack joins the same action, a third warns', () => {
    const session = inTurn(fighter(5));
    expect(session.run(takeCombatAction, rapier)).toBe('Attack 1 of 2: Rapier');
    expect(session.live.combat?.economy).toMatchObject({ actionUsed: true, attacksMade: 1 });
    expect(session.preview(takeCombatAction, rapier).result).toBe('ok');
    expect(session.run(takeCombatAction, rapier)).toBe('Attack 2 of 2: Rapier');
    expect(session.preview(takeCombatAction, rapier).reasons).toEqual(['Action already used']);
    session.undo();
    expect(session.live.combat?.economy.attacksMade).toBe(1);
  });

  it('a shove replaces one attack; a reaction attack does not count', () => {
    const session = inTurn(fighter(5));
    session.run(takeCombatAction, { action: 'shove' });
    session.run(takeCombatAction, { ...rapier, reaction: true });
    expect(session.live.combat?.economy.attacksMade).toBe(1);
    expect(session.run(takeCombatAction, rapier)).toBe('Attack 2 of 2: Rapier');
  });

  it('without Extra Attack the second attack warns', () => {
    const session = inTurn(structuredClone(freshState));
    expect(session.run(takeCombatAction, rapier)).toBe('Attack: Rapier');
    expect(session.preview(takeCombatAction, rapier).reasons).toEqual(['Action already used']);
  });

  it('Action Surge gives a fresh Attack action', () => {
    const session = inTurn(fighter(5));
    session.run(takeCombatAction, rapier);
    session.run(takeCombatAction, rapier);
    expect(session.run(useFeature, { featureId: 'feature.fighter.action-surge' })).toContain(
      'action ready again',
    );
    expect(session.run(takeCombatAction, rapier)).toBe('Attack 1 of 2: Rapier');
  });
});
