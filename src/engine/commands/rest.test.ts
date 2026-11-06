import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { startCombat } from './combat';
import { addEffect, setExhaustion } from './effects';
import { useFeature } from './features';
import { applyDamage, setTempHp } from './hp';
import { adjustHitDice, completeLongRest, completeShortRest } from './rest';
import { runCommand } from './runner';
import { castSpell } from './spells';
import { advanceTime } from './time';
import { freshState, seedState, Session, withLive } from './test-utils';

const BARDIC_INSPIRATION = 'feature.bard.bardic-inspiration';
const start = freshState.live.clock.seconds;

describe('campaign rest variants', () => {
  it.each([
    ['gritty', 8 * 3600, '8 h'],
    ['epic', 5 * 60, '5 min'],
    ['standard', 3600, '1 h'],
    ['unknown-legacy-value', 3600, '1 h'],
  ] as const)(
    '%s short rest uses its duration for recovery, expiry and Undo',
    (variant, seconds, label) => {
      const state = structuredClone(seedState);
      state.campaign.optionalRules = { rests: variant };
      const session = new Session(state);
      session.run(addEffect, { name: 'Expires during rest', durationSeconds: seconds });
      session.run(addEffect, { name: 'Survives rest', durationSeconds: seconds + 1 });
      const before = structuredClone(session.state);
      expect(session.run(completeShortRest, { hitDice: [{ die: 'd8', roll: 2 }] })).toContain(
        `Short rest (${label})`,
      );
      expect(session.live.clock.seconds).toBe(start + seconds);
      expect(session.live.hp).toBe(14);
      expect(session.live.hitDiceSpent.d8).toBe((before.live.hitDiceSpent.d8 ?? 0) + 1);
      expect(session.live.slotsUsed).toEqual(before.live.slotsUsed);
      expect(session.live.featureUsesSpent).toEqual(before.live.featureUsesSpent);
      expect(session.live.effects.map(({ name }) => name)).toEqual(['Survives rest']);
      session.undo();
      expect(session.state).toEqual(before);
    },
  );

  it.each([
    ['gritty', 7 * 86400, '7 days'],
    ['epic', 3600, '1 h'],
    ['standard', 8 * 3600, '8 h'],
    ['unknown-legacy-value', 8 * 3600, '8 h'],
  ] as const)(
    '%s long rest keeps normal recovery and undoes the full time span',
    (variant, seconds, label) => {
      const state = structuredClone(seedState);
      state.campaign.optionalRules = { rests: variant };
      state.live.tempHp = 3;
      state.live.exhaustion = 2;
      state.live.hitDiceSpent = { d8: 3 };
      const session = new Session(state);
      session.run(addEffect, { name: 'Expires during rest', durationSeconds: seconds });
      session.run(addEffect, { name: 'Survives rest', durationSeconds: seconds + 1 });
      const before = structuredClone(session.state);
      expect(session.run(completeLongRest, null)).toContain(`Long rest (${label})`);
      expect(session.live.clock.seconds).toBe(start + seconds);
      expect(session.live.lastLongRestEnd).toBe(start + seconds);
      expect(session.live.hp).toBe(19);
      expect(session.live.tempHp).toBe(0);
      expect(session.live.exhaustion).toBe(1);
      expect(session.live.hitDiceSpent).toEqual({ d8: 2 });
      expect(session.live.slotsUsed.every((used) => used === 0)).toBe(true);
      expect(session.live.featureUsesSpent[BARDIC_INSPIRATION] ?? 0).toBe(0);
      expect(session.live.effects.map(({ name }) => name)).toEqual(['Survives rest']);
      session.undo();
      expect(session.state).toEqual(before);
    },
  );

  it('keeps the 24-hour warning with epic rests and uses their actual duration at the boundary', () => {
    const state = structuredClone(seedState);
    state.campaign.optionalRules = { rests: 'epic' };
    state.live.lastLongRestEnd = start;
    state.live.clock.seconds = start + 23 * 3600;
    const session = new Session(state);
    expect(session.preview(completeLongRest, null).result).toBe('ok');
    session.state = {
      ...session.state,
      live: { ...session.live, clock: { seconds: session.live.clock.seconds - 1 } },
    };
    expect(session.preview(completeLongRest, null)).toEqual({
      result: 'warn',
      reasons: ['Less than 24 h since last long rest'],
    });
  });

  it('passes dawn during a gritty week without rolling item recovery or losing exact Undo', () => {
    const state = structuredClone(seedState);
    state.campaign.optionalRules = { rests: 'gritty' };
    state.build.items.push(
      { instanceId: 'eyes', itemId: 'item.eyes-of-charming' },
      { instanceId: 'wand', itemId: 'item.wand-of-magic-missiles' },
    );
    state.live.items.eyes = { qty: 1, equipped: true, attuned: true, charges: 1 };
    state.live.items.wand = { qty: 1, equipped: false, attuned: false, charges: 1 };
    const session = new Session(state);
    session.run(addEffect, { name: 'One-day ward', durationSeconds: 86400 });
    const before = structuredClone(session.state);
    const text = session.run(completeLongRest, null);
    expect(text).toContain('Long rest (7 days)');
    expect(text).toContain('One-day ward ended');
    expect(text).toContain('recharged Eyes of Charming');
    expect(text).toContain('roll to recharge Wand of Magic Missiles');
    expect(session.live.items.eyes).toMatchObject({ charges: 3 });
    // Large time advances preserve one unresolved player roll rather than inventing rolls.
    expect(session.live.items.wand).toMatchObject({ charges: 1, rechargePending: true });
    expect(session.live.effects).toEqual([]);
    expect(session.live.clock.seconds).toBe(start + 7 * 86400);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('blocks a gritty rest that would overflow game time, including forced Manual commands', () => {
    for (const long of [false, true]) {
      const state = structuredClone(seedState);
      state.campaign.optionalRules = { rests: 'gritty' };
      state.live.clock.seconds = Number.MAX_SAFE_INTEGER - 3600;
      const options = {
        eventId: 'overflow-rest',
        realTime: '2026-11-06T00:00:00.000Z',
        automation: 'manual' as const,
        force: true,
      };
      const result = long
        ? runCommand(completeLongRest, state, null, registry, options)
        : runCommand(completeShortRest, state, {}, registry, options);
      expect(result).toEqual({
        result: 'blocked',
        reasons: ['Time advance exceeds the supported game clock range'],
      });
    }
  });
});

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
    session.run(advanceTime, { seconds: 16 * 3600 - 1 });
    expect(session.preview(completeLongRest, null)).toEqual({
      result: 'warn',
      reasons: ['Less than 24 h since last long rest'],
    });
    session.run(advanceTime, { seconds: 1 });
    expect(session.preview(completeLongRest, null)).toEqual({ result: 'ok', reasons: [] });
  });

  it('recovers one Hit Die at level 1 and never grants more dice than were spent', () => {
    const state = structuredClone(freshState);
    state.build.classes[0]!.level = 1;
    state.build.hpEntries = state.build.hpEntries.slice(0, 1);
    state.live.hitDiceSpent = { d8: 1 };
    const session = new Session(state);
    expect(session.run(completeLongRest, null)).toContain('1 Hit Die back');
    expect(session.live.hitDiceSpent).toEqual({});
    expect(session.sheet.hitDice).toEqual([{ die: 'd8', max: 1 }]);
    expect(session.run(completeLongRest, null, true)).not.toContain('Hit Die back');
    expect(session.live.hitDiceSpent).toEqual({});
  });

  it.each([
    [{ d8: 2, d6: 3 }, { d6: 3 }, '2 Hit Dice back'],
    [{ d8: 1, d6: 3 }, { d6: 2 }, '2 Hit Dice back'],
    [{ d6: 1 }, {}, '1 Hit Die back'],
  ] as const)(
    'recovers the shared floor-half budget from spent mixed pools, largest first (%j)',
    (spent, remaining, note) => {
      const state = structuredClone(freshState);
      state.build.classes = [
        { classId: 'class.bard', level: 2 },
        { classId: 'class.wizard', level: 3 },
      ];
      state.build.hpEntries = Array.from({ length: 5 }, (_, index) => ({
        level: index + 1,
        classId: index < 2 ? 'class.bard' : 'class.wizard',
        value: index === 0 ? 8 : index < 2 ? 5 : 4,
        method: index === 0 ? 'max' : 'average',
      }));
      state.live.hitDiceSpent = { ...spent };
      const session = new Session(state);
      expect(session.sheet.hitDice).toEqual([
        { die: 'd8', max: 2 },
        { die: 'd6', max: 3 },
      ]);
      expect(session.run(completeLongRest, null)).toContain(note);
      expect(session.live.hitDiceSpent).toEqual(remaining);
    },
  );

  it('Manual suppresses the 24-hour warning without marking an override', () => {
    const session = new Session(seedState);
    session.run(completeLongRest, null);
    const before = structuredClone(session.state);
    const result = runCommand(completeLongRest, session.state, null, registry, {
      eventId: 'manual-long-rest',
      realTime: '2026-11-03T10:00:00.000Z',
      automation: 'manual',
    });
    expect(result.result).toBe('ok');
    if (result.result !== 'ok') return;
    expect(result.reasons).toEqual([]);
    expect(result.event.override).toBeUndefined();
    expect(result.next.live.clock.seconds).toBe(before.live.clock.seconds + 8 * 3600);
    expect(session.state).toEqual(before);
  });

  it('health and combat blocks survive force and Manual without changing state or history', () => {
    const fighting = new Session();
    fighting.run(startCombat, null);
    const cases = [
      [withLive(freshState, { hp: 0, conditions: ['unconscious'] }), "Can't long rest at 0 HP"],
      [
        withLive(freshState, { hp: 0, deathSaves: { success: 3, fail: 0 } }),
        "Can't long rest at 0 HP",
      ],
      [withLive(freshState, { hp: 0, deathSaves: { success: 0, fail: 3 } }), 'You are dead'],
      [withLive(freshState, { exhaustion: 6 }), 'You are dead'],
      [fighting.state, 'End combat before resting'],
    ] as const;
    for (const [state, reason] of cases) {
      const session = new Session(state);
      const before = structuredClone({ state: session.state, events: session.events });
      for (const automation of ['assisted', 'manual'] as const) {
        for (const force of [false, true]) {
          expect(
            runCommand(completeLongRest, session.state, null, registry, {
              eventId: 'blocked-long-rest',
              realTime: '2026-11-03T10:00:00.000Z',
              automation,
              force,
            }),
          ).toEqual({ result: 'blocked', reasons: [reason] });
          expect({ state: session.state, events: session.events }).toEqual(before);
        }
      }
    }
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
