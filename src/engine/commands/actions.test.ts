import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { computeSheet, type CharacterState } from '../calc/sheet';
import { EconomySchema } from '../schema';
import { STANDARD_ACTIONS, takeCombatAction, type TakeCombatActionPayload } from './actions';
import { combatMovement, endTurn, startCombat, startTurn, useEconomy } from './combat';
import { setExhaustion, toggleCondition } from './effects';
import { runCommand } from './runner';
import { freshEconomy } from './shared';
import { castSpell } from './spells';
import { freshState, Session, withLive } from './test-utils';

function inTurn(state = freshState) {
  const session = new Session(state);
  session.run(startCombat, null);
  session.run(startTurn, null);
  return session;
}

function movement(session: Session) {
  return combatMovement({ live: session.live, sheet: session.sheet });
}

function withWeapon(itemId: string, instanceId: string): CharacterState {
  return {
    ...freshState,
    build: { ...freshState.build, items: [...freshState.build.items, { instanceId, itemId }] },
    live: {
      ...freshState.live,
      items: {
        ...freshState.live.items,
        [instanceId]: { ...freshState.live.items['rapier-1']!, equipped: true },
      },
    },
  };
}

describe('takeCombatAction', () => {
  it('records each standard action with one action spend and event, retaining manual outcomes', () => {
    expect(new Set(STANDARD_ACTIONS.map(({ id }) => id)).size).toBe(11);
    for (const action of STANDARD_ACTIONS) {
      const session = inTurn();
      const before = structuredClone(session.state);
      const events = session.events.length;
      expect(session.run(takeCombatAction, { action: action.id })).toBe(`Action: ${action.name}`);
      expect(session.events).toHaveLength(events + 1);
      expect(session.events.at(-1)?.command).toBe('takeCombatAction');
      expect(session.state.build).toEqual(before.build);
      expect(session.state.live).toEqual({
        ...before.live,
        combat: {
          ...before.live.combat!,
          economy: {
            ...before.live.combat!.economy,
            actionUsed: true,
            ...(action.id === 'dash' ? { dashCount: 1 } : {}),
          },
        },
      });
      session.undo();
      expect(session.state).toEqual(before);
    }
  });

  it('uses an exact equipped weapon instance and supports distinct copies of the same weapon', () => {
    const session = inTurn(withWeapon('item.rapier', 'second-rapier'));
    expect(session.sheet.attacks.filter(({ itemId }) => itemId === 'item.rapier')).toHaveLength(2);
    const before = structuredClone(session.state);
    expect(
      session.run(takeCombatAction, { action: 'weapon-attack', instanceId: 'second-rapier' }),
    ).toBe('Attack: Rapier');
    expect(session.live.combat?.economy.actionUsed).toBe(true);
    expect(session.live.hp).toBe(before.live.hp);
    expect(session.live.items).toEqual(before.live.items);
    session.undo();
    expect(session.state).toEqual(before);
    expect(
      session.preview(takeCombatAction, { action: 'weapon-attack', instanceId: 'item.rapier' })
        .result,
    ).toBe('blocked');
  });

  it('blocks an unequipped or missing weapon without mutation even when forced and Manual', () => {
    const initial = withLive(freshState, {
      items: {
        ...freshState.live.items,
        'rapier-1': { ...freshState.live.items['rapier-1']!, equipped: false },
      },
    });
    const state = inTurn(initial).state;
    const before = structuredClone(state);
    for (const instanceId of ['rapier-1', 'missing-weapon']) {
      const result = runCommand(
        takeCombatAction,
        state,
        { action: 'weapon-attack', instanceId },
        registry,
        {
          eventId: 'missing-weapon',
          realTime: '2026-11-03T03:00:00.000Z',
          force: true,
          automation: 'manual',
        },
      );
      expect(result).toEqual({
        result: 'blocked',
        reasons: ['That weapon is not equipped or available'],
      });
      expect(state).toEqual(before);
    }
  });

  it('warns for a spent action, leaves cancellation unchanged, and supports override plus Undo', () => {
    const session = inTurn();
    session.run(takeCombatAction, { action: 'weapon-attack', instanceId: 'rapier-1' });
    const before = structuredClone(session.state);
    const events = structuredClone(session.events);
    expect(session.preview(takeCombatAction, { action: 'dodge' })).toEqual({
      result: 'warn',
      reasons: ['Action already used'],
    });
    expect(session.state).toEqual(before);
    expect(session.events).toEqual(events);
    session.run(takeCombatAction, { action: 'dodge' }, true);
    expect(session.events.at(-1)?.override).toBe(true);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('blocks a zero-quantity equipped weapon even under force and Manual while preserving imported values', () => {
    const imported = withLive(freshState, {
      items: {
        ...freshState.live.items,
        'rapier-1': { ...freshState.live.items['rapier-1']!, qty: 0, equipped: true },
      },
    });
    const state = inTurn(imported).state;
    const before = structuredClone(state);
    expect(
      computeSheet(state, registry).attacks.some(({ instanceId }) => instanceId === 'rapier-1'),
    ).toBe(false);
    expect(
      runCommand(
        takeCombatAction,
        state,
        { action: 'weapon-attack', instanceId: 'rapier-1' },
        registry,
        {
          eventId: 'empty-weapon',
          realTime: '2026-11-03T03:00:00.000Z',
          force: true,
          automation: 'manual',
        },
      ),
    ).toEqual({ result: 'blocked', reasons: ['That weapon is not equipped or available'] });
    expect(state).toEqual(before);
    expect(state.live.items['rapier-1']).toMatchObject({ qty: 0, equipped: true });
  });

  it('warns off-turn for normal actions while Manual can record the explicit ruling', () => {
    const session = inTurn();
    session.run(endTurn, null);
    expect(session.preview(takeCombatAction, { action: 'search' })).toEqual({
      result: 'warn',
      reasons: ['Not your turn'],
    });
    const result = runCommand(takeCombatAction, session.state, { action: 'search' }, registry, {
      eventId: 'manual-search',
      realTime: '2026-11-03T03:00:00.000Z',
      automation: 'manual',
    });
    expect(result.result).toBe('ok');
    if (result.result === 'ok') {
      expect(result.next.live.combat?.economy.actionUsed).toBe(true);
      expect(result.event.override).toBeUndefined();
    }
  });

  it('blocks actual actions outside combat or when dead under force and Manual', () => {
    const dead = withLive(inTurn().state, { hp: 0, deathSaves: { success: 0, fail: 3 } });
    for (const state of [freshState, dead]) {
      const before = structuredClone(state);
      const result = runCommand(takeCombatAction, state, { action: 'attack' }, registry, {
        eventId: 'blocked-action',
        realTime: '2026-11-03T03:00:00.000Z',
        force: true,
        automation: 'manual',
      });
      expect(result.result).toBe('blocked');
      expect(state).toEqual(before);
    }
  });

  it('uses the reaction off-turn for a melee weapon and warns on a second reaction', () => {
    const session = inTurn();
    session.run(endTurn, null);
    expect(
      session.run(takeCombatAction, {
        action: 'weapon-attack',
        instanceId: 'dagger-1',
        reaction: true,
      }),
    ).toBe('Reaction attack: Dagger');
    expect(session.live.combat?.economy).toMatchObject({ actionUsed: false, reactionUsed: true });
    expect(
      session.preview(takeCombatAction, {
        action: 'weapon-attack',
        instanceId: 'dagger-1',
        reaction: true,
      }),
    ).toEqual({
      result: 'warn',
      reasons: ['Reaction already used'],
    });
  });

  it('records a readied response off-turn with only a reaction spend, retaining effects and exact Undo', () => {
    const preparing = new Session();
    preparing.run(castSpell, { spellId: 'spell.invisibility', slotLevel: 2, onSelf: true });
    const session = inTurn(preparing.state);
    session.run(useEconomy, { kind: 'action' });
    session.run(useEconomy, { kind: 'bonus' });
    session.run(useEconomy, { kind: 'object' });
    session.run(useEconomy, { kind: 'movement', feet: 7 });
    session.run(endTurn, null);
    const before = structuredClone(session.state);
    const events = session.events.length;

    expect(session.run(takeCombatAction, { action: 'readied-response' })).toBe(
      'Reaction: Readied action',
    );
    expect(session.events).toHaveLength(events + 1);
    expect(session.events.at(-1)?.command).toBe('takeCombatAction');
    expect(session.state).toEqual({
      ...before,
      live: {
        ...before.live,
        combat: {
          ...before.live.combat!,
          economy: { ...before.live.combat!.economy, reactionUsed: true },
        },
      },
    });
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('shares the readied response reaction pool, leaving cancellation unchanged and logging override', () => {
    const session = inTurn();
    session.run(endTurn, null);
    session.run(takeCombatAction, { action: 'readied-response' });
    const before = structuredClone(session.state);
    const events = structuredClone(session.events);
    expect(
      session.preview(takeCombatAction, {
        action: 'weapon-attack',
        instanceId: 'dagger-1',
        reaction: true,
      }),
    ).toEqual({ result: 'warn', reasons: ['Reaction already used'] });
    expect(session.try(takeCombatAction, { action: 'readied-response' })).toEqual({
      result: 'warn',
      reasons: ['Reaction already used'],
    });
    expect(session.state).toEqual(before);
    expect(session.events).toEqual(events);
    session.run(takeCombatAction, { action: 'readied-response' }, true);
    expect(session.events.at(-1)?.override).toBe(true);
    expect(session.live.combat?.economy.reactionUsed).toBe(true);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('blocks a readied response outside combat or when dead, preserving manual economy corrections', () => {
    const dead = withLive(inTurn().state, {
      hp: 0,
      deathSaves: { success: 0, fail: 3 },
      conditions: [],
    });
    for (const [state, reason] of [
      [freshState, 'Not in combat'],
      [dead, 'You are dead'],
    ] as const) {
      const before = structuredClone(state);
      for (const automation of ['assisted', 'manual'] as const) {
        expect(
          runCommand(takeCombatAction, state, { action: 'readied-response' }, registry, {
            eventId: 'blocked-readied-response',
            realTime: '2026-11-03T03:00:00.000Z',
            force: true,
            automation,
          }),
        ).toEqual({ result: 'blocked', reasons: [reason] });
        expect(state).toEqual(before);
      }
    }
    const session = new Session(dead);
    expect(session.run(useEconomy, { kind: 'reaction' })).toBe('Reaction used');
    expect(session.live.combat?.economy.reactionUsed).toBe(true);
    const spent = structuredClone(session.state);
    expect(session.run(useEconomy, { kind: 'reaction', release: true })).toBe(
      'Reaction available again',
    );
    expect(session.live.combat?.economy.reactionUsed).toBe(false);
    session.undo();
    expect(session.state).toEqual(spent);
    session.undo();
    expect(session.state).toEqual(dead);
  });

  it('derives melee/ranged eligibility and allows an explicit non-melee reaction override', () => {
    const session = inTurn(withWeapon('item.shortbow', 'bow-1'));
    expect(session.sheet.attacks.find(({ instanceId }) => instanceId === 'bow-1')?.type).toBe(
      'ranged',
    );
    expect(session.sheet.attacks.find(({ instanceId }) => instanceId === 'dagger-1')?.type).toBe(
      'melee',
    );
    session.run(endTurn, null);
    const reaction = { action: 'weapon-attack' as const, instanceId: 'bow-1', reaction: true };
    expect(session.preview(takeCombatAction, reaction)).toEqual({
      result: 'warn',
      reasons: ['Shortbow is not a melee weapon for an opportunity attack'],
    });
    session.run(takeCombatAction, reaction, true);
    expect(session.live.combat?.economy.reactionUsed).toBe(true);
    expect(session.events.at(-1)?.override).toBe(true);
  });

  it.each([
    null,
    {},
    [],
    { action: 'unknown' },
    { action: 'attack', instanceId: 'rapier-1' },
    { action: 'dash', reaction: true },
    { action: 'readied-response', reaction: true },
    { action: 'readied-response', instanceId: 'rapier-1' },
    { action: 'readied-response', label: 'Attack' },
    { action: 'weapon-attack' },
    { action: 'weapon-attack', instanceId: '' },
    { action: 'weapon-attack', instanceId: 3 },
    { action: 'weapon-attack', instanceId: 'rapier-1', reaction: 'true' },
    { action: 'weapon-attack', instanceId: 'rapier-1', extra: true },
    { action: 'help', extra: false },
  ])(
    'blocks malformed action payloads without mutation even when forced/Manual (%j)',
    (payload) => {
      const state = inTurn().state;
      const before = structuredClone(state);
      const payloadBefore = structuredClone(payload);
      for (const automation of ['assisted', 'manual'] as const) {
        const result = runCommand(
          takeCombatAction,
          state,
          payload as TakeCombatActionPayload,
          registry,
          {
            eventId: 'invalid-action',
            realTime: '2026-11-03T03:00:00.000Z',
            force: true,
            automation,
          },
        );
        expect(result).toEqual({
          result: 'blocked',
          reasons: ['Combat action details are invalid'],
        });
        expect(state).toEqual(before);
        expect(payload).toEqual(payloadBefore);
      }
    },
  );
});

describe('Dash movement', () => {
  it('adds movement without changing speed or moving, uses the allowance and undoes exactly', () => {
    const session = inTurn();
    expect(movement(session)).toEqual({
      speed: 30,
      maximum: 30,
      used: 0,
      remaining: 30,
      dashCount: 0,
    });
    session.run(useEconomy, { kind: 'movement', feet: 20 });
    const before = structuredClone(session.state);
    session.run(takeCombatAction, { action: 'dash' });
    expect(movement(session)).toEqual({
      speed: 30,
      maximum: 60,
      used: 20,
      remaining: 40,
      dashCount: 1,
    });
    expect(session.run(useEconomy, { kind: 'movement', feet: 35 })).toBe(
      'Moved 35 ft (55/60 ft used)',
    );
    expect(session.preview(useEconomy, { kind: 'movement', feet: 6 })).toEqual({
      result: 'warn',
      reasons: ['Only 5 ft of movement left'],
    });
    session.undo();
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('supports explicit extra Dashes, follows current speed and clears them at turn boundaries', () => {
    const session = inTurn();
    session.run(useEconomy, { kind: 'movement', feet: 20 });
    session.run(takeCombatAction, { action: 'dash' });
    expect(session.preview(takeCombatAction, { action: 'dash' }).result).toBe('warn');
    session.run(takeCombatAction, { action: 'dash' }, true);
    expect(movement(session)).toMatchObject({ maximum: 90, remaining: 70, dashCount: 2 });
    session.run(setExhaustion, { level: 2 });
    expect(movement(session)).toEqual({
      speed: 15,
      maximum: 45,
      used: 20,
      remaining: 25,
      dashCount: 2,
    });
    session.run(toggleCondition, { condition: 'grappled' });
    expect(movement(session)).toMatchObject({ speed: 0, maximum: 0, remaining: 0 });
    session.run(endTurn, null);
    expect(Object.hasOwn(session.live.combat!.economy, 'dashCount')).toBe(false);
    session.run(startTurn, null);
    expect(session.live.combat?.economy).toEqual(freshEconomy());
    expect(Object.hasOwn(session.live.combat!.economy, 'dashCount')).toBe(false);
  });

  it('expires Dash at End Turn without resetting spent economy and Undo restores the active allowance', () => {
    const session = inTurn();
    session.run(takeCombatAction, { action: 'dash' });
    session.run(useEconomy, { kind: 'movement', feet: 40 });
    session.run(useEconomy, { kind: 'reaction' });
    const before = structuredClone(session.state);
    expect(movement(session)).toMatchObject({ maximum: 60, used: 40, remaining: 20, dashCount: 1 });
    session.run(endTurn, null);
    expect(session.live.combat).toMatchObject({
      turnActive: false,
      economy: {
        actionUsed: true,
        reactionUsed: true,
        movementUsed: 40,
      },
    });
    expect(Object.hasOwn(session.live.combat!.economy, 'dashCount')).toBe(false);
    expect(movement(session)).toMatchObject({ maximum: 30, used: 40, remaining: 0, dashCount: 0 });
    session.undo();
    expect(session.state).toEqual(before);
    expect(movement(session)).toMatchObject({ maximum: 60, used: 40, remaining: 20, dashCount: 1 });
  });

  it('keeps legacy/default economy snapshots unchanged and validates only optional nonnegative integers', () => {
    const legacy = freshEconomy();
    expect(EconomySchema.parse(legacy)).toEqual(legacy);
    expect(Object.hasOwn(EconomySchema.parse(legacy), 'dashCount')).toBe(false);
    expect(EconomySchema.parse({ ...legacy, dashCount: 0 }).dashCount).toBe(0);
    expect(EconomySchema.parse({ ...legacy, dashCount: 2 }).dashCount).toBe(2);
    for (const dashCount of [-1, 0.5, '1', Number.NaN])
      expect(EconomySchema.safeParse({ ...legacy, dashCount }).success).toBe(false);
    const context = { live: freshState.live, sheet: computeSheet(freshState, registry) };
    expect(combatMovement(context)).toMatchObject({
      maximum: 30,
      used: 0,
      remaining: 30,
      dashCount: 0,
    });
  });
});
