import { describe, expect, it } from 'vitest';
import { endCombat, endTurn, startCombat, startTurn, useEconomy } from './combat';
import { addEffect, toggleCondition } from './effects';
import { useFeature } from './features';
import { applyDamage } from './hp';
import { castSpell } from './spells';
import { advanceTime } from './time';
import { freshState, Session, withLive } from './test-utils';

const CUTTING_WORDS = 'feature.bard.cutting-words';
const start = freshState.live.clock.seconds;

function inCombat() {
  const session = new Session();
  session.run(startCombat, null);
  return session;
}

describe('combat rounds', () => {
  it('round 0 until your first turn; each later turn moves the clock 6 s', () => {
    const session = inCombat();
    expect(session.live.combat).toMatchObject({ round: 0, turnActive: false });
    expect(session.run(startTurn, null)).toBe('Round 1: your turn');
    expect(session.live.clock.seconds).toBe(start);
    expect(session.run(endTurn, null)).toBe('End of turn (round 1)');
    expect(session.run(startTurn, null)).toBe('Round 2: your turn');
    expect(session.live.clock.seconds).toBe(start + 6);
    session.run(endTurn, null);
    expect(session.run(endCombat, null)).toBe('Combat ended after 2 rounds (12 s)');
    expect(session.live.clock.seconds).toBe(start + 12);
    expect(session.live.combat).toBeUndefined();
  });

  it('combat ended before your first turn still lasted one round', () => {
    const session = inCombat();
    expect(session.run(endCombat, null)).toBe('Combat ended after 1 round (6 s)');
    expect(session.live.clock.seconds).toBe(start + 6);
  });

  it('a new turn refreshes the whole economy', () => {
    const session = inCombat();
    session.run(startTurn, null);
    session.run(useEconomy, { kind: 'action', label: 'Dash' });
    session.run(useEconomy, { kind: 'movement', feet: 30 });
    session.run(endTurn, null);
    session.run(useFeature, { featureId: CUTTING_WORDS });
    expect(session.live.combat?.economy).toMatchObject({
      actionUsed: true,
      reactionUsed: true,
      movementUsed: 30,
    });
    session.run(startTurn, null);
    expect(session.live.combat?.economy).toMatchObject({
      actionUsed: false,
      reactionUsed: false,
      movementUsed: 0,
    });
  });

  it('turn commands need combat and the right turn state', () => {
    const session = new Session();
    expect(session.preview(startTurn, null).reasons).toEqual(['Not in combat']);
    expect(session.preview(endCombat, null).reasons).toEqual(['Not in combat']);
    session.run(startCombat, null);
    expect(session.preview(startCombat, null).reasons).toEqual(['Already in combat']);
    expect(session.preview(endTurn, null).reasons).toEqual(['Your turn is not active']);
    session.run(startTurn, null);
    expect(session.preview(startTurn, null)).toEqual({
      result: 'warn',
      reasons: ['Your turn is already active'],
    });
  });

  it('timed effects run out on the combat clock', () => {
    const session = inCombat();
    session.run(startTurn, null);
    session.run(castSpell, { spellId: 'spell.faerie-fire', slotLevel: 1 });
    for (let round = 2; round <= 10; round++) {
      session.run(endTurn, null);
      session.run(startTurn, null);
    }
    expect(session.live.concentration?.spellId).toBe('spell.faerie-fire');
    session.run(endTurn, null);
    expect(session.run(startTurn, null)).toBe('Round 11: your turn; Faerie Fire ended');
    expect(session.live.concentration).toBeUndefined();
  });
});

