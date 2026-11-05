import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import type { CharacterState } from '../calc/sheet';
import { ExportFileSchema } from '../schema';
import { startCombat, startTurn, useEconomy } from './combat';
import {
  addInventoryItem,
  editInventoryItem,
  removeInventoryItem,
  type AddInventoryItemPayload,
  type EditInventoryItemPayload,
  type InventoryItemBaseline,
  type RemoveInventoryItemPayload,
} from './inventory';
import { runCommand } from './runner';
import { freshState, Session } from './test-utils';

function inventoryState(): CharacterState {
  const state = structuredClone(freshState);
  state.build.items = [
    { instanceId: 'bag', itemId: 'item.backpack', notes: 'Travel bag' },
    { instanceId: 'sack', itemId: 'item.sack', container: 'bag' },
    { instanceId: 'ration', itemId: 'item.rations-1-day', container: 'sack', notes: 'Keep dry' },
    { instanceId: 'dagger', itemId: 'item.dagger', container: 'bag' },
  ];
  state.live.items = {
    bag: { qty: 1, equipped: false, attuned: false },
    sack: { qty: 1, equipped: false, attuned: false },
    ration: { qty: 3, equipped: true, attuned: true, charges: 2 },
    dagger: { qty: 1, equipped: true, attuned: false },
  };
  return state;
}

function baseline(state: CharacterState, instanceId: string): InventoryItemBaseline {
  return structuredClone({
    item: state.build.items.find((item) => item.instanceId === instanceId)!,
    live: state.live.items[instanceId]!,
  });
}

function reload(session: Session) {
  const file = ExportFileSchema.parse(
    JSON.parse(
      JSON.stringify({
        app: 'omnidnd',
        schemaVersion: 1,
        exportedAt: '2026-11-05T10:00:00.000Z',
        ...session.state,
        events: session.events,
      }),
    ),
  );
  session.state = { campaign: file.campaign, build: file.build, live: file.live };
  session.events = file.events;
}

function inCombat(state = inventoryState()) {
  const session = new Session(state);
  session.run(startCombat, null);
  session.run(startTurn, null);
  session.run(useEconomy, { kind: 'action', label: 'Existing action' });
  session.run(useEconomy, { kind: 'movement', feet: 5 });
  return session;
}

