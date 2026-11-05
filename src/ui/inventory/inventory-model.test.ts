import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import type { CharacterState } from '../../engine/calc/sheet';
import { inventoryGroups, inventoryItem } from './inventory-model';

type OwnedItem = CharacterState['build']['items'][number];

function owned(instanceId: string, itemId: string, container?: string, notes?: string): OwnedItem {
  return {
    instanceId,
    itemId,
    ...(container === undefined ? {} : { container }),
    ...(notes === undefined ? {} : { notes }),
  };
}

function state(items: OwnedItem[]): CharacterState {
  const character = structuredClone(seedFile);
  character.build.items = items;
  character.live.items = Object.fromEntries(
    items.map(({ instanceId }) => [instanceId, { qty: 1, equipped: false, attuned: false }]),
  );
  return character;
}

describe('inventoryGroups', () => {
  it('resolves one current item with the same fields as grouping and omits missing instances', () => {
    const character = state([
      owned('bag', 'item.backpack'),
      owned('dagger', 'item.dagger', 'bag', 'Kept separately'),
    ]);
    character.live.items.dagger = { qty: 2, equipped: true, attuned: true, charges: 0 };
    const groupedItem = inventoryGroups(character, registry)
      .flatMap(({ items }) => items)
      .find(({ instanceId }) => instanceId === 'dagger');
    expect(inventoryItem(character, registry, 'dagger')).toEqual(groupedItem);
    expect(inventoryItem(character, registry, 'not-recorded')).toBeUndefined();
  });

  it('shows every Fool instance independently with its recorded notes and live state', () => {
    const character = structuredClone(seedFile);
    const before = structuredClone(character);
    const groups = inventoryGroups(character, registry);
    expect(groups.map(({ name }) => name)).toEqual(['Carried']);
    const items = groups.flatMap(({ items }) => items);
    expect(items.map(({ instanceId }) => instanceId)).toEqual(
      character.build.items.map(({ instanceId }) => instanceId),
    );
    const disguises = items.filter(({ def }) => def.id === 'item.disguise-kit');
    expect(disguises.map(({ instanceId, notes }) => ({ instanceId, notes }))).toEqual([
      { instanceId: 'disguise-kit-1', notes: "Nobleman's elegant suit" },
      { instanceId: 'disguise-kit-2', notes: 'Brown bear costume (looks very real)' },
    ]);
    expect(items.find(({ instanceId }) => instanceId === 'rapier-1')).toMatchObject({
      quantity: 1,
      equipped: true,
      attuned: false,
    });
    expect(items.find(({ instanceId }) => instanceId === 'rations-1')?.quantity).toBe(6);
    expect(character).toEqual(before);
  });

  it('groups nested containers by the immediate parent and explains the complete path', () => {
    const character = state([
      owned('bag', 'item.backpack'),
      owned('sack', 'item.sack', 'bag', 'Supplies'),
      owned('dagger', 'item.dagger'),
      owned('ration', 'item.rations-1-day', 'sack'),
      owned('flute', 'item.flute', 'bag'),
    ]);
    const groups = inventoryGroups(character, registry);
    expect(
      groups.map(({ id, name, items }) => ({
        id,
        name,
        instances: items.map(({ instanceId }) => instanceId),
      })),
    ).toEqual([
      { id: 'carried', name: 'Carried', instances: ['bag', 'dagger'] },
      { id: 'container:bag', name: 'Backpack', instances: ['sack', 'flute'] },
      { id: 'container:sack', name: 'Backpack › Sack · Supplies', instances: ['ration'] },
    ]);
  });

  it('distinguishes duplicate container labels by their stable build order without displaying IDs', () => {
    const character = state([
      owned('bag-b', 'item.backpack'),
      owned('bag-a', 'item.backpack'),
      owned('bag-noted', 'item.backpack', undefined, 'Travel'),
      owned('second-dagger', 'item.dagger', 'bag-a'),
      owned('first-dagger', 'item.dagger', 'bag-b'),
      owned('travel-flute', 'item.flute', 'bag-noted'),
    ]);
    const groups = inventoryGroups(character, registry);
    expect(groups.slice(1).map(({ name }) => name)).toEqual([
      'Backpack (1)',
      'Backpack (2)',
      'Backpack · Travel',
    ]);
    expect(groups[1]?.items[0]?.instanceId).toBe('first-dagger');
    expect(groups[2]?.items[0]?.instanceId).toBe('second-dagger');
    expect(groups.map(({ name }) => name).join()).not.toMatch(/bag-a|bag-b|bag-noted/);
  });

  it('uses notes to distinguish otherwise identical containers and numbers duplicate noted names', () => {
    const character = state([
      owned('bag-1', 'item.backpack', undefined, '  Travel  '),
      owned('bag-2', 'item.backpack', undefined, 'Travel'),
      owned('a', 'item.dagger', 'bag-1'),
      owned('b', 'item.dagger', 'bag-2'),
    ]);
    const groups = inventoryGroups(character, registry);
    expect(groups.slice(1).map(({ name }) => name)).toEqual([
      'Backpack · Travel (1)',
      'Backpack · Travel (2)',
    ]);
    expect(groups[0]?.items[0]?.notes).toBe('  Travel  ');
  });

  it('preserves self, circular, missing and non-container links in a visible review group', () => {
    const character = state([
      owned('self', 'item.backpack', 'self'),
      owned('cycle-a', 'item.sack', 'cycle-b'),
      owned('cycle-b', 'item.backpack', 'cycle-a'),
      owned('missing', 'item.dagger', 'gone'),
      owned('flute', 'item.flute'),
      owned('not-container', 'item.dagger', 'flute'),
      owned('inside-self', 'item.dagger', 'self'),
    ]);
    const before = structuredClone(character);
    const groups = inventoryGroups(character, registry);
    expect(groups.map(({ name }) => name)).toEqual(['Carried', 'Review container links']);
    expect(groups[1]?.notice).toContain('stay as recorded until you review');
    expect(groups[1]?.items.map(({ instanceId }) => instanceId)).toEqual([
      'self',
      'cycle-a',
      'cycle-b',
      'missing',
      'not-container',
      'inside-self',
    ]);
    expect(groups[1]?.items.every(({ locationNote }) => !!locationNote)).toBe(true);
    expect(groups.flatMap(({ items }) => items)).toHaveLength(character.build.items.length);
    expect(
      new Set(groups.flatMap(({ items }) => items.map(({ instanceId }) => instanceId))).size,
    ).toBe(character.build.items.length);
    expect(character).toEqual(before);
  });

  it('keeps children of zero-quantity containers visible and flags the recorded path', () => {
    const character = state([
      owned('bag', 'item.backpack'),
      owned('sack', 'item.sack', 'bag'),
      owned('ration', 'item.rations-1-day', 'sack'),
    ]);
    character.live.items.bag!.qty = 0;
    const groups = inventoryGroups(character, registry);
    expect(groups[0]?.items[0]?.quantity).toBe(0);
    expect(groups[1]?.notice).toContain('quantity 0');
    expect(groups[2]?.notice).toContain('quantity 0');
    expect(groups[2]?.items[0]?.instanceId).toBe('ration');
  });

  it('reads quantities, equipment, attunement and zero charges without changing them', () => {
    const character = state([owned('one', 'item.dagger'), owned('two', 'item.dagger')]);
    character.live.items.one = { qty: 0, equipped: true, attuned: true, charges: 0 };
    character.live.items.two = { qty: 27, equipped: false, attuned: false, charges: 8 };
    const before = structuredClone(character);
    expect(inventoryGroups(character, registry)[0]?.items).toMatchObject([
      { instanceId: 'one', quantity: 0, equipped: true, attuned: true, charges: 0 },
      { instanceId: 'two', quantity: 27, equipped: false, attuned: false, charges: 8 },
    ]);
    expect(character).toEqual(before);
  });

  it('returns no groups for an empty inventory and keeps empty legacy container strings uncontained', () => {
    expect(inventoryGroups(state([]), registry)).toEqual([]);
    const groups = inventoryGroups(state([owned('a', 'item.flute', '')]), registry);
    expect(groups).toMatchObject([
      { id: 'carried', name: 'Carried', items: [{ instanceId: 'a' }] },
    ]);
  });

  it('does not invent quantities or flags when live inventory state is absent', () => {
    const character = state([owned('missing-live', 'item.flute')]);
    delete character.live.items['missing-live'];
    expect(inventoryGroups(character, registry)[0]?.items[0]).toMatchObject({
      quantity: 0,
      equipped: false,
      attuned: false,
    });
    expect(inventoryGroups(character, registry)[0]?.items[0]).not.toHaveProperty('charges');
  });
});