describe('ending combat', () => {
  it.each([true, false])(
    'settles only the final round with turnActive=%s and preserves surviving state through Undo',
    (active) => {
      const session = inCombat();
      session.run(startTurn, null);
      session.run(castSpell, { spellId: 'spell.invisibility', slotLevel: 2, onSelf: true });
      session.run(applyDamage, { amount: 1 });
      session.run(addEffect, { name: 'Due ward', durationSeconds: 6 });
      session.run(addEffect, { name: 'Surviving ward', durationSeconds: 7 });
      session.run(addEffect, { name: 'Untimed ward' });
      session.run(useEconomy, { kind: 'movement', feet: 15 });
      session.run(useEconomy, { kind: 'reaction' });
      if (!active) session.run(endTurn, null);
      const before = session.state;

      expect(session.run(endCombat, null)).toBe('Combat ended after 1 round (6 s); Due ward ended');
      const expected = {
        ...before.live,
        clock: { seconds: before.live.clock.seconds + 6 },
        effects: before.live.effects.filter((effect) => effect.name !== 'Due ward'),
      };
      delete expected.combat;
      expect(session.live).toEqual(expected);
      expect(session.live.concentration?.pendingSaves).toHaveLength(1);
      expect(session.live.effects.find((effect) => effect.name === 'Surviving ward')?.endsAt).toBe(
        session.live.clock.seconds + 1,
      );
      session.undo();
      expect(session.state).toEqual(before);
    },
  );

  it('expires due concentration, every dependent effect and saves while retaining independent effects', () => {
    const now = freshState.live.clock.seconds;
    const session = new Session(
      withLive(freshState, {
        concentration: {
          spellId: 'spell.invisibility',
          endsAt: now + 6,
          effectId: 'self-effect',
          pendingSaves: [{ id: 'damage-before-combat', dc: 10 }],
        },
        effects: [
          {
            id: 'self-effect',
            name: 'Invisibility',
            concentration: true,
            conditions: ['invisible'],
            modifiers: [],
          },
          {
            id: 'dependent',
            name: 'Dependent effect',
            concentration: true,
            conditions: [],
            modifiers: [],
          },
          {
            id: 'independent',
            name: 'Independent effect',
            endsAt: now + 7,
            concentration: false,
            conditions: [],
            modifiers: [],
          },
        ],
      }),
    );
    session.run(startCombat, null);
    const before = session.state;
    expect(session.run(endCombat, null)).toBe(
      'Combat ended after 1 round (6 s); Invisibility ended',
    );
    expect(session.live.concentration).toBeUndefined();
    expect(session.live.effects).toEqual([before.live.effects[2]]);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it.each([0, 3])('allows bookkeeping at zero HP with %s failed death saves', (fail) => {
    const session = new Session(
      withLive(freshState, {
        hp: 0,
        deathSaves: { success: 0, fail },
        conditions: ['unconscious'],
      }),
    );
    session.run(startCombat, null);
    const before = session.state;
    session.run(endCombat, null);
    expect(session.live.hp).toBe(0);
    expect(session.live.deathSaves).toEqual({ success: 0, fail });
    expect(session.live.conditions).toEqual(['unconscious']);
    expect(session.live.combat).toBeUndefined();
    session.undo();
    expect(session.state).toEqual(before);
  });
});

describe('useEconomy', () => {
  it('spends an action or bonus action and warns on a second use', () => {
    const session = inCombat();
    session.run(startTurn, null);
    expect(session.run(useEconomy, { kind: 'action', label: 'Dash' })).toBe('Action: Dash');
    expect(session.run(useEconomy, { kind: 'bonus' })).toBe('Bonus action used');
    expect(session.preview(useEconomy, { kind: 'action' })).toEqual({
      result: 'warn',
      reasons: ['Action already used'],
    });
    expect(session.run(useEconomy, { kind: 'action', release: true })).toBe(
      'Action available again',
    );
    expect(session.live.combat?.economy.actionUsed).toBe(false);
  });

  it('a reaction is fine outside your turn; an action is not', () => {
    const session = inCombat();
    expect(session.preview(useEconomy, { kind: 'reaction' })).toEqual({
      result: 'ok',
      reasons: [],
    });
    expect(session.preview(useEconomy, { kind: 'action' })).toEqual({
      result: 'warn',
      reasons: ['Not your turn'],
    });
  });

  it('tracks movement against speed', () => {
    const session = inCombat();
    session.run(startTurn, null);
    expect(session.run(useEconomy, { kind: 'movement', feet: 20 })).toBe(
      'Moved 20 ft (20/30 ft used)',
    );
    expect(session.preview(useEconomy, { kind: 'movement', feet: 15 })).toEqual({
      result: 'warn',
      reasons: ['Only 10 ft of movement left'],
    });
    expect(session.run(useEconomy, { kind: 'movement', feet: -5 })).toBe(
      'Movement back 5 ft (15/30 ft used)',
    );
    expect(session.preview(useEconomy, { kind: 'movement', feet: 0 }).reasons).toEqual([
      'Movement must be a whole number of feet, not 0',
    ]);
  });

  it('warns when incapacitated', () => {
    const session = inCombat();
    session.run(startTurn, null);
    session.run(toggleCondition, { condition: 'stunned' });
    expect(session.preview(useEconomy, { kind: 'action' })).toEqual({
      result: 'warn',
      reasons: ['Incapacitated (stunned): no actions or reactions'],
    });
  });

  it('needs combat', () => {
    expect(new Session().preview(useEconomy, { kind: 'action' }).reasons).toEqual([
      'Not in combat',
    ]);
  });
});

describe('advanceTime', () => {
  it('moves the clock and ends what ran out', () => {
    const session = new Session();
    session.run(castSpell, { spellId: 'spell.invisibility', slotLevel: 2 });
    expect(session.run(advanceTime, { seconds: 1800 })).toBe('Time +30 min (Day 1, 08:30)');
    expect(session.run(advanceTime, { seconds: 1800 })).toBe(
      'Time +30 min (Day 1, 09:00); Invisibility ended',
    );
    expect(session.live.concentration).toBeUndefined();
  });

  it('warns in combat and blocks less than 1 second', () => {
    expect(inCombat().preview(advanceTime, { seconds: 60 })).toEqual({
      result: 'warn',
      reasons: ['In combat: Start Turn advances the clock'],
    });
    expect(new Session().preview(advanceTime, { seconds: 0 }).reasons).toEqual([
      'Seconds must be a whole number of at least 1',
    ]);
  });
});
