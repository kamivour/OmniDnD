import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import { pendingChoices } from '../calc/pending-choices';
import { createCharacter } from '../creation';
import type { CharacterState } from '../calc/sheet';
import { resolveChoices } from './resolve-choices';
import { runCommand, undo } from './runner';

const meta = { eventId: 'resolve', realTime: '2026-11-08T00:00:00.000Z' };

function fighter(level: number): CharacterState {
  const campaign = structuredClone(seedFile.campaign);
  const created = createCharacter(
    {
      id: 'resolve-test',
      name: 'Tester',
      campaign,
      raceId: 'race.human',
      classId: 'class.fighter',
      backgroundId: 'background.acolyte',
      level,
      abilityBases: { STR: 15, DEX: 13, CON: 14, INT: 12, WIS: 10, CHA: 8 },
      racialChoices: [],
      hpRolls: Array.from({ length: level - 1 }, () => 6),
    },
    registry,
  );
  return { campaign, ...created };
}

const kinds = (state: CharacterState) => pendingChoices(state, registry).map((item) => item.kind);

describe('resolveChoices', () => {
  it('settles subclass, ability increase and fighting style, then clears the list', () => {
    const state = fighter(4);
    expect(kinds(state)).toEqual(expect.arrayContaining(['subclass', 'asi', 'option']));
    const result = runCommand(
      resolveChoices,
      state,
      {
        classId: 'class.fighter',
        choices: {
          subclassId: 'subclass.fighter.champion',
          asi: { kind: 'abilities', increases: [{ ability: 'STR', value: 2 }] },
          features: ['feature.fighter.fighting-style-defense'],
        },
      },
      registry,
      meta,
    );
    if (result.result !== 'ok') throw new Error(JSON.stringify(result));
    expect(kinds(result.next)).toEqual([]);
    expect(result.next.build.classes[0]?.subclassId).toBe('subclass.fighter.champion');
    const undone = undo(result.next, [result.event], { eventId: 'undo', realTime: meta.realTime });
    if (undone.result !== 'ok') throw new Error('undo blocked');
    expect(undone.next.build.classes[0]?.subclassId).toBeUndefined();
  });

  it('blocks picks that are not open', () => {
    const state = fighter(2);
    const blocked = (choices: object) =>
      runCommand(resolveChoices, state, { classId: 'class.fighter', choices }, registry, meta)
        .result;
    expect(blocked({ subclassId: 'subclass.fighter.champion' })).toBe('blocked');
    expect(blocked({ asi: { kind: 'abilities', increases: [{ ability: 'STR', value: 2 }] } })).toBe(
      'blocked',
    );
    expect(
      blocked({
        features: [
          'feature.fighter.fighting-style-defense',
          'feature.fighter.fighting-style-archery',
        ],
      }),
    ).toBe('blocked');
  });

  it('uses a different level for each later ability increase', () => {
    let state = fighter(8);
    for (const ability of ['STR', 'CON', 'DEX'] as const) {
      const result = runCommand(
        resolveChoices,
        state,
        {
          classId: 'class.fighter',
          choices: { asi: { kind: 'abilities', increases: [{ ability, value: 2 }] } },
        },
        registry,
        meta,
      );
      if (result.result !== 'ok') throw new Error(JSON.stringify(result));
      state = result.next;
    }
    expect(kinds(state)).not.toContain('asi');
  });
});
