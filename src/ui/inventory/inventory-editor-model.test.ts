import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import type { CharacterState } from '../../engine/calc/sheet';
import { buildRegistry } from '../../engine/registry';
import type { ItemDef } from '../../engine/schema';
import { catalogueItems, containerOptions } from './inventory-editor-model';

function item(id: string, name: string, fields: Partial<ItemDef> = {}): ItemDef {
  return {
    kind: 'item',
    id: `item.${id}`,
    name,
    ruleset: '5e-2014',
    source: 'PHB',
    srd: false,
    category: 'gear',
    ...fields,
  };
}

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

describe('catalogueItems', () => {
  const definitions = [
    item('zulu', 'Zulu', { srd: true, fullText: 'This long text is deliberately unindexed.' }),
    item('alpha-b', 'alpha', { source: 'HB', summary: { effect: 'A small signal marker.' } }),
    item('alpha-a', 'Alpha', { source: 'XGE', category: 'container' }),
    item('beta', 'Beta', { source: 'TCE', summary: { effect: 'A bright signal marker.' } }),
  ];
  const references = buildRegistry(
    [[...definitions, registry.get('feature', 'feature.bard.bardic-inspiration')]],
    [],
    [],
  );

  it('sorts bundled item definitions alphabetically with a stable identity tie-break', () => {
    const before = [...references.entries.values()];
    expect(catalogueItems(references, { search: '' }).map(({ id }) => id)).toEqual([
      'item.alpha-a',
      'item.alpha-b',
      'item.beta',
      'item.zulu',
    ]);
    expect([...references.entries.values()]).toEqual(before);
  });

  it('searches names and short summaries without indexing full descriptions', () => {
    expect(catalogueItems(references, { search: '  ALPHA  ' }).map(({ id }) => id)).toEqual([
      'item.alpha-a',
      'item.alpha-b',
    ]);
    expect(catalogueItems(references, { search: '  SIGNAL marker  ' }).map(({ id }) => id)).toEqual(
      ['item.alpha-b', 'item.beta'],
    );
    expect(catalogueItems(references, { search: 'unindexed' })).toEqual([]);
  });

  it('filters categories and only the explicitly supplied campaign sources', () => {
    expect(
      catalogueItems(references, { search: '', sources: ['HB', 'PHB'] }).map(({ id }) => id),
    ).toEqual(['item.alpha-b', 'item.zulu']);
    expect(catalogueItems(references, { search: '', sources: [] })).toEqual([]);
    expect(
      catalogueItems(references, { search: '', category: 'container', sources: ['XGE'] }).map(
        ({ id }) => id,
      ),
    ).toEqual(['item.alpha-a']);
    expect(
      catalogueItems(references, { search: '', category: 'container', sources: ['PHB'] }),
    ).toEqual([]);
  });

  it('retains all item categories and non-SRD entries without requiring a recorded weight', () => {
    const items = catalogueItems(registry, { search: '' });
    expect(new Set(items.map(({ category }) => category))).toEqual(
      new Set([
        'weapon',
        'armor',
        'gear',
        'tool',
        'instrument',
        'container',
        'consumable',
        'magic',
      ]),
    );
    const markedCards = catalogueItems(registry, { search: 'marked cards', sources: ['PHB'] });
    expect(markedCards).toHaveLength(1);
    expect(markedCards[0]).toMatchObject({ id: 'item.deck-of-marked-cards', srd: false });
    expect(markedCards[0]).not.toHaveProperty('weight');
  });
});

describe('containerOptions', () => {
  it('offers Carried first and labels nested and duplicate containers consistently', () => {
    const character = state([
      owned('first-bag', 'item.backpack'),
      owned('second-bag', 'item.backpack'),
      owned('nested-sack', 'item.sack', 'first-bag', '  Tools  '),
      owned('dagger', 'item.dagger', 'nested-sack'),
    ]);
    const before = structuredClone(character);
    expect(containerOptions(character, registry)).toEqual([
      { value: '', label: 'Carried' },
      { value: 'first-bag', label: 'Backpack (1)' },
      { value: 'second-bag', label: 'Backpack (2)' },
      { value: 'nested-sack', label: 'Backpack (1) › Sack · Tools' },
    ]);
    expect(character).toEqual(before);
  });

  it('does not offer zero quantities, missing live state or invalid ancestor paths', () => {
    const character = state([
      owned('good', 'item.backpack'),
      owned('zero', 'item.sack'),
      owned('no-live', 'item.sack'),
      owned('self', 'item.sack', 'self'),
      owned('cycle-a', 'item.sack', 'cycle-b'),
      owned('cycle-b', 'item.sack', 'cycle-a'),
      owned('inside-cycle', 'item.sack', 'cycle-a'),
      owned('missing', 'item.sack', 'gone'),
      owned('flute', 'item.flute'),
      owned('not-container', 'item.sack', 'flute'),
    ]);
    character.live.items.zero!.qty = 0;
    delete character.live.items['no-live'];
    const before = structuredClone(character);
    expect(containerOptions(character, registry).map(({ value }) => value)).toEqual(['', 'good']);
    expect(character).toEqual(before);
  });

  it('excludes the moving container and every descendant without hiding other destinations', () => {
    const character = state([
      owned('moving', 'item.backpack'),
      owned('child', 'item.sack', 'moving'),
      owned('grandchild', 'item.pouch', 'child'),
      owned('other', 'item.backpack'),
    ]);
    expect(containerOptions(character, registry, { movingInstanceId: 'moving' })).toEqual([
      { value: '', label: 'Carried' },
      { value: 'other', label: 'Backpack (2)' },
    ]);
    expect(
      containerOptions(character, registry, { movingInstanceId: 'child' }).map(
        ({ value }) => value,
      ),
    ).toEqual(['', 'moving', 'other']);
  });

  it('excludes positive containers beneath any quantity-zero ancestor without changing records', () => {
    const character = state([
      owned('outer', 'item.backpack'),
      owned('inner', 'item.sack', 'outer'),
      owned('deep', 'item.pouch', 'inner'),
      owned('present', 'item.backpack'),
    ]);
    character.live.items.outer!.qty = 0;
    const before = structuredClone(character);
    expect(containerOptions(character, registry).map(({ value }) => value)).toEqual([
      '',
      'present',
    ]);
    expect(character).toEqual(before);
    character.live.items.outer!.qty = 1;
    expect(containerOptions(character, registry).map(({ value }) => value)).toEqual([
      '',
      'outer',
      'inner',
      'deep',
      'present',
    ]);
  });

  it('keeps empty inventories usable and terminates when a legacy moving subtree is circular', () => {
    expect(containerOptions(state([]), registry)).toEqual([{ value: '', label: 'Carried' }]);
    const character = state([
      owned('cycle-a', 'item.sack', 'cycle-b'),
      owned('cycle-b', 'item.sack', 'cycle-a'),
      owned('good', 'item.backpack'),
    ]);
    expect(containerOptions(character, registry, { movingInstanceId: 'cycle-a' })).toEqual([
      { value: '', label: 'Carried' },
      { value: 'good', label: 'Backpack' },
    ]);
  });
});
