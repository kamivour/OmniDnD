import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import { buildRegistry } from '../registry';
import type { ItemDef } from '../schema';
import { computeSheet, type CharacterState } from './sheet';
import { coinWeight, inventoryWeight } from './inventory-weight';

interface Entry {
  id: string;
  weight?: number;
  bundle?: number;
  quantity?: number;
  container?: string;
  category?: ItemDef['category'];
}

function world(...entries: Entry[]) {
  const state: CharacterState = structuredClone(seedFile);
  state.build.items = entries.map(({ id, container }) => ({
    instanceId: id,
    itemId: `item.${id}`,
    ...(container === undefined ? {} : { container }),
  }));
  state.live.items = Object.fromEntries(
    entries.map(({ id, quantity = 1 }) => [id, { qty: quantity, equipped: false, attuned: false }]),
  );
  state.live.currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  const definitions: ItemDef[] = entries.map(({ id, weight, bundle, category = 'gear' }) => ({
    kind: 'item',
    id: `item.${id}`,
    name: `Recorded ${id}`,
    ruleset: '5e-2014',
    source: 'HB',
    srd: false,
    category,
    ...(weight === undefined ? {} : { weight }),
    ...(bundle === undefined ? {} : { bundle }),
  }));
  return { state, references: buildRegistry([definitions], [], []) };
}

