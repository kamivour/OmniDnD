import { describe, expect, it } from 'vitest';
import { nextInOrder, groupNames, turnOrder } from '../calc/encounter';
import { LiveStateSchema, type Companion } from '../schema';
import { addCompanion } from './companions';
import { startCombat, startTurn, endCombat } from './combat';
import {
  addCombatant,
  damageCombatant,
  healCombatant,
  nextTurn,
  removeCombatant,
  setDefeated,
  setInitiative,
  startEncounter,
  toggleCombatantCondition,
  setCompanionWithOwner,
  endEncounter,
  setCombatantTempHp,
} from './encounter';
import { freshState, Session } from './test-utils';

const mastiff: Companion = {
  id: 'mastiff',
  name: 'Mastiff',
  type: 'pet',
  kind: 'Medium beast',
  ac: 12,
  maxHp: 5,
  speed: { walk: 40 },
  abilities: { STR: 13, DEX: 14, CON: 12, INT: 3, WIS: 12, CHA: 7 },
  attacks: [],
  traits: [],
  uses: [],
};

function fight() {
  const session = new Session(freshState);
  session.run(addCompanion, { companion: mastiff });
  session.run(startCombat, null);
  session.run(startEncounter, {});
  return session;
}

const enc = (session: Session) => session.live.encounter!;
const who = (session: Session, name: string) =>
  enc(session).combatants.find((entry) => entry.name === name)!;

describe('encounter order', () => {
  it('numbers groups and renames a lone first one', () => {
    expect(groupNames([], 'Goblin', 1).names).toEqual(['Goblin']);
    expect(groupNames([], 'Goblin', 3).names).toEqual(['Goblin 1', 'Goblin 2', 'Goblin 3']);
    expect(groupNames(['Goblin'], 'Goblin', 2)).toEqual({
      names: ['Goblin 2', 'Goblin 3'],
      renames: { Goblin: 'Goblin 1' },
    });
  });

  it('sorts by initiative, then bonus, then who was added first', () => {
    const base = { conditions: [], defeated: false };
    const a = {
      ...base,
      id: 'a',
      name: 'A',
      side: 'you' as const,
      initiativeBonus: 1,
      initiative: 12,
    };
    const b = {
      ...base,
      id: 'b',
      name: 'B',
      side: 'companion' as const,
      companionId: 'b',
      initiativeBonus: 3,
      initiative: 12,
    };
    const c = {
      ...base,
      id: 'c',
      name: 'C',
      side: 'companion' as const,
      companionId: 'c',
      initiativeBonus: 0,
      initiative: 15,
      withOwner: true,
    };
    const d = {
      ...base,
      id: 'd',
      name: 'D',
      side: 'companion' as const,
      companionId: 'd',
      initiativeBonus: 0,
    };
    expect(turnOrder({ combatants: [a, b, c, d] }).map((e) => e.id)).toEqual(['b', 'a', 'c']);
    expect(nextInOrder({ combatants: [a, b, c, d], currentId: 'c' })).toMatchObject({
      next: { id: 'b' },
      newRound: true,
    });
  });
});

