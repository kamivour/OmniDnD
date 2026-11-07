import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { computeSheet } from '../calc/sheet';
import {
  applyDamage,
  concentrationSaveDc,
  heal,
  healthDetails,
  rollDeathSave,
  setTempHp,
  type ApplyDamagePayload,
  type AmountPayload,
  type DeathSavePayload,
} from './hp';
import { runCommand } from './runner';
import { freshState, Session, withLive } from './test-utils';

const down = (deathSaves = { success: 0, fail: 0 }) =>
  withLive(freshState, { hp: 0, conditions: ['unconscious'], deathSaves });

describe('concentrationSaveDc', () => {
  it('is half the damage, at least 10', () => {
    expect(concentrationSaveDc(8)).toBe(10);
    expect(concentrationSaveDc(21)).toBe(10);
    expect(concentrationSaveDc(22)).toBe(11);
    expect(concentrationSaveDc(45)).toBe(22);
  });
});

describe('applyDamage', () => {
  it('lowers HP', () => {
    const session = new Session();
    expect(session.run(applyDamage, { amount: 12 })).toBe('Took 12 damage (HP 19 → 7)');
    expect(session.live.hp).toBe(7);
  });

  it('temp HP absorb damage first', () => {
    const session = new Session(withLive(freshState, { tempHp: 5 }));
    expect(session.run(applyDamage, { amount: 8 })).toBe(
      'Took 8 damage (HP 19 → 16); temp HP absorbed 5',
    );
    expect(session.live.tempHp).toBe(0);
  });

  it('at 0 HP you fall unconscious', () => {
    const session = new Session();
    session.run(applyDamage, { amount: 25 });
    expect(session.live.hp).toBe(0);
    expect(session.live.conditions).toEqual(['unconscious']);
    expect(session.live.deathSaves).toEqual({ success: 0, fail: 0 });
  });

  it('kills outright when the damage left over reaches max HP', () => {
    const session = new Session(withLive(freshState, { hp: 7 }));
    expect(session.run(applyDamage, { amount: 26 })).toBe(
      'Took 26 damage (HP 7 → 0); instant death (massive damage)',
    );
    expect(session.live.deathSaves.fail).toBe(3);
    expect(session.preview(heal, { amount: 5 })).toEqual({
      result: 'blocked',
      reasons: ['You are dead'],
    });
  });

  it('damage at 0 HP is a death save failure, a critical two', () => {
    const session = new Session(down());
    expect(session.run(applyDamage, { amount: 3 })).toBe(
      'Took 3 damage (HP 0 → 0); 1 death save failure',
    );
    expect(session.run(applyDamage, { amount: 3, critical: true })).toBe(
      'Took 3 critical damage (HP 0 → 0); 2 death save failures; dead',
    );
    expect(session.live.deathSaves.fail).toBe(3);
  });

  it('damage ends stability', () => {
    const session = new Session(down({ success: 3, fail: 1 }));
    session.run(applyDamage, { amount: 2 });
    expect(session.live.deathSaves).toEqual({ success: 0, fail: 1 });
  });

  it.each([false, true])(
    'damage fully absorbed by temp HP still ends stability and counts failures at 0 HP (critical %s)',
    (critical) => {
      const state = withLive(down({ success: 3, fail: 2 }), { tempHp: 10 });
      const session = new Session(state);
      session.run(applyDamage, { amount: 1, critical });
      expect(session.live.hp).toBe(0);
      expect(session.live.tempHp).toBe(9);
      expect(session.live.deathSaves).toEqual({ success: 0, fail: critical ? 2 : 1 });
      session.undo();
      expect(session.state).toEqual(state);
    },
  );

  it('counts only the damage left after temp HP toward instant death at 0 HP', () => {
    const state = withLive(down(), { tempHp: 10 });
    const max = computeSheet(state, registry).maxHp.value;
    // Temp HP soak 10: one point short of max HP leaves one failure; exactly max HP is death.
    const session = new Session(state);
    expect(session.preview(applyDamage, { amount: max + 9 })).toEqual({
      result: 'ok',
      reasons: [],
    });
    session.run(applyDamage, { amount: max + 9 });
    expect(session.live.deathSaves).toEqual({ success: 0, fail: 1 });
    const massive = new Session(state);
    massive.run(applyDamage, { amount: max + 10 });
    expect(massive.live.deathSaves.fail).toBe(3);
  });

  it('blocks amounts below 1', () => {
    expect(new Session().preview(applyDamage, { amount: 0 }).reasons).toEqual([
      'Damage must be a whole number of at least 1',
    ]);
  });
});

