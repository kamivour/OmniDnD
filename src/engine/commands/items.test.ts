import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { armorEquipmentNotes } from '../calc/equipment';
import { attunedItems } from '../calc/attunement';
import { computeSheet, type CharacterState } from '../calc/sheet';
import { buildRegistry } from '../registry';
import { ATTUNEMENT_LIMIT } from '../rules2014';
import { ExportFileSchema } from '../schema';
import { startCombat, startTurn, useEconomy } from './combat';
import {
  adjustItemQuantity,
  equipItem,
  setItemAttunement,
  type AdjustItemQuantityPayload,
  type EquipItemPayload,
  type SetItemAttunementPayload,
} from './items';
import { runCommand, undo } from './runner';
import { freshState, Session } from './test-utils';

function withItems(
  ...entries: { id: string; itemId: string; equipped?: boolean; qty?: number }[]
): CharacterState {
  const state = structuredClone(freshState);
  for (const { id, itemId, equipped = false, qty = 1 } of entries) {
    state.build.items.push({ instanceId: id, itemId, notes: `Note for ${id}` });
    state.live.items = { ...state.live.items, [id]: { qty, equipped, attuned: false } };
  }
  return state;
}

function inTurn(state: CharacterState) {
  const session = new Session(state);
  session.run(startCombat, null);
  session.run(startTurn, null);
  session.run(useEconomy, { kind: 'action', label: 'Existing turn action' });
  session.run(useEconomy, { kind: 'movement', feet: 5 });
  return session;
}