describe('encounter commands', () => {
  it('starts with you and active companions, and blocks a second one', () => {
    const session = fight();
    expect(enc(session).combatants.map((entry) => entry.side)).toEqual(['you', 'companion']);
    expect(session.try(startEncounter, {}).result).toBe('blocked');
    expect(LiveStateSchema.safeParse(session.live).success).toBe(true);
  });

  it('adds an SRD creature group with average HP, and custom entries', () => {
    const session = fight();
    session.run(addCombatant, {
      kind: 'creature',
      creatureId: 'creature.goblin',
      side: 'enemy',
      count: 3,
    });
    expect(enc(session).combatants.map((entry) => entry.name)).toContain('Goblin 3');
    expect(who(session, 'Goblin 1')).toMatchObject({ ac: 15, maxHp: 7, hp: 7, side: 'enemy' });
    session.run(addCombatant, {
      kind: 'creature',
      creatureId: 'creature.goblin',
      side: 'enemy',
      hp: [9],
    });
    expect(who(session, 'Goblin 4').maxHp).toBe(9);
    expect(
      session.try(addCombatant, {
        kind: 'creature',
        creatureId: 'creature.goblin',
        side: 'enemy',
        count: 2,
        hp: [5],
      }).result,
    ).toBe('blocked');
    session.run(addCombatant, {
      kind: 'custom',
      name: 'Bandit Chief',
      side: 'ally',
      ac: 16,
      hp: 30,
      initiativeBonus: 2,
    });
    expect(who(session, 'Bandit Chief')).toMatchObject({ side: 'ally', hp: 30 });
    session.undo();
    expect(enc(session).combatants.some((entry) => entry.name === 'Bandit Chief')).toBe(false);
  });

  it('sets initiative from a roll plus bonus, or a total', () => {
    const session = fight();
    session.run(setInitiative, { id: 'you', roll: 12 });
    expect(enc(session).combatants[0]!.initiative).toBe(12 + session.sheet.initiative.value);
    session.run(setInitiative, { id: 'you', total: 9 });
    expect(enc(session).combatants[0]!.initiative).toBe(9);
    session.run(setInitiative, { id: 'you', clear: true });
    expect(enc(session).combatants[0]!.initiative).toBeUndefined();
  });

  it('damages enemies through temp HP, warns at 0, never auto-defeats', () => {
    const session = fight();
    session.run(addCombatant, {
      kind: 'custom',
      name: 'Ogre',
      side: 'enemy',
      ac: 11,
      hp: 20,
      initiativeBonus: -1,
    });
    session.run(setCombatantTempHp, { id: who(session, 'Ogre').id, amount: 5 });
    const id = who(session, 'Ogre').id;
    session.run(damageCombatant, { id, amount: 8 });
    expect(who(session, 'Ogre')).toMatchObject({ tempHp: 0, hp: 17 });
    session.run(damageCombatant, { id, amount: 99 });
    expect(who(session, 'Ogre')).toMatchObject({ hp: 0, defeated: false });
    expect(session.try(damageCombatant, { id, amount: 1 }).result).toBe('warn');
    session.run(healCombatant, { id, amount: 4 });
    expect(who(session, 'Ogre').hp).toBe(4);
    session.run(toggleCombatantCondition, { id, condition: 'prone' });
    expect(who(session, 'Ogre').conditions).toEqual(['prone']);
    session.run(setDefeated, { id, defeated: true });
    expect(who(session, 'Ogre').defeated).toBe(true);
    expect(session.try(damageCombatant, { id: 'you', amount: 1 }).result).toBe('blocked');
  });

  it('removes a combatant but never you', () => {
    const session = fight();
    expect(session.try(removeCombatant, { id: 'you' }).result).toBe('blocked');
    session.run(removeCombatant, { id: 'companion:mastiff' });
    expect(enc(session).combatants).toHaveLength(1);
  });

  it('runs a three-round fight, restoring your turn each round, and undoes a turn', () => {
    const session = fight();
    session.run(addCombatant, {
      kind: 'creature',
      creatureId: 'creature.goblin',
      side: 'enemy',
      count: 2,
    });
    const bonus = session.sheet.initiative.value;
    session.run(setInitiative, { id: 'you', total: 15 });
    session.run(setInitiative, { id: 'companion:mastiff', total: 12 });
    session.run(setInitiative, { id: who(session, 'Goblin 1').id, total: 10 });
    // Goblin 2 has no initiative yet: skipped with a warning.
    expect(bonus).toBeTypeOf('number');
    expect(session.try(nextTurn, null).result).toBe('warn');

    session.run(nextTurn, null, true);
    expect(enc(session)).toMatchObject({ round: 1, currentId: 'you' });
    expect(session.live.combat).toMatchObject({ round: 1, turnActive: true });

    session.run(nextTurn, null, true);
    expect(enc(session).currentId).toBe('companion:mastiff');
    expect(session.live.combat!.turnActive).toBe(false);
    session.run(nextTurn, null, true);
    expect(who(session, 'Goblin 1').id).toBe(enc(session).currentId);

    const before = session.live.clock.seconds;
    session.run(nextTurn, null, true);
    expect(enc(session)).toMatchObject({ round: 2, currentId: 'you' });
    expect(session.live.clock.seconds).toBe(before + 6);
    session.run(nextTurn, null, true);
    session.run(nextTurn, null, true);
    session.run(nextTurn, null, true);
    expect(enc(session).round).toBe(3);

    session.undo();
    expect(enc(session).round).toBe(2);
  });

  it('skips defeated combatants', () => {
    const session = fight();
    session.run(setInitiative, { id: 'you', total: 15 });
    session.run(setInitiative, { id: 'companion:mastiff', total: 12 });
    session.run(setDefeated, { id: 'companion:mastiff', defeated: true });
    session.run(nextTurn, null);
    session.run(nextTurn, null);
    expect(enc(session)).toMatchObject({ round: 2, currentId: 'you' });
  });

  it('keeps a companion with its owner', () => {
    const session = fight();
    session.run(setInitiative, { id: 'you', total: 5 });
    session.run(setInitiative, { id: 'companion:mastiff', total: 20 });
    session.run(setCompanionWithOwner, { id: 'companion:mastiff', withOwner: true });
    expect(turnOrder(enc(session)).map((entry) => entry.id)).toEqual(['you', 'companion:mastiff']);
  });

  it('blocks Start Turn while the tracker runs, and Next turn without any initiative', () => {
    const session = fight();
    expect(session.try(startTurn, null).result).toBe('blocked');
    expect(session.try(nextTurn, null).result).toBe('blocked');
  });

  it('ends with combat, or on its own', () => {
    const session = fight();
    session.run(endEncounter, null);
    expect(session.live.encounter).toBeUndefined();
    expect(session.live.combat).toBeDefined();
    session.run(startEncounter, {});
    session.run(endCombat, null);
    expect(session.live.encounter).toBeUndefined();
  });
});
