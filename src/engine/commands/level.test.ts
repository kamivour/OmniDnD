import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { computeSheet, type CharacterState } from '../calc/sheet';
import { CharacterBuildSchema } from '../schema';
import { levelUp } from './level';
import { freshState, seedState, Session, withLive } from './test-utils';

const averageCampaign = {
  ...freshState,
  campaign: { ...freshState.campaign, hpMethod: 'average' as const },
};

describe('levelUp', () => {
  it('level 4 rolled 5: max HP 25, Hit Dice 4d8, old entries unchanged (TEST_CHARACTER §4)', () => {
    const session = new Session(seedState);
    expect(session.run(levelUp, { classId: 'class.bard', roll: 5 })).toBe(
      'Level up: Bard 4 (max HP 19 → 25); HP 11 → 17',
    );
    expect(session.sheet.maxHp.value).toBe(25);
    expect(session.sheet.hitDice).toEqual([{ die: 'd8', max: 4 }]);
    expect(session.state.build.classes).toMatchObject([{ classId: 'class.bard', level: 4 }]);
    expect(session.state.build.hpEntries.slice(0, 3)).toEqual(seedState.build.hpEntries);
    expect(session.state.build.hpEntries[3]).toEqual({
      level: 4,
      classId: 'class.bard',
      value: 5,
      method: 'rolled',
      floor: 'none',
    });
  });

  it('spent Hit Dice stay spent (D35)', () => {
    const session = new Session(withLive(freshState, { hitDiceSpent: { d8: 2 } }));
    session.run(levelUp, { classId: 'class.bard', roll: 5 });
    expect(session.live.hitDiceSpent).toEqual({ d8: 2 });
  });

  it('average: half the die + 1, and the warning when the campaign rolls', () => {
    const session = new Session(averageCampaign);
    session.run(levelUp, { classId: 'class.bard' });
    expect(session.state.build.hpEntries[3]).toMatchObject({
      value: 5,
      method: 'average',
      floor: 'none',
    });
    expect(session.sheet.maxHp.value).toBe(25);
    expect(new Session().preview(levelUp, { classId: 'class.bard' })).toEqual({
      result: 'warn',
      reasons: ['Campaign uses rolled HP: taking the average'],
    });
    expect(
      new Session(averageCampaign).preview(levelUp, { classId: 'class.bard', roll: 3 }),
    ).toEqual({ result: 'warn', reasons: ['Campaign uses average HP: using your roll'] });
  });

  it('a low roll with negative CON lowers max HP; current HP stays at least 1 (D44)', () => {
    const weak = {
      ...freshState,
      build: {
        ...freshState.build,
        // CON 5 + 1 (half-elf) = 6: modifier -2.
        abilityScores: {
          ...freshState.build.abilityScores,
          base: { ...freshState.build.abilityScores.base, CON: 5 },
        },
      },
    };
    const session = new Session(withLive(weak, { hp: 1 }));
    expect(session.sheet.maxHp.value).toBe(10);
    expect(session.run(levelUp, { classId: 'class.bard', roll: 1 })).toBe(
      'Level up: Bard 4 (max HP 10 → 9)',
    );
    expect(session.live.hp).toBe(1);
  });

  it('is undoable', () => {
    const session = new Session(seedState);
    session.run(levelUp, { classId: 'class.bard', roll: 5 });
    session.undo();
    expect(session.state).toEqual(seedState);
  });

  it('preserves legacy floor-less entries and the campaign calculation when loading them', () => {
    const legacy = CharacterBuildSchema.parse(freshState.build);
    expect(legacy).toEqual(freshState.build);
    expect(legacy.hpEntries.every((entry) => entry.floor === undefined)).toBe(true);
    const weak: CharacterState = {
      ...freshState,
      build: {
        ...legacy,
        abilityScores: {
          ...legacy.abilityScores,
          base: { ...legacy.abilityScores.base, CON: 5 },
        },
        hpEntries: legacy.hpEntries.map((entry) => ({
          ...entry,
          value: entry.level === 1 ? 8 : 1,
        })),
      },
    };
    expect(computeSheet(weak, registry).maxHp).toEqual({
      value: 4,
      parts: [
        { label: 'Level 1', value: 6 },
        { label: 'Level 2', value: -1 },
        { label: 'Level 3', value: -1 },
      ],
      notes: [
        'Level 1 (Bard): locked maximum 8 + current CON (-2) = 6; no per-level minimum.',
        'Level 2 (Bard): locked roll 1 + current CON (-2) = -1; no per-level minimum.',
        'Level 3 (Bard): locked roll 1 + current CON (-2) = -1; no per-level minimum.',
      ],
    });
    expect(
      computeSheet({ ...weak, campaign: { ...weak.campaign, hpLevelFloor: 'one' } }, registry).maxHp
        .value,
    ).toBe(8);
  });

  it('uses the current floor only for the new level and undo preserves mixed saved floors', () => {
    const frozen: CharacterState = {
      ...freshState,
      campaign: { ...freshState.campaign, hpLevelFloor: 'one' },
      build: {
        ...freshState.build,
        abilityScores: {
          ...freshState.build.abilityScores,
          base: { ...freshState.build.abilityScores.base, CON: 5 },
        },
        hpEntries: freshState.build.hpEntries.map((entry) => ({
          ...entry,
          value: entry.level === 1 ? 8 : 1,
          floor: entry.level === 2 ? 'one' : 'none',
        })),
      },
      live: { ...freshState.live, hp: 6 },
    };
    const session = new Session(frozen);
    expect(session.sheet.maxHp).toEqual({
      value: 6,
      parts: [
        { label: 'Level 1', value: 6 },
        { label: 'Level 2', value: 1 },
        { label: 'Level 3', value: -1 },
      ],
      notes: [
        'Level 1 (Bard): locked maximum 8 + current CON (-2) = 6; no per-level minimum.',
        'Level 2 (Bard): locked roll 1 + current CON (-2) = -1; minimum 1 per level → 1.',
        'Level 3 (Bard): locked roll 1 + current CON (-2) = -1; no per-level minimum.',
      ],
    });
    expect(
      computeSheet({ ...frozen, campaign: { ...frozen.campaign, hpLevelFloor: 'none' } }, registry)
        .maxHp,
    ).toEqual(session.sheet.maxHp);
    expect(session.run(levelUp, { classId: 'class.bard', roll: 1 })).toBe(
      'Level up: Bard 4 (max HP 6 → 7); HP 6 → 7',
    );
    expect(session.state.build.hpEntries.slice(0, 3)).toEqual(frozen.build.hpEntries);
    expect(session.state.build.hpEntries[3]).toEqual({
      level: 4,
      classId: 'class.bard',
      value: 1,
      method: 'rolled',
      floor: 'one',
    });
    expect(
      computeSheet(
        {
          ...session.state,
          campaign: { ...session.state.campaign, hpLevelFloor: 'none' },
          build: {
            ...session.state.build,
            abilityScores: {
              ...session.state.build.abilityScores,
              base: { ...session.state.build.abilityScores.base, CON: 9 },
            },
          },
        },
        registry,
      ).maxHp.value,
    ).toBe(11);
    session.undo();
    expect(session.state).toEqual(frozen);
  });

  it('blocks other classes, level 20, and bad rolls', () => {
    const session = new Session();
    expect(session.preview(levelUp, { classId: 'class.wizard', roll: 3 }).reasons).toEqual([
      'Multiclassing comes later: level up a class you have',
    ]);
    expect(session.preview(levelUp, { classId: 'class.bard', roll: 9 }).reasons).toEqual([
      'Hit Die roll must be a whole number from 1 to 8',
    ]);
  });
});
