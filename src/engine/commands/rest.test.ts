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
    const session = new Session(withLive(freshState, { hp: 13, hitDiceSpent: { d8: 2 } }));
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

  it("accepts another bard's larger Song of Rest and undoes the whole rest exactly", () => {
    const session = new Session(withLive(seedState, { hp: 1 }));
    session.run(castSpell, { spellId: 'spell.invisibility', slotLevel: 2, onSelf: true });
    const before = session.state;
    for (const roll of [0, 13]) {
      expect(
        session.preview(completeShortRest, {
          hitDice: [{ die: 'd8', roll: 1 }],
          songOfRest: roll,
          songOfRestSource: 'other',
        }),
      ).toEqual({
        result: 'blocked',
        reasons: ['Song of Rest roll must be a whole number from 1 to 12'],
      });
    }
    expect(
      session.run(completeShortRest, {
        hitDice: [{ die: 'd8', roll: 1 }],
        songOfRest: 12,
        songOfRestSource: 'other',
      }),
    ).toBe(
      'Short rest (1 h); Invisibility ended; 1 Hit Die + Song of Rest (other bard): HP 1 → 15',
    );
    expect(session.live.hp).toBe(15);
    expect(session.live.hitDiceSpent).toEqual({ d8: 1 });
    expect(session.live.concentration).toBeUndefined();
    expect(session.live.effects).toEqual([]);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('keeps the owned Song of Rest die cap for an explicit self source', () => {
    const session = new Session(withLive(freshState, { hp: 1 }));
    expect(
      session.preview(completeShortRest, {
        hitDice: [{ die: 'd8', roll: 1 }],
        songOfRest: 7,
        songOfRestSource: 'self',
      }),
    ).toEqual({
      result: 'blocked',
      reasons: ['Song of Rest roll must be a whole number from 1 to 6'],
    });
    expect(
      session.run(completeShortRest, {
        hitDice: [{ die: 'd8', roll: 1 }],
        songOfRest: 6,
        songOfRestSource: 'self',
      }),
    ).toBe('Short rest (1 h); 1 Hit Die + Song of Rest: HP 1 → 9');
  });

  it('defaults to another bard without the feature and blocks an explicit self source', () => {
    const state = structuredClone(freshState);
    state.build.classes[0]!.level = 1;
    state.build.hpEntries = state.build.hpEntries.slice(0, 1);
    state.live.hp = 1;
    const session = new Session(state);
    expect(
      session.preview(completeShortRest, {
        hitDice: [{ die: 'd8', roll: 1 }],
        songOfRest: 1,
        songOfRestSource: 'self',
      }),
    ).toEqual({ result: 'blocked', reasons: ['You do not have Song of Rest'] });
    expect(
      session.run(completeShortRest, {
        hitDice: [{ die: 'd8', roll: 1 }],
        songOfRest: 12,
      }),
    ).toBe('Short rest (1 h); 1 Hit Die + Song of Rest (other bard): HP 1 → 9');
  });

  it('blocks Song of Rest when negative CON makes all Hit Die healing zero', () => {
    const state = structuredClone(freshState);
    state.build.abilityScores.base.CON = 5;
    state.live.hp = 1;
    const session = new Session(state);
    expect(session.sheet.abilities.CON.mod).toBe(-2);
    const before = session.state;
    expect(
      session.preview(completeShortRest, {
        hitDice: [{ die: 'd8', roll: 1 }],
        songOfRest: 2,
      }),
    ).toEqual({
      result: 'blocked',
      reasons: ['Song of Rest only adds to healing from spent Hit Dice'],
    });
    expect(session.state).toEqual(before);
    const noSong = new Session(state);
    expect(noSong.run(completeShortRest, { hitDice: [{ die: 'd8', roll: 1 }] })).toBe(
      'Short rest (1 h); 1 Hit Die: HP 1 → 1',
    );
    expect(noSong.live.hitDiceSpent).toEqual({ d8: 1 });
    expect(
      session.run(completeShortRest, {
        hitDice: [
          { die: 'd8', roll: 1 },
          { die: 'd8', roll: 3 },
        ],
        songOfRest: 2,
      }),
    ).toBe('Short rest (1 h); 2 Hit Dice + Song of Rest: HP 1 → 4');
  });

  it('blocks Song of Rest when Hit Dice cannot restore HP at maximum HP', () => {
    const session = new Session();
    expect(
      session.preview(completeShortRest, {
        hitDice: [{ die: 'd8', roll: 1 }],
        songOfRest: 2,
      }),
    ).toEqual({
      result: 'blocked',
      reasons: ['Song of Rest only adds to healing from spent Hit Dice'],
    });
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
