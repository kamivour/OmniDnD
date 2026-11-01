import { describe, expect, it } from 'vitest';
import { applyDamage, concentrationSaveDc, heal, rollDeathSave, setTempHp } from './hp';
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

  it('blocks amounts below 1', () => {
    expect(new Session().preview(applyDamage, { amount: 0 }).reasons).toEqual([
      'Damage must be a whole number of at least 1',
    ]);
  });
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
