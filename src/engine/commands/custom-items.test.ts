import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import type { CharacterState } from '../calc/sheet';
import { ExportFileSchema, ItemChargesSchema, type ItemDef } from '../schema';
import {
  addInventoryItem,
  createCustomItem,
  deleteCustomItem,
  editCustomItem,
  removeInventoryItem,
} from './inventory';
import { equipItem, setItemAttunement } from './items';
import { freshState, Session } from './test-utils';

const wand: ItemDef = {
  kind: 'item',
  id: 'item.custom.ember-wand',
  name: 'Ember Wand',
  ruleset: '5e-2014',
  source: 'HB',
  srd: false,
  category: 'magic',
  rarity: 'uncommon',
  attunement: true,
  charges: { max: 5, recharge: 'dawn', regain: { dice: '1d4', bonus: 1 } },
  summary: { effect: 'Placeholder text for a test wand.' },
};

function blade(): ItemDef {
  const rapier = registry.get('item', 'item.rapier');
  return {
    kind: 'item',
    id: 'item.custom.moon-blade',
    name: 'Moon Blade',
    ruleset: '5e-2014',
    source: 'HB',
    srd: false,
    category: 'weapon',
    weapon: structuredClone(rapier.weapon!),
    baseItemId: 'item.rapier',
    weight: 2,
  };
}

function emptyState(): CharacterState {
  const state = structuredClone(freshState);
  state.build.items = [{ instanceId: 'bag', itemId: 'item.backpack' }];
  state.live.items = { bag: { qty: 1, equipped: false, attuned: false } };
  return state;
}

function exported(session: Session) {
  return ExportFileSchema.parse(
    JSON.parse(
      JSON.stringify({
        app: 'omnidnd',
        schemaVersion: 1,
        exportedAt: '2026-11-06T10:00:00.000Z',
        ...session.state,
        events: session.events,
      }),
    ),
  );
}

describe('createCustomItem', () => {
  it('saves the definition on the character, records a copy with full charges and undoes exactly', () => {
    const session = new Session(emptyState());
    const before = structuredClone(session.state);
    expect(
      session.run(createCustomItem, {
        item: wand,
        instanceId: 'wand-1',
        quantity: 1,
        container: 'bag',
      }),
    ).toBe('Create custom item: Ember Wand ×1');
    expect(session.state.build.customItems).toEqual([wand]);
    expect(session.state.build.items.at(-1)).toEqual({
      instanceId: 'wand-1',
      itemId: wand.id,
      container: 'bag',
    });
    expect(session.live.items['wand-1']).toEqual({
      qty: 1,
      equipped: false,
      attuned: false,
      charges: 5,
    });
    session.undo();
    expect(session.state).toEqual(before);
    expect(session.state.build).not.toHaveProperty('customItems');
  });

  it('blocks invalid definitions, used ids, bundled ids and taken instance ids', () => {
    const session = new Session(emptyState());
    session.run(createCustomItem, { item: wand, instanceId: 'wand-1', quantity: 1 });
    const payload = { item: wand, instanceId: 'wand-2', quantity: 1 };
    expect(session.preview(createCustomItem, payload).reasons).toEqual([
      'That custom item id is already used',
    ]);
    const other = { ...wand, id: 'item.custom.other' };
    expect(
      session.preview(createCustomItem, { ...payload, item: other, instanceId: 'bag' }).result,
    ).toBe('blocked');
    for (const item of [
      { ...other, id: 'item.dagger' },
      { ...other, source: 'PHB' },
      { ...other, summary: { effect: 'word '.repeat(41) } },
      { ...other, category: 'weapon' },
    ])
      expect(session.preview(createCustomItem, { ...payload, item: item as ItemDef }).result).toBe(
        'blocked',
      );
  });

  it('can be added again from the catalogue without a source warning', () => {
    const session = new Session(emptyState());
    session.state.campaign.sources = ['PHB'];
    session.run(createCustomItem, { item: wand, instanceId: 'wand-1', quantity: 1 });
    expect(
      session.preview(addInventoryItem, { instanceId: 'wand-2', itemId: wand.id, quantity: 1 }),
    ).toEqual({ result: 'ok', reasons: [] });
  });
});