describe('addInventoryItem', () => {
  it('adds an independent catalogue instance with explicit choices and exact Undo', () => {
    const session = inCombat();
    const before = structuredClone(session.state);
    expect(
      session.run(addInventoryItem, {
        instanceId: 'second-dagger',
        itemId: 'item.dagger',
        quantity: 2,
        container: 'sack',
        notes: 'Spare blades',
      }),
    ).toBe('Add item: Dagger ×2');
    expect(session.state.build.items.at(-1)).toEqual({
      instanceId: 'second-dagger',
      itemId: 'item.dagger',
      container: 'sack',
      notes: 'Spare blades',
    });
    expect(session.live).toEqual({
      ...before.live,
      items: { ...before.live.items, 'second-dagger': { qty: 2, equipped: false, attuned: false } },
    });
    expect(session.state.build).toEqual({
      ...before.build,
      items: [...before.build.items, session.state.build.items.at(-1)!],
    });
    expect(session.events.at(-1)?.command).toBe('addInventoryItem');
    reload(session);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('allows a depleted record without inferred equipment, charges or a purchase', () => {
    const state = inventoryState();
    const session = new Session(state);
    session.run(addInventoryItem, { instanceId: 'depleted', itemId: 'item.candle', quantity: 0 });
    expect(session.live.items.depleted).toEqual({ qty: 0, equipped: false, attuned: false });
    expect(session.live.currency).toEqual(state.live.currency);
    expect(session.state.build.items.at(-1)).toEqual({
      instanceId: 'depleted',
      itemId: 'item.candle',
    });
    session.undo();
    expect(session.state).toEqual(state);
  });

  it('warns only for new off-source content and supports logged DM exceptions and Manual', () => {
    const state = inventoryState();
    state.campaign.sources = ['TCE'];
    const session = new Session(state);
    const payload = { instanceId: 'new-dagger', itemId: 'item.dagger', quantity: 1 };
    expect(session.preview(addInventoryItem, payload)).toEqual({
      result: 'warn',
      reasons: ["Dagger is outside this campaign's enabled sources"],
    });
    expect(session.state).toEqual(state);
    expect(session.events).toEqual([]);
    session.run(addInventoryItem, payload, true);
    expect(session.events.at(-1)?.override).toBe(true);
    session.undo();
    expect(session.state).toEqual(state);
    const manual = runCommand(addInventoryItem, state, payload, registry, {
      eventId: 'manual-add',
      realTime: '2026-11-05T10:00:00.000Z',
      automation: 'manual',
    });
    expect(manual.result).toBe('ok');
    if (manual.result === 'ok') expect(manual.event.override).toBeUndefined();
    expect(session.preview(editInventoryItem, { instanceId: 'ration', quantity: 4 }).result).toBe(
      'ok',
    );
    expect(session.preview(removeInventoryItem, { instanceId: 'dagger' }).result).toBe('ok');
  });

  it.each(['bag', 'sack'])(
    'does not merge with or overwrite existing instance %s',
    (instanceId) => {
      const session = new Session(inventoryState());
      const before = structuredClone(session.state);
      expect(
        session.preview(addInventoryItem, { instanceId, itemId: 'item.dagger', quantity: 1 }),
      ).toEqual({ result: 'blocked', reasons: ['That item instance id already exists'] });
      expect(session.state).toEqual(before);
    },
  );

  it('rejects a live-record collision even without a corresponding build reference', () => {
    const state = inventoryState();
    state.live.items.orphan = { qty: 4, equipped: false, attuned: true, charges: 3 };
    const session = new Session(state);
    expect(
      session.preview(addInventoryItem, {
        instanceId: 'orphan',
        itemId: 'item.dagger',
        quantity: 1,
      }).result,
    ).toBe('blocked');
    expect(session.state).toEqual(state);
  });

  it.each(['constructor', '__proto__', 'prototype'])('rejects reserved new id %s', (instanceId) => {
    const session = new Session(inventoryState());
    expect(
      session.preview(addInventoryItem, { instanceId, itemId: 'item.dagger', quantity: 1 }),
    ).toEqual({ result: 'blocked', reasons: ['Choose a fresh item instance id'] });
  });

  it.each([
    null,
    {},
    { instanceId: '', itemId: 'item.dagger', quantity: 1 },
    { instanceId: 'new', itemId: 'item.dagger', quantity: -1 },
    { instanceId: 'new', itemId: 'item.dagger', quantity: 0.5 },
    { instanceId: 'new', itemId: 'item.dagger', quantity: Number.MAX_SAFE_INTEGER + 1 },
    { instanceId: 'new', itemId: 'item.dagger', quantity: Infinity },
    { instanceId: 'new', itemId: 'item.dagger', quantity: 1, equipped: true },
  ])('blocks malformed new item %j without mutation', (payload) => {
    const session = new Session(inventoryState());
    const before = structuredClone(session.state);
    expect(
      session.try(addInventoryItem, payload as unknown as AddInventoryItemPayload).result,
    ).toBe('blocked');
    expect(session.state).toEqual(before);
    expect(session.events).toEqual([]);
  });

  it('blocks an unknown reference before creating either record', () => {
    const session = new Session(inventoryState());
    expect(
      session.preview(addInventoryItem, { instanceId: 'new', itemId: 'item.unknown', quantity: 1 }),
    ).toEqual({ result: 'blocked', reasons: ['That catalogue item is unavailable'] });
    expect(session.state).toEqual(inventoryState());
  });
});

describe('inventory container validation', () => {
  it('retains an empty legacy ancestor as Carried while accepting new valid links beneath it', () => {
    const state = inventoryState();
    state.build.items.find((item) => item.instanceId === 'bag')!.container = '';
    const before = structuredClone(state);
    const session = new Session(state);
    session.run(addInventoryItem, {
      instanceId: 'new',
      itemId: 'item.candle',
      quantity: 2,
      container: 'sack',
    });
    session.run(editInventoryItem, { instanceId: 'dagger', quantity: 1, container: 'sack' });
    expect(session.state.build.items.find((item) => item.instanceId === 'bag')!.container).toBe('');
    expect(session.state.build.items.find((item) => item.instanceId === 'new')!.container).toBe(
      'sack',
    );
    expect(session.state.build.items.find((item) => item.instanceId === 'dagger')!.container).toBe(
      'sack',
    );
    session.undo();
    session.undo();
    expect(session.state).toEqual(before);
    expect(state).toEqual(before);
    expect(
      session.preview(addInventoryItem, {
        instanceId: 'new',
        itemId: 'item.candle',
        quantity: 1,
        container: '',
      }).result,
    ).toBe('blocked');
    expect(
      session.preview(editInventoryItem, { instanceId: 'dagger', quantity: 1, container: '' })
        .result,
    ).toBe('blocked');
  });
  it.each([
    'self',
    'descendant',
    'unrelated cycle',
    'non-container',
    'empty container',
    'empty ancestor',
    'missing ancestor',
  ])('blocks a changed destination with %s while preserving the previous records', (problem) => {
    const state = inventoryState();
    let target = 'ration';
    let container = 'bag';
    if (problem === 'self') container = target;
    if (problem === 'descendant') {
      target = 'bag';
      container = 'sack';
    }
    if (problem === 'unrelated cycle') {
      state.build.items.find((item) => item.instanceId === 'bag')!.container = 'sack';
      container = 'bag';
    }
    if (problem === 'non-container') container = 'dagger';
    if (problem === 'empty container') state.live.items.bag!.qty = 0;
    if (problem === 'empty ancestor') {
      target = 'dagger';
      container = 'sack';
      state.live.items.bag!.qty = 0;
    }
    if (problem === 'missing ancestor')
      state.build.items.find((item) => item.instanceId === 'bag')!.container = 'missing';
    const session = new Session(state);
    const before = structuredClone(state);
    const result = runCommand(
      editInventoryItem,
      state,
      { instanceId: target, quantity: state.live.items[target]!.qty, container },
      registry,
      {
        eventId: 'invalid-move',
        realTime: '2026-11-05T10:00:00.000Z',
        force: true,
        automation: 'manual',
      },
    );
    expect(result.result).toBe('blocked');
    expect(session.state).toEqual(before);
    expect(session.events).toEqual([]);
  });

  it('applies the same valid-path requirement when adding a new record', () => {
    const state = inventoryState();
    state.live.items.bag!.qty = 0;
    const session = new Session(state);
    expect(
      session.preview(addInventoryItem, {
        instanceId: 'new',
        itemId: 'item.candle',
        quantity: 2,
        container: 'sack',
      }).result,
    ).toBe('blocked');
    expect(session.state).toEqual(state);
  });

  it.each(['self', 'cycle', 'missing', 'non-container', 'empty'])(
    'preserves an untouched legacy %s link during count and note edits, then permits explicit repair',
    (problem) => {
      const state = inventoryState();
      const item = state.build.items.find((entry) => entry.instanceId === 'ration')!;
      if (problem === 'self') item.container = 'ration';
      if (problem === 'cycle')
        state.build.items.find((entry) => entry.instanceId === 'bag')!.container = 'sack';
      if (problem === 'missing') item.container = 'missing';
      if (problem === 'non-container') item.container = 'dagger';
      if (problem === 'empty') state.live.items.sack!.qty = 0;
      const session = new Session(state);
      const before = structuredClone(state);
      session.run(editInventoryItem, {
        instanceId: 'ration',
        quantity: 4,
        notes: 'Still carried',
        expected: baseline(state, 'ration'),
      });
      expect(
        session.state.build.items.find((entry) => entry.instanceId === 'ration')!.container,
      ).toBe(item.container);
      const unchanged = baseline(session.state, 'ration');
      session.run(editInventoryItem, {
        instanceId: 'ration',
        quantity: 5,
        container: unchanged.item.container,
        expected: unchanged,
      });
      expect(
        session.state.build.items.find((entry) => entry.instanceId === 'ration')!.container,
      ).toBe(item.container);
      session.run(editInventoryItem, { instanceId: 'ration', quantity: 5, container: null });
      expect(
        session.state.build.items.find((entry) => entry.instanceId === 'ration'),
      ).not.toHaveProperty('container');
      session.undo();
      session.undo();
      session.undo();
      expect(session.state).toEqual(before);
    },
  );
});

describe('editInventoryItem', () => {
  it('changes only explicit fields, preserving identity, flags, charges, money and time', () => {
    const session = inCombat();
    const before = structuredClone(session.state);
    session.run(editInventoryItem, {
      instanceId: 'ration',
      quantity: 0,
      container: 'bag',
      notes: 'Out of food',
      expected: baseline(before, 'ration'),
    });
    expect(session.live).toEqual({
      ...before.live,
      items: { ...before.live.items, ration: { ...before.live.items.ration!, qty: 0 } },
    });
    expect(session.state.build.items.find((item) => item.instanceId === 'ration')).toEqual({
      ...before.build.items.find((item) => item.instanceId === 'ration')!,
      container: 'bag',
      notes: 'Out of food',
    });
    expect(session.state.build.items.filter((item) => item.instanceId !== 'ration')).toEqual(
      before.build.items.filter((item) => item.instanceId !== 'ration'),
    );
    reload(session);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('uses null to clear optional fields while omission and undefined preserve them', () => {
    const session = new Session(inventoryState());
    const before = structuredClone(session.state);
    session.run(editInventoryItem, {
      instanceId: 'ration',
      quantity: 3,
      notes: undefined,
      container: undefined,
    });
    expect(session.state).toEqual(before);
    session.run(editInventoryItem, {
      instanceId: 'ration',
      quantity: 3,
      notes: null,
      container: null,
    });
    expect(session.state.build.items.find((item) => item.instanceId === 'ration')).toEqual({
      instanceId: 'ration',
      itemId: 'item.rations-1-day',
    });
    session.undo();
    session.undo();
    expect(session.state).toEqual(before);
  });

  it.each(['notes', 'quantity', 'flags'])(
    'blocks a stale reviewed target after %s changes',
    (changed) => {
      const state = inventoryState();
      const expected = baseline(state, 'ration');
      if (changed === 'notes')
        state.build.items.find((item) => item.instanceId === 'ration')!.notes = 'Other notes';
      if (changed === 'quantity') state.live.items.ration!.qty = 2;
      if (changed === 'flags') state.live.items.ration!.attuned = false;
      const session = new Session(state);
      expect(
        session.preview(editInventoryItem, { instanceId: 'ration', quantity: 4, expected }),
      ).toEqual({
        result: 'blocked',
        reasons: ['This item changed after review. Review it again.'],
      });
      expect(session.state).toEqual(state);
      expect(session.events).toEqual([]);
    },
  );

  it('preserves newer unrelated changes instead of treating them as a stale target', () => {
    const state = inventoryState();
    const expected = baseline(state, 'ration');
    state.live.currency.gp += 10;
    state.live.clock.seconds += 60;
    state.live.items.dagger!.equipped = false;
    const session = new Session(state);
    session.run(editInventoryItem, { instanceId: 'ration', quantity: 4, expected });
    expect(session.live.currency).toEqual(state.live.currency);
    expect(session.live.clock).toEqual(state.live.clock);
    expect(session.live.items.dagger).toEqual(state.live.items.dagger);
    session.undo();
    expect(session.state).toEqual(state);
  });

  it.each([
    null,
    {},
    { instanceId: 'ration' },
    { instanceId: 'ration', quantity: -1 },
    { instanceId: 'ration', quantity: 1, container: false },
    { instanceId: 'ration', quantity: 1, notes: 1 },
    { instanceId: 'ration', quantity: 1, itemId: 'item.dagger' },
  ])('blocks malformed edit %j', (payload) => {
    const session = new Session(inventoryState());
    const before = structuredClone(session.state);
    expect(
      session.try(editInventoryItem, payload as unknown as EditInventoryItemPayload).result,
    ).toBe('blocked');
    expect(session.state).toEqual(before);
  });
});

describe('removeInventoryItem', () => {
  it('moves only direct contents to Carried and restores all metadata and nested links on Undo', () => {
    const session = inCombat();
    const before = structuredClone(session.state);
    expect(
      session.run(removeInventoryItem, { instanceId: 'bag', expected: baseline(before, 'bag') }),
    ).toBe('Remove item: Backpack; moved 2 direct items to Carried');
    expect(
      session.state.build.items.map(({ instanceId, container }) => ({ instanceId, container })),
    ).toEqual([
      { instanceId: 'sack', container: undefined },
      { instanceId: 'ration', container: 'sack' },
      { instanceId: 'dagger', container: undefined },
    ]);
    const remaining = { ...before.live.items };
    delete remaining.bag;
    expect(session.live).toEqual({ ...before.live, items: remaining });
    expect(session.state.build).toEqual({
      ...before.build,
      items: before.build.items
        .filter(({ instanceId }) => instanceId !== 'bag')
        .map((item) => {
          if (item.container !== 'bag') return item;
          const copy = { ...item };
          delete copy.container;
          return copy;
        }),
    });
    reload(session);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('removes a self-linked legacy record without counting the removed record as contents', () => {
    const state = inventoryState();
    state.build.items = state.build.items.map((item) =>
      item.instanceId === 'ration' ? { ...item, container: 'ration' } : item,
    );
    const session = new Session(state);
    expect(session.run(removeInventoryItem, { instanceId: 'ration' })).toBe(
      'Remove item: Rations (1 day)',
    );
    session.undo();
    expect(session.state).toEqual(state);
  });

  it('also clears direct invalid links to a removed non-container record', () => {
    const state = inventoryState();
    state.build.items.find((item) => item.instanceId === 'ration')!.container = 'dagger';
    const session = new Session(state);
    expect(session.run(removeInventoryItem, { instanceId: 'dagger' })).toContain(
      'moved 1 direct item to Carried',
    );
    expect(
      session.state.build.items.find((item) => item.instanceId === 'ration'),
    ).not.toHaveProperty('container');
    session.undo();
    expect(session.state).toEqual(state);
  });

  it('guards the reviewed item and live fields before removing anything', () => {
    const state = inventoryState();
    const expected = baseline(state, 'bag');
    state.live.items.bag!.qty = 0;
    const session = new Session(state);
    expect(session.preview(removeInventoryItem, { instanceId: 'bag', expected })).toEqual({
      result: 'blocked',
      reasons: ['This item changed after review. Review it again.'],
    });
    expect(session.state).toEqual(state);
  });

  it.each([
    null,
    {},
    { instanceId: '' },
    { instanceId: 'bag', quantity: 1 },
    { instanceId: 'bag', expected: {} },
  ])('blocks malformed removal %j', (payload) => {
    const session = new Session(inventoryState());
    const before = structuredClone(session.state);
    expect(
      session.try(removeInventoryItem, payload as unknown as RemoveInventoryItemPayload).result,
    ).toBe('blocked');
    expect(session.state).toEqual(before);
  });
});

describe('inventory command boundaries and history', () => {
  it.each(['missing', 'constructor', '__proto__', 'toString'])(
    'rejects unavailable or inherited instance %s for edits and removal',
    (instanceId) => {
      const session = new Session(inventoryState());
      const before = structuredClone(session.state);
      expect(session.preview(editInventoryItem, { instanceId, quantity: 1 }).result).toBe(
        'blocked',
      );
      expect(session.preview(removeInventoryItem, { instanceId }).result).toBe('blocked');
      expect(session.state).toEqual(before);
    },
  );

  it('edits and removes a valid legacy constructor instance with exact JSON-reloaded Undo', () => {
    const legacyId = String('constructor');
    const state = inventoryState();
    state.build.items.push({ instanceId: legacyId, itemId: 'item.backpack', notes: 'Old record' });
    state.build.items.find((item) => item.instanceId === 'bag')!.container = legacyId;
    state.live.items = {
      ...state.live.items,
      [legacyId]: { qty: 1, equipped: true, attuned: true, charges: 3 },
    };
    const before = structuredClone(state);
    const session = new Session(state);
    session.run(editInventoryItem, {
      instanceId: legacyId,
      quantity: 2,
      notes: 'Reviewed old record',
      expected: baseline(state, legacyId),
    });
    expect(session.live.items[legacyId]).toEqual({
      qty: 2,
      equipped: true,
      attuned: true,
      charges: 3,
    });
    expect(session.events.at(-1)?.patches.some(({ path }) => path.join('/') === 'live/items')).toBe(
      true,
    );
    reload(session);
    const edited = structuredClone(session.state);
    session.run(removeInventoryItem, {
      instanceId: legacyId,
      expected: baseline(session.state, legacyId),
    });
    expect(Object.hasOwn(session.live.items, legacyId)).toBe(false);
    expect(session.state.build.items.find((item) => item.instanceId === 'bag')).not.toHaveProperty(
      'container',
    );
    reload(session);
    session.undo();
    expect(session.state).toEqual(edited);
    reload(session);
    session.undo();
    expect(session.state).toEqual(before);
    expect(state).toEqual(before);
  });

  it('reverses an add, edit and removal chain after each history reload', () => {
    const session = new Session(inventoryState());
    const before = structuredClone(session.state);
    session.run(addInventoryItem, { instanceId: 'new', itemId: 'item.candle', quantity: 5 });
    const added = structuredClone(session.state);
    reload(session);
    session.run(editInventoryItem, {
      instanceId: 'new',
      quantity: 3,
      container: 'sack',
      notes: 'Camp',
    });
    const edited = structuredClone(session.state);
    reload(session);
    session.run(removeInventoryItem, { instanceId: 'new' });
    reload(session);
    session.undo();
    expect(session.state).toEqual(edited);
    reload(session);
    session.undo();
    expect(session.state).toEqual(added);
    reload(session);
    session.undo();
    expect(session.state).toEqual(before);
  });
});