describe('setItemAttunement', () => {
  it('records up to three distinct bonds without changing equipment, charges, resources, time or economy', () => {
    const state = withItems(
      { id: 'bond-1', itemId: 'item.flute' },
      { id: 'bond-2', itemId: 'item.backpack' },
      { id: 'bond-3', itemId: 'item.dagger' },
      { id: 'bond-4', itemId: 'item.candle' },
    );
    state.live.items['bond-1']!.charges = 2;
    const session = inTurn(state);
    const before = structuredClone(session.state);
    expect(ATTUNEMENT_LIMIT).toBe(3);
    for (const instanceId of ['bond-1', 'bond-2', 'bond-3']) {
      const result = session.try(
        setItemAttunement,
        { instanceId, attuned: true, expected: false },
        true,
      );
      expect(result.result).toBe('ok');
      expect(result.reasons.join()).toMatch(
        /focused short rest.*contact.*prerequisites.*curses.*time separately/,
      );
      expect(session.events.at(-1)?.command).toBe('setItemAttunement');
    }
    expect(attunedItems(session.state).map(({ instanceId }) => instanceId)).toEqual([
      'bond-1',
      'bond-2',
      'bond-3',
    ]);
    expect(session.state).toEqual({
      ...before,
      live: {
        ...before.live,
        items: {
          ...before.live.items,
          'bond-1': { ...before.live.items['bond-1']!, attuned: true },
          'bond-2': { ...before.live.items['bond-2']!, attuned: true },
          'bond-3': { ...before.live.items['bond-3']!, attuned: true },
        },
      },
    });
    const full = structuredClone(session.state);
    expect(
      runCommand(
        setItemAttunement,
        session.state,
        { instanceId: 'bond-4', attuned: true },
        registry,
        {
          eventId: 'fourth-bond',
          realTime: '2026-11-06T00:00:00.000Z',
          force: true,
          automation: 'manual',
        },
      ),
    ).toEqual({
      result: 'blocked',
      reasons: ['Already attuned to 3 items; end a recorded bond first'],
    });
    expect(session.state).toEqual(full);
    session.undo();
    session.undo();
    session.undo();
    expect(session.state).toEqual(before);
    expect(state.live.items['bond-1']!.attuned).toBe(false);
  });

  it('counts depleted owned flags while ignoring orphan and inherited live entries', () => {
    const state = withItems({ id: 'depleted-bond', itemId: 'item.backpack', qty: 0 });
    state.live.items['depleted-bond']!.attuned = true;
    state.live.items.orphan = { qty: 1, equipped: false, attuned: true };
    expect(attunedItems(state).map(({ instanceId }) => instanceId)).toEqual(['depleted-bond']);
    const before = structuredClone(state);
    expect(attunedItems(state)).toEqual([state.build.items.at(-1)]);
    expect(state).toEqual(before);
  });

  it('includes depleted bonds in the three-item limit', () => {
    const state = withItems({ id: 'next-bond', itemId: 'item.candle' });
    for (const instanceId of ['rapier-1', 'dagger-1', 'leather-armor-1'])
      state.live.items[instanceId] = { ...state.live.items[instanceId]!, qty: 0, attuned: true };
    const session = new Session(state);
    expect(
      session.preview(setItemAttunement, { instanceId: 'next-bond', attuned: true }).result,
    ).toBe('blocked');
    expect(attunedItems(state)).toHaveLength(3);
    expect(session.state).toEqual(state);
  });

  it.each([0, 1])(
    'blocks another attuned copy of the same definition even when its old quantity is %i',
    (quantity) => {
      const state = withItems({ id: 'other-rapier', itemId: 'item.rapier' });
      state.live.items['rapier-1'] = {
        ...state.live.items['rapier-1']!,
        qty: quantity,
        attuned: true,
      };
      const result = runCommand(
        setItemAttunement,
        state,
        { instanceId: 'other-rapier', attuned: true },
        registry,
        {
          eventId: 'duplicate-bond',
          realTime: '2026-11-06T00:00:00.000Z',
          force: true,
          automation: 'manual',
        },
      );
      expect(result).toEqual({
        result: 'blocked',
        reasons: ['Already attuned to another copy of Rapier'],
      });
      expect(state.live.items['other-rapier']!.attuned).toBe(false);
    },
  );

  it('blocks a new bond at quantity zero even with a Manual forced ruling', () => {
    const state = structuredClone(freshState);
    state.live.items['rapier-1']!.qty = 0;
    const result = runCommand(
      setItemAttunement,
      state,
      { instanceId: 'rapier-1', attuned: true },
      registry,
      {
        eventId: 'empty-bond',
        realTime: '2026-11-06T00:00:00.000Z',
        force: true,
        automation: 'manual',
      },
    );
    expect(result).toEqual({ result: 'blocked', reasons: ['No quantity left to attune'] });
    expect(state.live.items['rapier-1']!.attuned).toBe(false);
  });

  it.each([undefined, false])(
    'warns for a new bond when the definition’s attunement field is %s',
    (attunement) => {
      const references =
        attunement === undefined
          ? registry
          : buildRegistry(
              [Array.from(registry.entries.values())],
              [],
              [{ id: 'item.rapier', attunement }],
            );
      const before = structuredClone(freshState);
      const result = runCommand(
        setItemAttunement,
        freshState,
        { instanceId: 'rapier-1', attuned: true },
        references,
        {
          eventId: 'unknown-requirement',
          realTime: '2026-11-06T00:00:00.000Z',
        },
      );
      expect(result).toEqual({
        result: 'warn',
        reasons: ["Rapier has no recorded attunement requirement; confirm the DM's ruling"],
      });
      expect(freshState).toEqual(before);
      const manual = runCommand(
        setItemAttunement,
        freshState,
        { instanceId: 'rapier-1', attuned: true },
        references,
        {
          eventId: 'manual-bond',
          realTime: '2026-11-06T00:00:00.000Z',
          automation: 'manual',
        },
      );
      expect(manual.result).toBe('ok');
      if (manual.result === 'ok') {
        expect(manual.next.live.items['rapier-1']!.attuned).toBe(true);
        expect(manual.event.override).toBeUndefined();
        expect(manual.reasons).toEqual([]);
      }
    },
  );

  it('uses declared attunement metadata without inventing any magical effects', () => {
    const references = buildRegistry(
      [Array.from(registry.entries.values())],
      [],
      [{ id: 'item.rapier', attunement: true }],
    );
    const result = runCommand(
      setItemAttunement,
      freshState,
      { instanceId: 'rapier-1', attuned: true, expected: false },
      references,
      {
        eventId: 'known-bond',
        realTime: '2026-11-06T00:00:00.000Z',
      },
    );
    expect(result.result).toBe('ok');
    if (result.result !== 'ok') return;
    expect(result.event.override).toBeUndefined();
    expect(result.next).toEqual({
      ...freshState,
      live: {
        ...freshState.live,
        items: {
          ...freshState.live.items,
          'rapier-1': { ...freshState.live.items['rapier-1']!, attuned: true },
        },
      },
    });
    expect(
      undo(result.next, [result.event], {
        eventId: 'undo-known-bond',
        realTime: '2026-11-06T00:00:00.000Z',
      }),
    ).toMatchObject({ result: 'ok', next: freshState });
  });

  it('ends a depleted legacy duplicate bond even while the recorded total exceeds the limit', () => {
    const state = withItems(
      { id: 'extra-1', itemId: 'item.rapier' },
      { id: 'extra-2', itemId: 'item.rapier' },
    );
    for (const instanceId of ['rapier-1', 'dagger-1', 'leather-armor-1', 'extra-1', 'extra-2'])
      state.live.items[instanceId]!.attuned = true;
    state.live.items['extra-1']!.qty = 0;
    const session = inTurn(state);
    const before = structuredClone(session.state);
    const result = session.try(setItemAttunement, {
      instanceId: 'extra-1',
      attuned: false,
      expected: true,
    });
    expect(result.result).toBe('ok');
    expect(result.reasons.join()).toContain('Ending attunement recorded');
    expect(attunedItems(session.state)).toHaveLength(4);
    expect(session.state).toEqual({
      ...before,
      live: {
        ...before.live,
        items: {
          ...before.live.items,
          'extra-1': { ...before.live.items['extra-1']!, attuned: false },
        },
      },
    });
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('protects a stale reviewed boolean and preserves other inventory changes', () => {
    const state = structuredClone(freshState);
    state.live.items['dagger-1']!.qty = 2;
    const session = new Session(state);
    session.run(
      setItemAttunement,
      { instanceId: 'rapier-1', attuned: true, expected: false },
      true,
    );
    expect(session.live.items['dagger-1']!.qty).toBe(2);
    const before = structuredClone(session.state);
    expect(
      runCommand(
        setItemAttunement,
        session.state,
        { instanceId: 'rapier-1', attuned: false, expected: false },
        registry,
        {
          eventId: 'stale-bond',
          realTime: '2026-11-06T00:00:00.000Z',
          force: true,
          automation: 'manual',
        },
      ),
    ).toEqual({
      result: 'blocked',
      reasons: ['The recorded attunement changed after review. Review it again.'],
    });
    expect(session.state).toEqual(before);
    session.undo();
    expect(session.state).toEqual(state);
  });

  it('round-trips a valid legacy constructor bond and undoes its flag without mutating the source', () => {
    const instanceId = String('constructor');
    const state = withItems({ id: instanceId, itemId: 'item.backpack' });
    state.live.items[instanceId]!.charges = 2;
    const before = structuredClone(state);
    const session = new Session(state);
    session.run(setItemAttunement, { instanceId, attuned: true, expected: false }, true);
    expect(session.events.at(-1)?.patches.map(({ path }) => path)).toEqual([['live', 'items']]);
    const file = ExportFileSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...session.state,
          app: 'omnidnd',
          schemaVersion: 1,
          exportedAt: '2026-11-06T00:00:00.000Z',
          events: session.events,
        }),
      ),
    );
    session.state = { campaign: file.campaign, build: file.build, live: file.live };
    session.events = file.events;
    session.undo();
    expect(session.state).toEqual(before);
    expect(state).toEqual(before);
  });

  it.each(['missing', 'item.rapier', '__proto__', 'constructor'])(
    'blocks unavailable or inherited attunement instance %s',
    (instanceId) => {
      const session = new Session();
      expect(session.preview(setItemAttunement, { instanceId, attuned: false })).toEqual({
        result: 'blocked',
        reasons: ['That item instance is unavailable'],
      });
      expect(session.events).toEqual([]);
    },
  );

  it.each([
    null,
    {},
    { instanceId: '', attuned: true },
    { instanceId: 'rapier-1', attuned: 1 },
    { instanceId: 'rapier-1', attuned: true, expected: 0 },
    { instanceId: 'rapier-1', attuned: true, equipped: true },
  ])('blocks malformed attunement payload %j even under force and Manual', (payload) => {
    expect(
      runCommand(
        setItemAttunement,
        freshState,
        payload as unknown as SetItemAttunementPayload,
        registry,
        {
          eventId: 'invalid-bond',
          realTime: '2026-11-06T00:00:00.000Z',
          force: true,
          automation: 'manual',
        },
      ),
    ).toEqual({ result: 'blocked', reasons: ['Attunement details are invalid'] });
  });
});

