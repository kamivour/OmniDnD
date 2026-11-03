import { describe, expect, it } from 'vitest';
import { addEffect, castSpell, endTurn, startCombat, startTurn } from '../../engine/commands';
import { Session } from '../../engine/commands/test-utils';
import { effectDeadline, remainingEffectTime } from './effects-model';

describe('saved effect countdowns', () => {
  it('follows the game clock across turns, expiration and exact Undo', () => {
    const session = new Session();
    session.run(startCombat, null);
    session.run(startTurn, null);
    session.run(castSpell, { spellId: 'spell.faerie-fire', slotLevel: 1 });
    const timer = () => remainingEffectTime(session.live.concentration?.endsAt, session.live);
    expect(timer()).toBe('10 rounds left');
    session.run(endTurn, null);
    expect(timer()).toBe('10 rounds left');
    session.run(startTurn, null);
    expect(timer()).toBe('9 rounds left');
    for (let i = 0; i < 8; i++) {
      session.run(endTurn, null);
      session.run(startTurn, null);
    }
    expect(timer()).toBe('1 round left');
    session.run(endTurn, null);
    const before = session.state;
    session.run(startTurn, null);
    expect(session.live.concentration).toBeUndefined();
    session.undo();
    expect(session.state).toEqual(before);
    expect(timer()).toBe('1 round left');
  });

  it('keeps partial rounds visible and labels expired imported timers without mutating them', () => {
    const session = new Session();
    session.run(startCombat, null);
    const now = session.live.clock.seconds;
    expect(remainingEffectTime(now + 7, session.live)).toBe('2 rounds left');
    expect(remainingEffectTime(now + 1, session.live)).toBe('1 round left');
    expect(remainingEffectTime(now, session.live)).toBe('Expired');
    expect(remainingEffectTime(now - 1, session.live)).toBe('Expired');
    expect(session.live.clock.seconds).toBe(now);
  });

  it('shows exact time outside combat and distinguishes indefinite effects from unknown concentration', () => {
    const session = new Session();
    const now = session.live.clock.seconds;
    expect(remainingEffectTime(now + 3661, session.live)).toBe('1 h 1 min 1 s left');
    expect(remainingEffectTime(undefined, session.live)).toBe('Until removed');
    expect(remainingEffectTime(undefined, session.live, 'No timer')).toBe('No timer');
  });

  it('shows the earlier deadline for all dependent effects without applying it to unrelated effects', () => {
    const session = new Session();
    session.run(castSpell, { spellId: 'spell.faerie-fire', slotLevel: 1 });
    session.run(addEffect, { name: 'Dependent', concentration: true, durationSeconds: 120 });
    session.run(addEffect, { name: 'Untimed dependent', concentration: true });
    session.run(addEffect, { name: 'Short dependent', concentration: true, durationSeconds: 6 });
    session.run(addEffect, { name: 'Independent', durationSeconds: 120 });
    const now = session.live.clock.seconds;
    expect(session.live.effects.map((effect) => effectDeadline(effect, session.live))).toEqual([
      now + 60,
      now + 60,
      now + 6,
      now + 120,
    ]);
  });
});
