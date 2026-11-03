import { describe, expect, it } from 'vitest';
import { LiveStateSchema } from '../schema';
import { addEffect, removeEffect, setExhaustion, toggleCondition } from './effects';
import { applyDamage } from './hp';
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

  it.each([60, undefined])(
    'detaches an earlier imported effect expiry while retaining concentration duration %s and saves',
    (duration) => {
      const now = freshState.live.clock.seconds;
      const concentration = {
        spellId: 'spell.invisibility' as const,
        slotLevel: 3,
        ...(duration === undefined ? {} : { endsAt: now + duration }),
        pendingSaves: [{ id: 'earlier-damage', dc: 10 }],
      };
      const live = LiveStateSchema.parse({
        ...freshState.live,
        concentration: { ...concentration, effectId: 'spell.invisibility' },
        effects: [
          {
            id: 'spell.invisibility',
            name: 'Invisibility',
            sourceId: 'spell.invisibility',
            endsAt: now + 6,
            concentration: true,
            conditions: ['invisible'],
            modifiers: [],
          },
          {
            id: 'effect.other-dependent',
            name: 'Additional dependent effect',
            concentration: true,
            conditions: [],
            modifiers: [],
          },
        ],
      });
      const session = new Session(withLive(freshState, live));
      session.run(advanceTime, { seconds: 5 });
      expect(session.live.concentration?.effectId).toBe('spell.invisibility');
      const before = session.state;

      expect(session.run(advanceTime, { seconds: 1 })).toBe(
        'Time +1 s (Day 1, 08:00); Invisibility ended',
      );
      expect(session.live.concentration).toEqual(concentration);
      expect(session.live.effects).toEqual([live.effects[1]]);
      session.undo();
      expect(session.state).toEqual(before);
    },
  );

  it('expires an ordinary self cast and its pending saves together with exact Undo', () => {
    const session = new Session();
    session.run(castSpell, { spellId: 'spell.invisibility', slotLevel: 2, onSelf: true });
    session.run(applyDamage, { amount: 1 });
    expect(session.live.concentration?.pendingSaves).toHaveLength(1);
    const before = session.state;

    expect(session.run(advanceTime, { seconds: 3600 })).toBe(
      'Time +1 h (Day 1, 09:00); Invisibility ended',
    );
    expect(session.live.concentration).toBeUndefined();
    expect(session.live.effects).toEqual([]);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('keeps the concentration link when only an unrelated timed effect expires', () => {
    const session = new Session();
    session.run(castSpell, { spellId: 'spell.invisibility', slotLevel: 2, onSelf: true });
    session.run(addEffect, { name: 'Other effect', durationSeconds: 6 });
    const before = session.state;

    session.run(advanceTime, { seconds: 6 });
    expect(session.live.concentration).toEqual(before.live.concentration);
    expect(session.live.effects).toEqual([before.live.effects[0]]);
    session.undo();
    expect(session.state).toEqual(before);
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
