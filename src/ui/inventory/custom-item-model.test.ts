import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { characterRegistry } from '../../engine/registry';
import {
  baseItemOptions,
  buildCustomItem,
  customItemFields,
  emptyCustomItemFields,
  newCustomItemId,
} from './custom-item-model';

const id = 'item.custom.test';

describe('buildCustomItem', () => {
  it('copies weapon stats and weight from the chosen base item', () => {
    const rapier = registry.get('item', 'item.rapier');
    const result = buildCustomItem(
      {
        ...emptyCustomItemFields(),
        name: ' Moon Blade ',
        category: 'weapon',
        baseItemId: 'item.rapier',
        rarity: 'rare',
        attunement: true,
        description: 'Placeholder words.',
      },
      id,
      registry,
    );
    expect(result.errors).toEqual([]);
    expect(result.item).toMatchObject({
      id,
      name: 'Moon Blade',
      source: 'HB',
      srd: false,
      category: 'weapon',
      weapon: rapier.weapon,
      weight: rapier.weight,
      baseItemId: 'item.rapier',
      rarity: 'rare',
      attunement: true,
      summary: { effect: 'Placeholder words.' },
    });
  });

  it('builds charges and a healing consumable, and round-trips through the form', () => {
    const wand = buildCustomItem(
      {
        ...emptyCustomItemFields(),
        name: 'Wand',
        charges: '7',
        recharge: 'dawn',
        regainDice: '1D6',
        regainBonus: '1',
        cost: '150',
      },
      id,
      registry,
    ).item!;
    expect(wand.charges).toEqual({ max: 7, recharge: 'dawn', regain: { dice: '1d6', bonus: 1 } });
    expect(wand.cost).toEqual({ amount: 150, unit: 'gp' });
    expect(buildCustomItem(customItemFields(wand), id, registry).item).toEqual(wand);

    const tonic = buildCustomItem(
      {
        ...emptyCustomItemFields(),
        name: 'Tonic',
        category: 'consumable',
        healingDice: '2d4',
        healingBonus: '2',
      },
      id,
      registry,
    ).item!;
    expect(tonic.use).toEqual({ activation: 'action', healing: { dice: '2d4', bonus: 2 } });
    expect(buildCustomItem(customItemFields(tonic), id, registry).item).toEqual(tonic);
    const potion = buildCustomItem(
      { ...customItemFields(tonic), potion: true },
      id,
      registry,
    ).item!;
    expect(potion.use?.potion).toBe(true);
    expect(customItemFields(potion).potion).toBe(true);
    expect(buildCustomItem(customItemFields(potion), id, registry).item).toEqual(potion);
  });

  it('lists what to fix', () => {
    expect(
      buildCustomItem(
        {
          ...emptyCustomItemFields(),
          category: 'armor',
          weight: '-1',
          charges: '0',
          description: 'word '.repeat(41),
        },
        id,
        registry,
      ).errors,
    ).toEqual([
      'Enter a name.',
      'Choose which armor it is based on.',
      'Weight must be zero or more.',
      'Keep the description to 40 words or fewer.',
      'Charges must be a whole number of 1 or more.',
    ]);
    expect(
      buildCustomItem(
        { ...emptyCustomItemFields(), name: 'Wand', charges: '3', regainDice: 'd6' },
        id,
        registry,
      ).errors,
    ).toEqual(['Enter recharge dice like 1d6.']);
  });
});

describe('custom item ids and base options', () => {
  it('slugs the name and avoids taken ids', () => {
    const taken = new Set(['item.custom.flame-rapier']);
    expect(newCustomItemId('Flame Rapier!', (value) => taken.has(value))).toBe(
      'item.custom.flame-rapier-2',
    );
    expect(newCustomItemId('???', () => false)).toBe('item.custom.item');
  });

  it('offers only catalogue weapons or armor, never custom items', () => {
    const blade = buildCustomItem(
      {
        ...emptyCustomItemFields(),
        name: 'Blade',
        category: 'weapon',
        baseItemId: 'item.dagger',
      },
      id,
      registry,
    ).item!;
    const scoped = characterRegistry(registry, { customItems: [blade] });
    const options = baseItemOptions(scoped, 'weapon');
    expect(options.some((entry) => entry.id === 'item.dagger')).toBe(true);
    expect(options.some((entry) => entry.id === id)).toBe(false);
    expect(baseItemOptions(scoped, 'magic')).toEqual([]);
  });
});
