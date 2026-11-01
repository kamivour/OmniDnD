import { describe, expect, it } from 'vitest';
import { startCombat } from './combat';
import { setExhaustion } from './effects';
import { useFeature } from './features';
import { applyDamage, setTempHp } from './hp';
import { adjustHitDice, completeLongRest, completeShortRest } from './rest';
import { castSpell } from './spells';
import { advanceTime } from './time';
import { freshState, seedState, Session, withLive } from './test-utils';

const BARDIC_INSPIRATION = 'feature.bard.bardic-inspiration';
const start = freshState.live.clock.seconds;

describe('completeShortRest', () => {
  it('spends Hit Dice (roll + CON) and adds Song of Rest', () => {
    const session = new Session(withLive(freshState, { hp: 13 }));
    expect(
      session.run(completeShortRest, { hitDice: [{ die: 'd8', roll: 2 }], songOfRest: 2 }),
    ).toBe('Short rest (1 h); 1 Hit Die + Song of Rest: HP 13 → 18');
    expect(session.live.hp).toBe(18);
    expect(session.live.hitDiceSpent).toEqual({ d8: 1 });
    expect(session.live.clock.seconds).toBe(start + 3600);
  });

  it('Bardic Inspiration (long rest at bard 3) and slots do not come back', () => {
    const session = new Session(seedState);
    session.run(completeShortRest, {});
    expect(session.live.featureUsesSpent).toEqual(seedState.live.featureUsesSpent);
    expect(session.live.slotsUsed).toEqual(seedState.live.slotsUsed);
  });

  it('a Hit Die heals at least 0 and never past max HP', () => {
    const session = new Session(withLive(freshState, { hp: 15 }));
    session.run(completeShortRest, {
      hitDice: [
        { die: 'd8', roll: 8 },
        { die: 'd8', roll: 8 },
      ],
    });
    expect(session.live.hp).toBe(19);
    expect(session.live.hitDiceSpent).toEqual({ d8: 2 });
  });

  it('blocks dice you do not have, bad rolls, and Song of Rest alone', () => {
    const session = new Session(withLive(freshState, { hitDiceSpent: { d8: 2 } }));
    const twoDice = [
      { die: 'd8' as const, roll: 3 },
      { die: 'd8' as const, roll: 4 },
    ];
    expect(session.preview(completeShortRest, { hitDice: twoDice }).reasons).toEqual([
      'Only 1 d8 Hit Dice left',
    ]);
    expect(
      session.preview(completeShortRest, { hitDice: [{ die: 'd8', roll: 9 }] }).reasons,
    ).toEqual(['d8 roll must be a whole number from 1 to 8']);
    expect(session.preview(completeShortRest, { songOfRest: 3 }).reasons).toEqual([
      'Song of Rest only adds to healing from spent Hit Dice',
    ]);
    // The Fool's own Song of Rest die is a d6.
    expect(
      session.preview(completeShortRest, { hitDice: [{ die: 'd8', roll: 3 }], songOfRest: 7 })
        .reasons,
    ).toEqual(['Song of Rest roll must be a whole number from 1 to 6']);
    expect(
      session.preview(completeShortRest, { hitDice: [{ die: 'd10', roll: 3 }] }).reasons,
    ).toEqual(['No d10 Hit Dice left']);
  });

  it('not in combat', () => {
    const session = new Session();
    session.run(startCombat, null);
    expect(session.preview(completeShortRest, {}).reasons).toEqual(['End combat before resting']);
  });
});

describe('completeLongRest', () => {
  it('restores HP, slots, features and half the Hit Dice; moves the clock 8 h', () => {
    const session = new Session(
      withLive(seedState, {
        hitDiceSpent: { d8: 3 },
        tempHp: 4,
        deathSaves: { success: 1, fail: 0 },
      }),
    );
    expect(session.run(completeLongRest, null)).toBe(
      'Long rest (8 h); temp HP cleared; HP 11 → 19; restored spell slots, Bardic Inspiration; 1 Hit Die back',
    );
    expect(session.live).toMatchObject({
      hp: 19,
      tempHp: 0,
      deathSaves: { success: 0, fail: 0 },
      slotsUsed: freshState.live.slotsUsed,
      featureUsesSpent: {},
      hitDiceSpent: { d8: 2 },
      clock: { seconds: start + 8 * 3600 },
      lastLongRestEnd: start + 8 * 3600,
    });
  });

  it('warns for a second long rest within 24 hours', () => {
    const session = new Session();
    session.run(completeLongRest, null);
    expect(session.preview(completeLongRest, null)).toEqual({
      result: 'warn',
      reasons: ['Less than 24 h since last long rest'],
    });
    // Rest starts 24 h after the last one started (16 h after it ended): fine.
    session.run(advanceTime, { seconds: 16 * 3600 });
    expect(session.preview(completeLongRest, null)).toEqual({ result: 'ok', reasons: [] });
  });

  it('removes one exhaustion level and restores the full max HP', () => {
    const session = new Session();
    session.run(setExhaustion, { level: 4 });
    expect(session.run(completeLongRest, null)).toBe(
      'Long rest (8 h); exhaustion 4 → 3; HP 9 → 19',
    );
    expect(session.live.exhaustion).toBe(3);
    expect(session.live.hp).toBe(19);
  });

  it('needs at least 1 HP and no combat', () => {
    const down = new Session(withLive(freshState, { hp: 0, conditions: ['unconscious'] }));
    expect(down.preview(completeLongRest, null).reasons).toEqual(["Can't long rest at 0 HP"]);
    const fighting = new Session();
    fighting.run(startCombat, null);
    expect(fighting.preview(completeLongRest, null).reasons).toEqual(['End combat before resting']);
  });

  it('long rest is undoable to the exact previous state', () => {
    const session = new Session(seedState);
    session.run(castSpell, { spellId: 'spell.invisibility', slotLevel: 2 });
    session.run(applyDamage, { amount: 3 });
    session.run(setTempHp, { amount: 2 });
    session.run(useFeature, { featureId: BARDIC_INSPIRATION });
    const before = session.state;
    session.run(completeLongRest, null);
    session.undo();
    expect(session.state).toEqual(before);
  });
});

describe('adjustHitDice', () => {
  it('sets spent Hit Dice', () => {
    const session = new Session();
    expect(session.run(adjustHitDice, { die: 'd8', spent: 1 })).toBe('d8 Hit Dice: 2/3 left');
    expect(session.live.hitDiceSpent).toEqual({ d8: 1 });
    session.run(adjustHitDice, { die: 'd8', spent: 0 });
    expect(session.live.hitDiceSpent).toEqual({});
  });

  it('blocks dice you do not have and out-of-range counts', () => {
    const session = new Session();
    expect(session.preview(adjustHitDice, { die: 'd12', spent: 1 }).reasons).toEqual([
      'You have no d12 Hit Dice',
    ]);
    expect(session.preview(adjustHitDice, { die: 'd8', spent: 4 }).reasons).toEqual([
      'Spent Hit Dice must be a whole number from 0 to 3',
    ]);
  });
});