describe('inventoryWeight', () => {
  it('formats exact coin-only weight without requiring inventory or a Sheet calculation', () => {
    expect(coinWeight({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 })).toBe('0');
    expect(coinWeight({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 1 })).toBe('0.02');
    expect(coinWeight({ cp: 1, sp: 2, ep: 3, gp: 4, pp: 5 })).toBe('0.3');
  });

  it('counts container shells and their recorded contents once without following nested links', () => {
    const { state, references } = world(
      { id: 'backpack', category: 'container', weight: 5 },
      { id: 'sack', category: 'container', weight: 0.5, container: 'backpack' },
      { id: 'rations', weight: 2, quantity: 3, container: 'sack' },
      { id: 'weapon', weight: 2 },
    );
    state.live.items.weapon!.equipped = true;
    state.live.items.weapon!.attuned = true;
    const before = structuredClone(state);
    expect(inventoryWeight(state, references, 15)).toEqual({
      itemPounds: '13.5',
      itemApproximate: false,
      coinPounds: '0',
      knownPounds: '13.5',
      approximate: false,
      knownItems: [
        {
          instanceId: 'backpack',
          itemId: 'item.backpack',
          name: 'Recorded backpack',
          quantity: 1,
          pounds: '5',
          approximate: false,
        },
        {
          instanceId: 'sack',
          itemId: 'item.sack',
          name: 'Recorded sack',
          quantity: 1,
          pounds: '0.5',
          approximate: false,
        },
        {
          instanceId: 'rations',
          itemId: 'item.rations',
          name: 'Recorded rations',
          quantity: 3,
          pounds: '6',
          approximate: false,
        },
        {
          instanceId: 'weapon',
          itemId: 'item.weapon',
          name: 'Recorded weapon',
          quantity: 1,
          pounds: '2',
          approximate: false,
        },
      ],
      unknown: [],
      complete: true,
      overCapacity: false,
    });
    expect(state).toEqual(before);
  });

  it('does not duplicate or lose weight when legacy container paths are circular, self-linked or absent', () => {
    const { state, references } = world(
      { id: 'first', weight: 2, category: 'container', container: 'second' },
      { id: 'second', weight: 3, category: 'container', container: 'first' },
      { id: 'self', weight: 4, category: 'container', container: 'self' },
      { id: 'missing', weight: 5, container: 'gone' },
    );
    expect(inventoryWeight(state, references).knownPounds).toBe('14');
  });

  it('uses per-individual bundle weight and counts every coin denomination as physical coins', () => {
    const { state, references } = world({ id: 'ammunition', weight: 1.5, bundle: 20 });
    state.live.currency = { cp: 1, sp: 1, ep: 1, gp: 1, pp: 1 };
    expect(inventoryWeight(state, references)).toMatchObject({
      itemPounds: '0.075',
      coinPounds: '0.1',
      knownPounds: '0.175',
      itemApproximate: false,
      approximate: false,
      complete: true,
    });
  });

  it('reports positive unknown-weight instances without pretending they weigh zero', () => {
    const { state, references } = world(
      { id: 'known', weight: 1, quantity: 2 },
      { id: 'unknown', quantity: 3 },
      { id: 'zero', weight: 0, quantity: 12 },
      { id: 'depleted', quantity: 0 },
    );
    state.build.items.push({ instanceId: 'second-unknown', itemId: 'item.unknown' });
    state.live.items['second-unknown'] = { qty: 1, equipped: false, attuned: false };
    state.live.currency.gp = 5;
    const result = inventoryWeight(state, references, 20);
    expect(result).toMatchObject({
      itemPounds: '2',
      coinPounds: '0.1',
      knownPounds: '2.1',
      complete: false,
      unknown: [
        { instanceId: 'unknown', itemId: 'item.unknown', name: 'Recorded unknown', quantity: 3 },
        {
          instanceId: 'second-unknown',
          itemId: 'item.unknown',
          name: 'Recorded unknown',
          quantity: 1,
        },
      ],
    });
    expect(result.overCapacity).toBeUndefined();
    expect(inventoryWeight(state, references, 2).overCapacity).toBe(true);
  });

  it('ignores zero quantities and absent live records while defined zero weight remains known', () => {
    const { state, references } = world(
      { id: 'unknown', quantity: 0 },
      { id: 'missing-live' },
      { id: 'weightless', weight: 0, quantity: Number.MAX_SAFE_INTEGER },
      { id: 'empty-bag', weight: 5, quantity: 0, category: 'container' },
      { id: 'child', weight: 2, container: 'empty-bag' },
    );
    delete state.live.items['missing-live'];
    expect(inventoryWeight(state, references, 2)).toMatchObject({
      knownPounds: '2',
      complete: true,
      unknown: [],
      overCapacity: false,
    });
  });

  it('compares canonical decimal sums exactly at capacity instead of adding binary float noise', () => {
    const { state, references } = world(
      { id: 'first', weight: 0.1 },
      { id: 'second', weight: 0.2 },
    );
    expect(inventoryWeight(state, references, 0.3)).toMatchObject({
      knownPounds: '0.3',
      approximate: false,
      overCapacity: false,
    });
    expect(inventoryWeight(state, references, 0.29999999999999993).overCapacity).toBe(true);
  });

  it('compares repeating bundle fractions before rounding and reduces exact sums', () => {
    const { state, references } = world({ id: 'third', weight: 1, bundle: 3 });
    expect(inventoryWeight(state, references, 0.3333333333333333)).toMatchObject({
      itemPounds: '0.333',
      itemApproximate: true,
      knownPounds: '0.333',
      approximate: true,
      overCapacity: true,
    });
    expect(inventoryWeight(state, references, 0.3333333333333334).overCapacity).toBe(false);
    state.live.items.third!.qty = 3;
    expect(inventoryWeight(state, references, 1)).toMatchObject({
      knownPounds: '1',
      approximate: false,
      overCapacity: false,
    });
  });

  it('keeps independently rounded item lines separate from an exact fractional subtotal', () => {
    const { state, references } = world(
      { id: 'third', weight: 1, bundle: 3 },
      { id: 'sixth', weight: 1, bundle: 6 },
    );
    const result = inventoryWeight(state, references, 0.5);
    expect(result).toMatchObject({
      itemPounds: '0.5',
      itemApproximate: false,
      knownPounds: '0.5',
      approximate: false,
      overCapacity: false,
      knownItems: [
        { instanceId: 'third', quantity: 1, pounds: '0.333', approximate: true },
        { instanceId: 'sixth', quantity: 1, pounds: '0.167', approximate: true },
      ],
    });
  });

  it.each([
    [0.123, '0.123', false],
    [0.0004, '0', true],
    [0.0005, '0.001', true],
    [0.9995, '1', true],
    [1.25, '1.25', false],
  ] as const)(
    'formats %s lb to at most three decimals with honest approximation',
    (weight, pounds, approximate) => {
      const { state, references } = world({ id: 'fraction', weight });
      expect(inventoryWeight(state, references)).toMatchObject({
        itemPounds: pounds,
        itemApproximate: approximate,
        knownPounds: pounds,
        approximate,
      });
    },
  );

  it('keeps the smallest positive canonical weight above a zero capacity after display rounding', () => {
    const { state, references } = world({ id: 'tiny', weight: Number.MIN_VALUE });
    expect(inventoryWeight(state, references, 0)).toMatchObject({
      knownPounds: '0',
      approximate: true,
      overCapacity: true,
    });
  });

  it('handles large finite reference weights and valid quantities without Infinity or exponent labels', () => {
    const { state, references } = world({
      id: 'large',
      weight: 1e308,
      quantity: Number.MAX_SAFE_INTEGER,
    });
    const expected = (BigInt(Number.MAX_SAFE_INTEGER) * 10n ** 308n).toString();
    expect(inventoryWeight(state, references, Number.MAX_VALUE)).toMatchObject({
      itemPounds: expected,
      knownPounds: expected,
      approximate: false,
      overCapacity: true,
    });
  });

  it('keeps exact coin totals beyond a safe Number sum and does not invent a capacity when omitted', () => {
    const { state, references } = world();
    state.live.currency = Object.fromEntries(
      ['cp', 'sp', 'ep', 'gp', 'pp'].map((unit) => [unit, Number.MAX_SAFE_INTEGER]),
    ) as CharacterState['live']['currency'];
    const result = inventoryWeight(state, references);
    expect(result.coinPounds).toBe('900719925474099.1');
    expect(result.knownPounds).toBe('900719925474099.1');
    expect(result.overCapacity).toBeUndefined();
  });

  it('uses the supplied derived carrying capacity including a noted Sheet override', () => {
    const state: CharacterState = structuredClone(seedFile);
    state.build.items = [{ instanceId: 'rapier', itemId: 'item.rapier' }];
    state.live.items = { rapier: { qty: 83, equipped: false, attuned: false } };
    state.live.currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
    expect(computeSheet(state, registry).carryingCapacity).toBe(165);
    expect(
      inventoryWeight(state, registry, computeSheet(state, registry).carryingCapacity).overCapacity,
    ).toBe(true);
    state.build.overrides.push({
      path: '/carryingCapacity',
      value: 200,
      note: 'DM carrying allowance',
    });
    expect(
      inventoryWeight(state, registry, computeSheet(state, registry).carryingCapacity).overCapacity,
    ).toBe(false);
  });

  it.each([Infinity, NaN, -1])(
    'rejects an invalid capacity %s rather than reporting a misleading comparison',
    (capacity) => {
      const { state, references } = world();
      expect(() => inventoryWeight(state, references, capacity)).toThrow('finite nonnegative');
    },
  );
});