describe('healthDetails', () => {
  it.each([
    [freshState, 'alive', true, false],
    [down(), 'dying', true, true],
    [down({ success: 3, fail: 2 }), 'stable', true, false],
    [withLive(down({ success: 0, fail: 3 }), { conditions: [] }), 'dead', false, false],
    [withLive(freshState, { exhaustion: 6 }), 'dead', false, false],
  ] as const)(
    'derives %s status as %s with legal HP/death controls',
    (state, status, allowed, canRollDeathSave) => {
      const sheet = computeSheet(state, registry);
      const before = structuredClone(state);
      expect(healthDetails({ live: state.live, sheet })).toEqual({
        hp: state.live.hp,
        maxHp: sheet.maxHp.value,
        tempHp: state.live.tempHp,
        status,
        canTakeDamage: allowed,
        canHeal: allowed,
        canRollDeathSave,
      });
      expect(state).toEqual(before);
    },
  );

  it('tracks Nat 1 and Nat 20 outcomes and preserves exact Undo', () => {
    const session = new Session(down());
    session.run(rollDeathSave, { roll: 1 });
    expect(session.live.deathSaves.fail).toBe(2);
    expect(healthDetails({ live: session.live, sheet: session.sheet }).status).toBe('dying');
    const before = structuredClone(session.state);
    session.run(rollDeathSave, { roll: 20 });
    expect(healthDetails({ live: session.live, sheet: session.sheet })).toMatchObject({
      hp: 1,
      status: 'alive',
      canRollDeathSave: false,
    });
    session.undo();
    expect(session.state).toEqual(before);
  });
});

describe('strict HP command payloads', () => {
  it.each([
    null,
    [],
    {},
    { amount: '1' },
    { amount: 1, critical: 'false' },
    { amount: 1, critical: 1 },
    { amount: 1, extra: true },
    { amount: Number.NaN },
    { amount: Number.POSITIVE_INFINITY },
    { amount: Number.MAX_SAFE_INTEGER + 1 },
  ])('blocks malformed damage under force/Manual without mutation (%j)', (payload) => {
    const state = withLive(down(), { tempHp: 5 });
    const before = structuredClone(state);
    expect(
      runCommand(applyDamage, state, payload as ApplyDamagePayload, registry, {
        eventId: 'invalid-damage',
        realTime: '2026-11-03T08:00:00.000Z',
        automation: 'manual',
        force: true,
      }).result,
    ).toBe('blocked');
    expect(state).toEqual(before);
  });

  it.each([
    null,
    [],
    {},
    { amount: '1' },
    { amount: 1, critical: false },
    { amount: 1, extra: true },
    { amount: Number.NaN },
    { amount: Number.MAX_SAFE_INTEGER + 1 },
  ])('blocks malformed healing and temp HP rather than ignoring extra fields (%j)', (payload) => {
    const before = structuredClone(freshState);
    for (const command of [heal, setTempHp]) {
      expect(
        runCommand(command, freshState, payload as AmountPayload, registry, {
          eventId: 'invalid-hp',
          realTime: '2026-11-03T08:00:00.000Z',
          automation: 'manual',
          force: true,
        }).result,
      ).toBe('blocked');
    }
    expect(freshState).toEqual(before);
  });

  it.each([null, [], {}, { roll: '20' }, { roll: 20, extra: true }, { roll: Number.NaN }])(
    'blocks malformed death saves under force/Manual (%j)',
    (payload) => {
      const state = down();
      const before = structuredClone(state);
      expect(
        runCommand(rollDeathSave, state, payload as DeathSavePayload, registry, {
          eventId: 'invalid-death-save',
          realTime: '2026-11-03T08:00:00.000Z',
          automation: 'manual',
          force: true,
        }).result,
      ).toBe('blocked');
      expect(state).toEqual(before);
    },
  );
});

describe('heal', () => {
  it('heals up to max HP', () => {
    const session = new Session(withLive(freshState, { hp: 11 }));
    expect(session.run(heal, { amount: 20 })).toBe('Healed 20 (HP 11 → 19)');
  });

  it('any healing at 0 HP wakes you and resets death saves', () => {
    const session = new Session(down({ success: 1, fail: 2 }));
    expect(session.run(heal, { amount: 4 })).toBe('Healed 4 (HP 0 → 4); conscious again');
    expect(session.live.conditions).toEqual([]);
    expect(session.live.deathSaves).toEqual({ success: 0, fail: 0 });
  });
});

describe('setTempHp', () => {
  it('replaces temp HP and warns when the new amount is lower', () => {
    const session = new Session();
    expect(session.run(setTempHp, { amount: 8 })).toBe('Temp HP 0 → 8');
    expect(session.preview(setTempHp, { amount: 5 })).toEqual({
      result: 'warn',
      reasons: ["Temp HP don't stack: you have 8"],
    });
    expect(session.run(setTempHp, { amount: 0 })).toBe('Temp HP cleared');
  });
});

