import { describe, expect, it } from 'vitest';
import { addEffect, removeEffect, setExhaustion, toggleCondition } from './effects';
import { castSpell } from './spells';
import { advanceTime } from './time';
import { freshState, Session, withLive } from './test-utils';

describe('toggleCondition', () => {
  it('adds and removes a condition', () => {
    const session = new Session();
    expect(session.run(toggleCondition, { condition: 'poisoned' })).toBe(
      'Condition added: poisoned',
    );
    expect(session.live.conditions).toEqual(['poisoned']);
    expect(session.run(toggleCondition, { condition: 'poisoned' })).toBe(
      'Condition removed: poisoned',
    );
    expect(session.live.conditions).toEqual([]);
  });

  it('an incapacitating condition ends concentration', () => {
    const session = new Session();
    session.run(castSpell, { spellId: 'spell.invisibility', slotLevel: 2 });
    expect(session.preview(toggleCondition, { condition: 'paralyzed' })).toEqual({
      result: 'ok',
      reasons: ['Ends concentration on Invisibility'],
    });
    expect(session.run(toggleCondition, { condition: 'paralyzed' })).toBe(
      'Condition added: paralyzed; concentration on Invisibility ended (paralyzed)',
    );
  });

  it('blocks unknown conditions', () => {
    expect(
      new Session().preview(toggleCondition, { condition: 'sleepy' as 'poisoned' }).reasons,
    ).toEqual(['Unknown condition sleepy']);
  });
});

describe('setExhaustion', () => {
  it('level 4 halves max HP and HP drops to it', () => {
    const session = new Session();
    expect(session.run(setExhaustion, { level: 4 })).toBe(
      'Exhaustion 0 → 4; HP 19 → 9 (max HP halved)',
    );
    expect(session.sheet.maxHp.value).toBe(9);
  });

  it('level 6 is death', () => {
    const session = new Session();
    expect(session.preview(setExhaustion, { level: 6 })).toEqual({
      result: 'ok',
      reasons: ['Exhaustion 6: death'],
    });
    expect(session.run(setExhaustion, { level: 6 })).toBe(
      'Exhaustion 0 → 6; HP 19 → 9 (max HP halved); dead',
    );
    expect(session.preview(setExhaustion, { level: 7 }).reasons).toEqual([
      'Exhaustion must be a whole number from 0 to 6',
    ]);
  });
});

describe('addEffect and removeEffect', () => {
  it('adds a timed effect that runs out on the clock', () => {
    const session = new Session();
    expect(
      session.run(addEffect, {
        name: 'Shield of Faith (cleric)',
        durationSeconds: 60,
        modifiers: [{ target: 'ac', value: 2 }],
      }),
    ).toBe('Effect added: Shield of Faith (cleric) (1 min)');
    expect(session.live.effects).toMatchObject([
      { id: 'effect.shield-of-faith-cleric', endsAt: freshState.live.clock.seconds + 60 },
    ]);
    expect(session.run(advanceTime, { seconds: 60 })).toBe(
      'Time +1 min (Day 1, 08:01); Shield of Faith (cleric) ended',
    );
  });

  it('gives repeated names their own ids', () => {
    const session = new Session();
    session.run(addEffect, { name: 'Shield of Faith' });
    session.run(addEffect, { name: 'Shield of Faith' });
    expect(session.live.effects.map((effect) => effect.id)).toEqual([
      'effect.shield-of-faith',
      'effect.shield-of-faith-2',
    ]);
    expect(session.run(removeEffect, { effectId: 'effect.shield-of-faith' })).toBe(
      'Effect removed: Shield of Faith',
    );
    expect(session.live.effects.map((effect) => effect.id)).toEqual(['effect.shield-of-faith-2']);
  });

  it('a concentration effect needs your concentration and ends with it', () => {
    const session = new Session();
    expect(session.preview(addEffect, { name: 'Haste', concentration: true }).reasons).toEqual([
      'Not concentrating: cast the concentration spell first',
    ]);
    session.run(castSpell, { spellId: 'spell.invisibility', slotLevel: 2, onSelf: true });
    expect(session.run(removeEffect, { effectId: 'spell.invisibility' })).toBe(
      'Effect removed: Invisibility; concentration on Invisibility ended',
    );
    expect(session.live.concentration).toBeUndefined();
  });

  it('blocks an empty name and a missing effect', () => {
    const session = new Session();
    expect(session.preview(addEffect, { name: '  ' }).reasons).toEqual(['Name the effect']);
    expect(session.preview(removeEffect, { effectId: 'effect.nope' }).reasons).toEqual([
      'No effect effect.nope',
    ]);
  });

  it('an incapacitating effect ends concentration', () => {
    const session = new Session(withLive(freshState, {}));
    session.run(castSpell, { spellId: 'spell.invisibility', slotLevel: 2 });
    expect(session.run(addEffect, { name: 'Hold Person', conditions: ['paralyzed'] })).toBe(
      'Effect added: Hold Person; concentration on Invisibility ended (paralyzed)',
    );
  });
});
