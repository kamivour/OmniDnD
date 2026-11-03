import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import type { CharacterState } from '../calc/sheet';
import { takeCombatAction, type TakeCombatActionPayload } from './actions';
import { startCombat, startTurn, useEconomy } from './combat';
import { runCommand } from './runner';
import { castSpell } from './spells';
import { freshState, Session, withLive } from './test-utils';

const INVISIBILITY = 'spell.invisibility';
const MOCKERY = 'spell.vicious-mockery';

function bard5(): CharacterState {
  return {
    ...freshState,
    build: {
      ...freshState.build,
      classes: freshState.build.classes.map((entry) => ({ ...entry, level: 5 })),
      hpEntries: [
        ...freshState.build.hpEntries,
        { level: 4, classId: 'class.bard', value: 5, method: 'average' },
        { level: 5, classId: 'class.bard', value: 5, method: 'average' },
      ],
    },
  };
}

function concentrating({ onSelf = true, slotLevel = 2 } = {}) {
  const session = new Session(slotLevel > 2 ? bard5() : freshState);
  session.run(castSpell, { spellId: INVISIBILITY, slotLevel, ...(onSelf ? { onSelf } : {}) });
  return session;
}

function inTurn(options?: { onSelf?: boolean; slotLevel?: number }) {
  const session = concentrating(options);
  session.run(startCombat, null);
  session.run(startTurn, null);
  return session;
}