describe('adjustItemQuantity', () => {
  it('undoes quantity on a valid owned legacy constructor instance after a JSON reload', () => {
    const instanceId = 'constructor';
    const state = withItems({ id: instanceId, itemId: 'item.rapier', qty: 2 });
    const parsed = ExportFileSchema.parse({
      ...state,
      app: 'omnidnd',
      schemaVersion: 1,
      exportedAt: '2026-11-05T10:00:00.000Z',
      events: [],
    });
    expect(Object.hasOwn(parsed.live.items, instanceId)).toBe(true);
    const session = new Session(state);
    const before = structuredClone(state);
    session.run(adjustItemQuantity, { instanceId, quantity: 3 });
    expect(session.live.items[instanceId]!.qty).toBe(3);
    expect(session.events.at(-1)?.patches.map(({ path }) => path)).toEqual([['live', 'items']]);
    const reload = ExportFileSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...session.state,
          app: 'omnidnd',
          schemaVersion: 1,
          exportedAt: '2026-11-05T10:00:00.000Z',
          events: session.events,
        }),
      ),
    );
    session.state = { campaign: reload.campaign, build: reload.build, live: reload.live };
    session.events = reload.events;
    session.undo();
    expect(session.state).toEqual(before);
    expect(state).toEqual(before);
    session.run(adjustItemQuantity, { instanceId: 'rapier-1', quantity: 2 });
    expect(session.events.at(-1)?.patches.map(({ path }) => path)).toEqual([
      ['live', 'items', 'rapier-1', 'qty'],
    ]);
    session.undo();
    expect(session.state).toEqual(before);
  });
  it('changes the exact instance, preserves empty equipment flags/charges/attunement and undoes exactly', () => {
    const state = withItems({ id: 'other-rapier', itemId: 'item.rapier', equipped: true });
    state.live.items['rapier-1'] = { qty: 1, charges: 3, equipped: true, attuned: true };
    const session = inTurn(state);
    const before = structuredClone(session.state);
    expect(session.run(adjustItemQuantity, { instanceId: 'rapier-1', quantity: 0 })).toBe(
      'Rapier: quantity 1 → 0',
    );
    expect(session.live).toEqual({
      ...before.live,
      items: { ...before.live.items, 'rapier-1': { ...before.live.items['rapier-1']!, qty: 0 } },
    });
    expect(session.state.build).toEqual(before.build);
    expect(session.sheet.attacks.map(({ instanceId }) => instanceId)).not.toContain('rapier-1');
    expect(session.sheet.attacks.map(({ instanceId }) => instanceId)).toContain('other-rapier');
    expect(session.events.at(-1)?.command).toBe('adjustItemQuantity');
    expect(session.events.at(-1)?.patches.map(({ path }) => path)).toEqual([
      ['live', 'items', 'rapier-1', 'qty'],
    ]);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('restores a legacy empty instance without rewriting its other fields', () => {
    const state = structuredClone(freshState);
    state.live.items['rapier-1'] = { qty: 0, equipped: true, attuned: true, charges: 2 };
    const session = new Session(state);
    expect(session.sheet.attacks.some(({ instanceId }) => instanceId === 'rapier-1')).toBe(false);
    session.run(adjustItemQuantity, { instanceId: 'rapier-1', quantity: 2 });
    expect(session.live.items['rapier-1']).toEqual({
      qty: 2,
      equipped: true,
      attuned: true,
      charges: 2,
    });
    expect(session.sheet.attacks.some(({ instanceId }) => instanceId === 'rapier-1')).toBe(true);
    session.undo();
    expect(session.state).toEqual(state);
  });

  it.each([NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'blocks unsafe or noninteger quantity %s even in Manual and forced modes',
    (quantity) => {
      const before = structuredClone(freshState);
      const result = runCommand(
        adjustItemQuantity,
        freshState,
        { instanceId: 'rapier-1', quantity },
        registry,
        {
          eventId: 'invalid-quantity',
          realTime: '2026-11-05T10:00:00.000Z',
          force: true,
          automation: 'manual',
        },
      );
      expect(result.result).toBe('blocked');
      expect(freshState).toEqual(before);
    },
  );

  it('accepts the safe integer boundary as an absolute count', () => {
    const session = new Session();
    session.run(adjustItemQuantity, { instanceId: 'rapier-1', quantity: Number.MAX_SAFE_INTEGER });
    expect(session.live.items['rapier-1']!.qty).toBe(Number.MAX_SAFE_INTEGER);
    session.undo();
    expect(session.state).toEqual(freshState);
  });

  it.each([
    null,
    {},
    { instanceId: '', quantity: 1 },
    { instanceId: 'rapier-1', quantity: '2' },
    { instanceId: 'rapier-1', quantity: 2, extra: true },
  ])('blocks malformed payload %j without changing state', (payload) => {
    const session = new Session();
    const result = session.try(adjustItemQuantity, payload as unknown as AdjustItemQuantityPayload);
    expect(result.result).toBe('blocked');
    expect(session.state).toEqual(freshState);
    expect(session.events).toEqual([]);
  });

  it.each(['missing', 'item.rapier', '__proto__', 'constructor', 'toString'])(
    'rejects unowned instance %s',
    (instanceId) => {
      const session = new Session();
      expect(session.preview(adjustItemQuantity, { instanceId, quantity: 2 })).toEqual({
        result: 'blocked',
        reasons: ['That item instance is unavailable'],
      });
      expect(session.state).toEqual(freshState);
    },
  );
});

describe('equipItem', () => {
  it.each([true, false])(
    'undoes equipped=%s for a valid owned legacy constructor instance',
    (equipped) => {
      const instanceId = String('constructor');
      const state = withItems({
        id: 'constructor',
        itemId: 'item.chain-mail',
        equipped: !equipped,
      });
      state.build.proficiencies.armor.push('heavy');
      const before = structuredClone(state);
      const session = new Session(state);
      session.run(equipItem, { instanceId: 'constructor', equipped });
      expect(Object.hasOwn(session.live.items, 'constructor')).toBe(true);
      expect(session.live.items[instanceId]!.equipped).toBe(equipped);
      expect(session.events.at(-1)?.patches.map(({ path }) => path)).toEqual([['live', 'items']]);
      session.undo();
      expect(session.state).toEqual(before);
      expect(state).toEqual(before);
    },
  );

  it('undoes a normal armor choice that replaces a legacy constructor instance', () => {
    const legacyId = String('constructor');
    const state = withItems(
      { id: 'constructor', itemId: 'item.chain-mail', equipped: true },
      { id: 'scale', itemId: 'item.scale-mail' },
    );
    state.live.items['leather-armor-1']!.equipped = false;
    state.live.items[legacyId] = { qty: 1, equipped: true, attuned: true, charges: 2 };
    state.build.proficiencies.armor.push('heavy', 'medium');
    const before = structuredClone(state);
    const session = new Session(state);
    expect(session.run(equipItem, { instanceId: 'scale', equipped: true })).toContain(
      'replaced Chain Mail',
    );
    expect(session.live.items[legacyId]).toEqual({
      qty: 1,
      equipped: false,
      attuned: true,
      charges: 2,
    });
    expect(session.live.items.scale!.equipped).toBe(true);
    expect(session.events.at(-1)?.patches.map(({ path }) => path)).toEqual([['live', 'items']]);
    session.undo();
    expect(session.state).toEqual(before);
    expect(state).toEqual(before);
  });
  it('replaces competing body armor in one event, preserves other slots and changes derived AC/speed', () => {
    const state = withItems(
      { id: 'chain', itemId: 'item.chain-mail' },
      { id: 'empty-scale', itemId: 'item.scale-mail', qty: 0, equipped: true },
      { id: 'shield', itemId: 'item.shield', equipped: true },
    );
    state.build.proficiencies.armor.push('heavy', 'shield');
    state.live.items['leather-armor-1']!.attuned = true;
    state.live.items['leather-armor-1']!.charges = 2;
    const session = inTurn(state);
    const before = structuredClone(session.state);
    const result = session.try(equipItem, { instanceId: 'chain', equipped: true });
    expect(result.result).toBe('ok');
    if (result.result !== 'ok') return;
    expect(result.event.text).toBe('Equip: Chain Mail; replaced Leather Armor, Scale Mail');
    expect(
      result.event.patches.every(({ path }) => path.length === 4 && path[3] === 'equipped'),
    ).toBe(true);
    expect(result.reasons).toEqual([
      'Don Chain Mail: 10 minutes; Doff Leather Armor: 1 minute. Record any elapsed time or action separately.',
    ]);
    expect(session.state.build).toEqual(before.build);
    expect(session.live).toEqual({
      ...before.live,
      items: {
        ...before.live.items,
        chain: { ...before.live.items.chain!, equipped: true },
        'leather-armor-1': { ...before.live.items['leather-armor-1']!, equipped: false },
        'empty-scale': { ...before.live.items['empty-scale']!, equipped: false },
      },
    });
    expect(session.sheet.ac.value).toBe(18);
    expect(session.sheet.speed.value).toBe(20);
    expect(session.sheet.attacks).toEqual(computeSheet(before, registry).attacks);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('replaces only shields and keeps body armor and weapon choices independent', () => {
    const state = withItems(
      { id: 'first-shield', itemId: 'item.shield', equipped: true },
      { id: 'second-shield', itemId: 'item.shield' },
      { id: 'backpack-copy', itemId: 'item.backpack' },
    );
    state.build.proficiencies.armor.push('shield');
    const session = inTurn(state);
    const before = structuredClone(session.state);
    const replacement = session.try(equipItem, { instanceId: 'second-shield', equipped: true });
    expect(replacement).toMatchObject({
      result: 'ok',
      reasons: [
        'Don Shield: 1 action; Doff Shield: 1 action. Record any elapsed time or action separately.',
      ],
    });
    expect(session.live.items['first-shield']!.equipped).toBe(false);
    expect(session.live.items['second-shield']!.equipped).toBe(true);
    expect(session.live.items['leather-armor-1']!.equipped).toBe(true);
    expect(session.live.combat).toEqual(before.live.combat);
    expect(session.live.clock).toEqual(before.live.clock);
    session.undo();
    expect(session.state).toEqual(before);
    session.run(equipItem, { instanceId: 'rapier-1', equipped: false });
    expect(session.live.items['dagger-1']!.equipped).toBe(true);
    expect(session.live.items['leather-armor-1']!.equipped).toBe(true);
    session.undo();
    session.run(equipItem, { instanceId: 'backpack-copy', equipped: true });
    expect(session.live.items['rapier-1']!.equipped).toBe(true);
    expect(session.live.items['first-shield']!.equipped).toBe(true);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('warns about missing armor proficiency before mutation, allows explicit ruling, and leaves persistent penalties', () => {
    const state = withItems({ id: 'chain', itemId: 'item.chain-mail' });
    const session = new Session(state);
    expect(session.preview(equipItem, { instanceId: 'chain', equipped: true })).toEqual({
      result: 'warn',
      reasons: [
        'Not proficient with Chain Mail: STR/DEX checks, saves and attacks have disadvantage; you cannot cast spells',
      ],
    });
    expect(session.state).toEqual(state);
    expect(session.events).toEqual([]);
    session.run(equipItem, { instanceId: 'chain', equipped: true }, true);
    expect(session.events.at(-1)?.override).toBe(true);
    expect(armorEquipmentNotes(session.state, registry).join(' ')).toContain(
      'you cannot cast spells',
    );
    session.undo();
    expect(session.state).toEqual(state);
    const manual = runCommand(equipItem, state, { instanceId: 'chain', equipped: true }, registry, {
      eventId: 'manual-equip',
      realTime: '2026-11-05T10:00:00.000Z',
      automation: 'manual',
    });
    expect(manual).toMatchObject({ result: 'ok' });
    if (manual.result === 'ok') {
      expect(manual.event.override).toBeUndefined();
      expect(manual.reasons).toEqual([]);
      expect(armorEquipmentNotes(manual.next, registry).join(' ')).toContain(
        'you cannot cast spells',
      );
    }
  });

  it.each([
    ['item.leather-armor', '1 minute', '1 minute'],
    ['item.scale-mail', '5 minutes', '1 minute'],
    ['item.chain-mail', '10 minutes', '5 minutes'],
    ['item.shield', '1 action', '1 action'],
  ])(
    'keeps 2014 don/doff reminders for %s separate from actual time and actions',
    (itemId, don, doff) => {
      const state = withItems({ id: 'target-armor', itemId });
      state.build.proficiencies.armor = ['light', 'medium', 'heavy', 'shield'];
      const session = inTurn(state);
      const before = structuredClone(session.state);
      const name = registry.get('item', itemId).name;
      const equipped = session.try(equipItem, { instanceId: 'target-armor', equipped: true });
      expect(equipped.result).toBe('ok');
      expect(equipped.reasons.join()).toContain(`Don ${name}: ${don}`);
      const removed = session.try(equipItem, { instanceId: 'target-armor', equipped: false });
      expect(removed.result).toBe('ok');
      expect(removed.reasons.join()).toContain(`Doff ${name}: ${doff}`);
      expect(session.live.combat).toEqual(before.live.combat);
      expect(session.live.clock).toEqual(before.live.clock);
      session.undo();
      session.undo();
      expect(session.state).toEqual(before);
    },
  );

  it('blocks equipping an empty instance but allows clearing its flag without consuming time', () => {
    const state = structuredClone(freshState);
    state.live.items['leather-armor-1'] = { qty: 0, equipped: true, attuned: true, charges: 1 };
    const session = inTurn(state);
    const before = structuredClone(session.state);
    expect(session.preview(equipItem, { instanceId: 'leather-armor-1', equipped: true })).toEqual({
      result: 'blocked',
      reasons: ['No quantity left to equip'],
    });
    const result = session.try(equipItem, { instanceId: 'leather-armor-1', equipped: false });
    expect(result).toMatchObject({ result: 'ok', reasons: [] });
    expect(session.live.items['leather-armor-1']).toEqual({
      qty: 0,
      equipped: false,
      attuned: true,
      charges: 1,
    });
    expect(session.live.clock).toEqual(before.live.clock);
    expect(session.live.combat).toEqual(before.live.combat);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it.each([
    null,
    {},
    { instanceId: '', equipped: true },
    { instanceId: 'rapier-1', equipped: 'yes' },
    { instanceId: 'rapier-1', equipped: true, extra: 1 },
  ])('blocks malformed equipment payload %j', (payload) => {
    const session = new Session();
    expect(session.try(equipItem, payload as unknown as EquipItemPayload).result).toBe('blocked');
    expect(session.state).toEqual(freshState);
    expect(session.events).toEqual([]);
  });

  it.each(['missing', 'item.rapier', '__proto__', 'constructor'])(
    'rejects unowned equipment instance %s',
    (instanceId) => {
      const session = new Session();
      expect(session.preview(equipItem, { instanceId, equipped: false })).toEqual({
        result: 'blocked',
        reasons: ['That item instance is unavailable'],
      });
      expect(session.state).toEqual(freshState);
    },
  );
});