describe('rollDeathSave', () => {
  it.each([
    [9, 1, 'Death save 9 + 1 = 10: success (1 ✓ / 0 ✗)', 1, 0],
    [10, -1, 'Death save 10 - 1 = 9: failure (0 ✓ / 1 ✗)', 0, 1],
  ] as const)(
    'records the external result for %i with modifier %i and undoes exactly',
    (roll, modifier, text, success, fail) => {
      const state = down();
      const before = structuredClone(state);
      const session = new Session(state);
      expect(session.run(rollDeathSave, { roll, modifier })).toBe(text);
      expect(session.live.deathSaves).toEqual({ success, fail });
      expect(state).toEqual(before);
      session.undo();
      expect(session.state).toEqual(before);
    },
  );

  it('keeps natural 1 and 20 special outcomes regardless of a valid external modifier', () => {
    const one = new Session(down());
    expect(one.run(rollDeathSave, { roll: 1, modifier: 100 })).toBe(
      'Death save 1: two failures (0 ✓ / 2 ✗)',
    );
    expect(one.live.deathSaves).toEqual({ success: 0, fail: 2 });
    const state = down({ success: 1, fail: 2 });
    const twenty = new Session(state);
    expect(twenty.run(rollDeathSave, { roll: 20, modifier: -100 })).toBe(
      'Death save 20: back up with 1 HP',
    );
    expect(twenty.live.hp).toBe(1);
    expect(twenty.live.deathSaves).toEqual({ success: 0, fail: 0 });
    twenty.undo();
    expect(twenty.state).toEqual(state);
  });

  it('retains default log text with an explicit zero modifier', () => {
    const plain = new Session(down());
    const zero = new Session(down());
    expect(zero.run(rollDeathSave, { roll: 10, modifier: 0 })).toBe(
      plain.run(rollDeathSave, { roll: 10 }),
    );
    expect(zero.state).toEqual(plain.state);
  });

  it.each([
    null,
    '1',
    true,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER - 19,
    Number.MIN_SAFE_INTEGER + 19,
    Number.MAX_SAFE_INTEGER + 1,
  ])('blocks an invalid/unsafe modifier even when forced/Manual (%j)', (modifier) => {
    const state = down();
    const before = structuredClone(state);
    for (const automation of ['assisted', 'manual'] as const) {
      expect(
        runCommand(rollDeathSave, state, { roll: 9, modifier } as DeathSavePayload, registry, {
          eventId: 'invalid-death-modifier',
          realTime: '2026-11-03T08:00:00.000Z',
          automation,
          force: true,
        }),
      ).toEqual({ result: 'blocked', reasons: ['Death save details are invalid'] });
    }
    expect(state).toEqual(before);
  });

  it('counts successes and failures; three successes make you stable', () => {
    const session = new Session(down());
    expect(session.run(rollDeathSave, { roll: 12 })).toBe('Death save 12: success (1 ✓ / 0 ✗)');
    expect(session.run(rollDeathSave, { roll: 1 })).toBe('Death save 1: two failures (1 ✓ / 2 ✗)');
    session.run(rollDeathSave, { roll: 10 });
    expect(session.run(rollDeathSave, { roll: 15 })).toBe(
      'Death save 15: success, stable (3 ✓ / 2 ✗)',
    );
    expect(session.preview(rollDeathSave, { roll: 5 }).reasons).toEqual([
      'You are stable: no more death saves',
    ]);
  });

  it('three failures is death', () => {
    const session = new Session(down({ success: 0, fail: 2 }));
    expect(session.run(rollDeathSave, { roll: 9 })).toBe('Death save 9: failure, dead (0 ✓ / 3 ✗)');
  });

  it('a 20 brings you back with 1 HP', () => {
    const session = new Session(down({ success: 0, fail: 2 }));
    expect(session.run(rollDeathSave, { roll: 20 })).toBe('Death save 20: back up with 1 HP');
    expect(session.live.hp).toBe(1);
    expect(session.live.conditions).toEqual([]);
    expect(session.live.deathSaves).toEqual({ success: 0, fail: 0 });
  });

  it('only at 0 HP, rolls 1–20', () => {
    expect(new Session().preview(rollDeathSave, { roll: 10 }).reasons).toEqual([
      'Death saves only at 0 HP',
    ]);
    expect(new Session(down()).preview(rollDeathSave, { roll: 21 }).reasons).toEqual([
      'Death save roll must be a whole number from 1 to 20',
    ]);
  });
});