describe('custom weapons', () => {
  it('attack like their base weapon and keep its proficiency', () => {
    const session = new Session(emptyState());
    session.run(createCustomItem, { item: blade(), instanceId: 'blade-1', quantity: 1 });
    session.run(equipItem, { instanceId: 'blade-1', equipped: true });
    const attack = session.sheet.attacks.find((entry) => entry.instanceId === 'blade-1');
    const rapier = new Session(structuredClone(freshState)).sheet.attacks.find(
      (entry) => entry.itemId === 'item.rapier',
    );
    expect(attack).toMatchObject({ name: 'Moon Blade', proficient: rapier?.proficient });
    expect(attack?.toHit.value).toBe(rapier?.toHit.value);
    expect(attack?.damage).toEqual(rapier?.damage);
  });
});

describe('editCustomItem', () => {
  it('updates every copy, clamps charges, and ends attunement when it is no longer needed', () => {
    const session = new Session(emptyState());
    session.run(createCustomItem, { item: wand, instanceId: 'wand-1', quantity: 1 });
    session.run(addInventoryItem, { instanceId: 'wand-2', itemId: wand.id, quantity: 1 });
    session.run(setItemAttunement, { instanceId: 'wand-1', attuned: true });
    const edited: ItemDef = {
      ...wand,
      name: 'Cinder Wand',
      attunement: false,
      charges: { max: 3, recharge: 'none' },
    };
    const payload = { item: edited, expected: wand };
    expect(session.preview(editCustomItem, payload)).toEqual({
      result: 'warn',
      reasons: ['Ember Wand will no longer need attunement; its bond ends'],
    });
    expect(session.run(editCustomItem, payload, true)).toBe(
      'Edit custom item: Ember Wand → Cinder Wand',
    );
    expect(session.live.items['wand-1']).toMatchObject({ attuned: false, charges: 3 });
    expect(session.live.items['wand-2']).toMatchObject({ charges: 3 });
    expect(session.preview(editCustomItem, payload).reasons).toEqual([
      'This item changed after review. Review it again.',
    ]);
  });

  it('adds full charges when charges are new and drops them when removed', () => {
    const session = new Session(emptyState());
    const plain: ItemDef = { ...wand };
    delete plain.charges;
    session.run(createCustomItem, { item: plain, instanceId: 'wand-1', quantity: 1 });
    expect(session.live.items['wand-1']).not.toHaveProperty('charges');
    session.run(editCustomItem, { item: wand });
    expect(session.live.items['wand-1']?.charges).toBe(5);
    session.run(editCustomItem, { item: plain });
    expect(session.live.items['wand-1']).not.toHaveProperty('charges');
  });

  it('blocks items that are not this character’s custom items', () => {
    const session = new Session(emptyState());
    expect(session.preview(editCustomItem, { item: wand }).reasons).toEqual([
      'That custom item is unavailable',
    ]);
  });
});

describe('deleteCustomItem', () => {
  it('blocks while copies or proficiencies use it, then removes the definition', () => {
    const session = new Session(emptyState());
    session.run(createCustomItem, { item: wand, instanceId: 'wand-1', quantity: 1 });
    expect(session.preview(deleteCustomItem, { itemId: wand.id }).reasons).toEqual([
      'Remove every copy from the inventory first',
    ]);
    session.run(removeInventoryItem, { instanceId: 'wand-1' });
    const unused = session.state;
    session.state = structuredClone(unused);
    session.state.build.favorites.push(wand.id);
    expect(session.preview(deleteCustomItem, { itemId: wand.id }).result).toBe('blocked');
    session.state = unused;
    expect(session.run(deleteCustomItem, { itemId: wand.id })).toBe(
      'Delete custom item: Ember Wand',
    );
    expect(session.state.build).not.toHaveProperty('customItems');
  });
});

describe('portability', () => {
  it('round-trips through export and rejects malformed or duplicate custom items on import', () => {
    const session = new Session(emptyState());
    session.run(createCustomItem, { item: wand, instanceId: 'wand-1', quantity: 1 });
    const file = exported(session);
    expect(file.build.customItems).toEqual([wand]);
    const raw = JSON.parse(JSON.stringify(file));
    raw.build.customItems.push(wand);
    expect(ExportFileSchema.safeParse(raw).success).toBe(false);
    raw.build.customItems = [{ ...wand, id: 'item.dagger' }];
    expect(ExportFileSchema.safeParse(raw).success).toBe(false);
  });

  it('accepts multi-digit recharge dice', () => {
    expect(
      ItemChargesSchema.safeParse({ max: 50, recharge: 'dawn', regain: { dice: '10d6' } }).success,
    ).toBe(true);
  });
});
