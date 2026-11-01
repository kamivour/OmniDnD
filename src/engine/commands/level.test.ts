import { describe, expect, it } from 'vitest';
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
    expect(session.state.build.hpEntries[3]).toMatchObject({ value: 5, method: 'average' });
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