describe('Invisibility ends for actual activity', () => {
  it.each([
    { action: 'attack' },
    { action: 'grapple' },
    { action: 'shove' },
    { action: 'weapon-attack', instanceId: 'rapier-1' },
    { action: 'weapon-attack', instanceId: 'rapier-1', reaction: true },
  ] satisfies TakeCombatActionPayload[])(
    'ends a known single-target self cast for the actual attack %j and undoes it exactly',
    (payload) => {
      const session = inTurn();
      const before = structuredClone(session.state);
      const events = session.events.length;
      expect(session.run(takeCombatAction, payload)).toContain(
        'Invisibility on you ended (attack)',
      );
      expect(session.live.effects).toEqual([]);
      expect(session.live.concentration).toBeUndefined();
      expect(session.events).toHaveLength(events + 1);
      expect(session.events.at(-1)?.text).toContain('concentration on Invisibility ended');
      session.undo();
      expect(session.state).toEqual(before);
    },
  );

  it('ends self Invisibility for a successful non-concentration cast and undoes the whole cast', () => {
    const session = inTurn();
    const before = structuredClone(session.state);
    expect(session.run(castSpell, { spellId: MOCKERY })).toBe(
      'Cast Vicious Mockery; Invisibility on you ended (cast); concentration on Invisibility ended',
    );
    expect(session.live.effects).toEqual([]);
    expect(session.live.concentration).toBeUndefined();
    expect(session.live.combat?.economy.actionUsed).toBe(true);
    expect(session.live.slotsUsed).toEqual(before.live.slotsUsed);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it.each(['dash', 'ready', 'dodge', 'disengage', 'help', 'hide', 'search', 'use-object'] as const)(
    'does not treat %s as an attack or remove Invisibility',
    (action) => {
      const session = inTurn();
      const before = structuredClone(session.live);
      session.run(takeCombatAction, { action });
      expect(session.live.effects).toEqual(before.effects);
      expect(session.live.concentration).toEqual(before.concentration);
      expect(session.live.combat?.economy.actionUsed).toBe(true);
    },
  );

  it('does not infer an attack from a manual economy correction or its free-form label', () => {
    const session = inTurn();
    const before = structuredClone(session.live);
    session.run(useEconomy, { kind: 'action', label: 'Attack: Rapier' });
    session.run(useEconomy, { kind: 'action', release: true });
    expect(session.live.effects).toEqual(before.effects);
    expect(session.live.concentration).toEqual(before.concentration);
  });

  it('does not remove effects or concentration when a weapon or spell fails validation', () => {
    const session = inTurn();
    session.state = withLive(session.state, {
      slotsUsed: session.live.slotsUsed.map((used, level) => (level === 1 ? 4 : used)),
    });
    const before = structuredClone(session.state);
    const events = structuredClone(session.events);
    expect(
      session.try(takeCombatAction, { action: 'weapon-attack', instanceId: 'missing-weapon' })
        .result,
    ).toBe('blocked');
    expect(session.try(castSpell, { spellId: 'spell.healing-word', slotLevel: 1 }).result).toBe(
      'blocked',
    );
    expect(session.state).toEqual(before);
    expect(session.events).toEqual(events);
  });

  it('keeps a warned action unchanged until confirmed, then logs the override and supports Undo', () => {
    const session = inTurn();
    session.run(useEconomy, { kind: 'action' });
    const before = structuredClone(session.state);
    const events = structuredClone(session.events);
    const payload = { action: 'weapon-attack' as const, instanceId: 'rapier-1' };
    expect(session.try(takeCombatAction, payload)).toEqual({
      result: 'warn',
      reasons: ['Action already used'],
    });
    expect(session.state).toEqual(before);
    expect(session.events).toEqual(events);
    session.run(takeCombatAction, payload, true);
    expect(session.live.effects).toEqual([]);
    expect(session.live.concentration).toBeUndefined();
    expect(session.events.at(-1)?.override).toBe(true);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('still applies deterministic spell ends when Manual mode bypasses action warnings', () => {
    const session = inTurn();
    session.run(useEconomy, { kind: 'action' });
    const before = structuredClone(session.state);
    const result = runCommand(takeCombatAction, session.state, { action: 'attack' }, registry, {
      eventId: 'manual-invisible-attack',
      realTime: '2026-11-03T03:00:00.000Z',
      automation: 'manual',
    });
    expect(result.result).toBe('ok');
    if (result.result === 'ok') {
      expect(result.next.live.effects).toEqual([]);
      expect(result.next.live.concentration).toBeUndefined();
      expect(result.event.override).toBeUndefined();
    }
    expect(session.state).toEqual(before);
  });
});

describe('Invisibility target and concentration ownership', () => {
  it.each(['attack', 'cast'] as const)(
    'preserves ally-only Invisibility concentration when the caster performs an %s',
    (trigger) => {
      const session = inTurn({ onSelf: false });
      const concentration = structuredClone(session.live.concentration);
      const text =
        trigger === 'attack'
          ? session.run(takeCombatAction, { action: 'attack' })
          : session.run(castSpell, { spellId: MOCKERY });
      expect(session.live.effects).toEqual([]);
      expect(session.live.concentration).toEqual(concentration);
      expect(text).not.toContain('Invisibility on you ended');
    },
  );

  it('removes only Invisibility spell effects and preserves other invisible conditions and effects', () => {
    const session = inTurn();
    const retained = [
      {
        id: 'effect.greater-invisibility',
        name: 'Greater Invisibility',
        sourceId: 'spell.greater-invisibility',
        concentration: true,
        conditions: ['invisible' as const],
        modifiers: [],
      },
      {
        id: 'effect.dm-invisibility',
        name: 'DM invisibility',
        concentration: false,
        conditions: ['invisible' as const],
        modifiers: [],
      },
    ];
    session.state = withLive(session.state, {
      conditions: ['invisible'],
      effects: [...session.live.effects, ...retained],
    });
    const before = structuredClone(session.state);
    session.run(takeCombatAction, { action: 'attack' });
    expect(session.live.effects).toEqual(retained);
    expect(session.live.conditions).toEqual(['invisible']);
    expect(session.sheet.conditions).toContain('invisible');
    expect(session.live.concentration).toBeUndefined();
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('preserves unrelated caster concentration when an unlinked local Invisibility effect ends', () => {
    const session = inTurn();
    session.state = withLive(session.state, {
      concentration: {
        spellId: 'spell.faerie-fire',
        slotLevel: 1,
        endsAt: session.live.clock.seconds + 60,
      },
    });
    const concentration = structuredClone(session.live.concentration);
    session.run(takeCombatAction, { action: 'attack' });
    expect(session.live.effects).toEqual([]);
    expect(session.live.concentration).toEqual(concentration);
  });

  it.each(['upcast', 'missing-level'] as const)(
    'detaches the local link but retains possible ally concentration for %s state',
    (kind) => {
      const session = inTurn({ slotLevel: kind === 'upcast' ? 3 : 2 });
      if (kind === 'missing-level') {
        const concentration = { ...session.live.concentration! };
        delete concentration.slotLevel;
        session.state = withLive(session.state, { concentration });
      }
      const before = structuredClone(session.state);
      const concentration = { ...session.live.concentration! };
      delete concentration.effectId;
      expect(session.run(takeCombatAction, { action: 'attack' })).toContain(
        'concentration retained; other targets may still be affected',
      );
      expect(session.live.effects).toEqual([]);
      expect(session.live.concentration).toEqual(concentration);
      session.undo();
      expect(session.state).toEqual(before);
    },
  );

  it('removes the old self effect before creating a newly cast Invisibility effect', () => {
    const session = concentrating();
    const before = structuredClone(session.state);
    expect(session.run(castSpell, { spellId: INVISIBILITY, slotLevel: 2, onSelf: true })).toContain(
      'Invisibility on you ended (cast)',
    );
    expect(session.live.effects).toMatchObject([
      { id: INVISIBILITY, sourceId: INVISIBILITY, concentration: true, conditions: ['invisible'] },
    ]);
    expect(session.live.effects).toHaveLength(1);
    expect(session.live.concentration).toMatchObject({
      spellId: INVISIBILITY,
      slotLevel: 2,
      effectId: session.live.effects[0]!.id,
    });
    expect(session.live.slotsUsed[2]).toBe(2);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('safely creates another self spell effect after the previous Invisibility ends', () => {
    const session = concentrating();
    const before = structuredClone(session.state);
    session.run(castSpell, { spellId: 'spell.disguise-self', slotLevel: 1 });
    expect(session.live.concentration).toBeUndefined();
    expect(session.live.effects).toHaveLength(1);
    expect(session.live.effects[0]).toMatchObject({
      name: 'Disguise Self',
      sourceId: 'spell.disguise-self',
      concentration: false,
      conditions: [],
    });
    session.undo();
    expect(session.state).toEqual(before);
  });
});
