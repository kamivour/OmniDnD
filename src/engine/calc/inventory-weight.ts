import { characterRegistry, type Registry } from '../registry';
import type { ItemDef, LiveState } from '../schema';
import type { CharacterState } from './sheet';
import { currencyTotals } from './currency';

interface Fraction {
  numerator: bigint;
  denominator: bigint;
}

export interface UnknownWeightItem {
  instanceId: string;
  itemId: string;
  name: string;
  quantity: number;
}

export interface KnownWeightItem extends UnknownWeightItem {
  pounds: string;
  approximate: boolean;
}

/** An item inside an extradimensional container: listed, but adds no carried weight. */
export interface StowedItem extends UnknownWeightItem {
  containerId: string;
}

/** How full one container with a recorded capacity is. */
export interface ContainerLoad {
  instanceId: string;
  name: string;
  pounds: string;
  approximate: boolean;
  /** Records inside this container without a weight. */
  unknown: number;
  capacityPounds?: number;
  cubicFeet?: number;
  extradimensional: boolean;
  /** Known contents already weigh more than the capacity. */
  overCapacity: boolean;
}

export interface InventoryWeight {
  itemPounds: string;
  itemApproximate: boolean;
  coinPounds: string;
  knownPounds: string;
  approximate: boolean;
  knownItems: KnownWeightItem[];
  unknown: UnknownWeightItem[];
  stowed: StowedItem[];
  complete: boolean;
  /** Undefined when capacity is omitted or unknown item weights prevent a decision. */
  overCapacity?: boolean;
}

function gcd(first: bigint, second: bigint): bigint {
  while (second !== 0n) {
    const remainder = first % second;
    first = second;
    second = remainder;
  }
  return first;
}

function fraction(numerator: bigint, denominator: bigint): Fraction {
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

/** Reference weights are decimal numbers; preserve their canonical decimal spelling exactly. */
function decimal(value: number): Fraction {
  if (!Number.isFinite(value) || value < 0)
    throw new Error('Weight and capacity must be finite nonnegative numbers');
  const [mantissa, exponent = '0'] = value.toString().toLowerCase().split('e');
  const [whole, decimals = ''] = mantissa!.split('.');
  const digits = BigInt(`${whole}${decimals}`);
  const places = decimals.length - Number(exponent);
  return places > 0
    ? fraction(digits, 10n ** BigInt(places))
    : fraction(digits * 10n ** BigInt(-places), 1n);
}

function add(first: Fraction, second: Fraction): Fraction {
  const common = gcd(first.denominator, second.denominator);
  const firstFactor = second.denominator / common;
  const secondFactor = first.denominator / common;
  return fraction(
    first.numerator * firstFactor + second.numerator * secondFactor,
    first.denominator * firstFactor,
  );
}

/** Positive values round half up for display; comparisons always use the exact fraction. */
function display(value: Fraction): { pounds: string; approximate: boolean } {
  const scaled = value.numerator * 1000n;
  const remainder = scaled % value.denominator;
  const rounded = scaled / value.denominator + (remainder * 2n >= value.denominator ? 1n : 0n);
  const decimals = (rounded % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  return {
    pounds: `${rounded / 1000n}${decimals ? `.${decimals}` : ''}`,
    approximate: remainder !== 0n,
  };
}

function coinFraction(currency: LiveState['currency']): Fraction {
  return fraction(currencyTotals(currency).coins, 50n);
}

/** Every denomination has the same coin weight; the exact result needs at most two decimals. */
export function coinWeight(currency: LiveState['currency']): string {
  return display(coinFraction(currency)).pounds;
}

type WeightState = Pick<CharacterState, 'build' | 'live'>;

function quantityOf(state: WeightState, instanceId: string): number {
  const live = Object.hasOwn(state.live.items, instanceId)
    ? state.live.items[instanceId]
    : undefined;
  const quantity = live?.qty ?? 0;
  if (!Number.isSafeInteger(quantity) || quantity < 0)
    throw new Error('Recorded item quantities must be safe nonnegative integers');
  return quantity;
}

/** Undefined when the item has no recorded weight. */
function itemFraction(def: ItemDef, quantity: number): Fraction | undefined {
  if (def.weight === undefined) return undefined;
  const bundle = def.bundle ?? 1;
  if (!Number.isSafeInteger(bundle) || bundle < 1)
    throw new Error('Item weight bundles must be safe positive integers');
  const weight = decimal(def.weight);
  return fraction(weight.numerator * BigInt(quantity), weight.denominator * BigInt(bundle));
}

/**
 * The nearest container with a recorded capacity that holds each item, through ordinary
 * containers. Broken paths (missing, cyclic, not a container) give no holder, so the item
 * still counts as carried.
 */
function holders(state: WeightState, registry: Registry): Map<string, string> {
  const byId = new Map(state.build.items.map((item) => [item.instanceId, item]));
  const result = new Map<string, string>();
  for (const item of state.build.items) {
    const visited = new Set([item.instanceId]);
    let parentId = item.container;
    let holder: string | undefined;
    while (parentId) {
      const parent = byId.get(parentId);
      if (!parent || visited.has(parentId)) {
        holder = undefined;
        break;
      }
      visited.add(parentId);
      const def = registry.entries.get(parent.itemId);
      if (def?.kind !== 'item' || def.category !== 'container') {
        holder = undefined;
        break;
      }
      if (def.storage && holder === undefined) holder = parentId;
      parentId = parent.container;
    }
    if (holder !== undefined) result.set(item.instanceId, holder);
  }
  return result;
}

/** True when any container above this item is extradimensional (D246). */
function stowedIn(
  state: WeightState,
  registry: Registry,
  holderOf: Map<string, string>,
  instanceId: string,
): string | undefined {
  const byId = new Map(state.build.items.map((item) => [item.instanceId, item]));
  const visited = new Set<string>();
  let current = holderOf.get(instanceId);
  while (current !== undefined && !visited.has(current)) {
    visited.add(current);
    const def = registry.get('item', byId.get(current)!.itemId);
    if (def.storage?.extradimensional) return current;
    current = holderOf.get(current);
  }
  return undefined;
}

/** Fill level of every recorded container that has a capacity; an inner bag counts only its own weight. */
export function containerLoads(state: WeightState, bundled: Registry): ContainerLoad[] {
  const registry = characterRegistry(bundled, state.build);
  const holderOf = holders(state, registry);
  const sums = new Map<string, { weight: Fraction; unknown: number }>();
  for (const { instanceId, itemId } of state.build.items) {
    const holder = holderOf.get(instanceId);
    if (holder === undefined) continue;
    const quantity = quantityOf(state, instanceId);
    if (quantity === 0) continue;
    const entry = sums.get(holder) ?? { weight: { numerator: 0n, denominator: 1n }, unknown: 0 };
    const weight = itemFraction(registry.get('item', itemId), quantity);
    if (weight === undefined) entry.unknown += 1;
    else entry.weight = add(entry.weight, weight);
    sums.set(holder, entry);
  }
  return state.build.items.flatMap(({ instanceId, itemId }) => {
    const def = registry.get('item', itemId);
    if (!def.storage) return [];
    const { weight, unknown } = sums.get(instanceId) ?? {
      weight: { numerator: 0n, denominator: 1n },
      unknown: 0,
    };
    const { pounds: capacityPounds, cubicFeet, extradimensional } = def.storage;
    const capacity = capacityPounds === undefined ? undefined : decimal(capacityPounds);
    return [
      {
        instanceId,
        name: def.name,
        ...display(weight),
        unknown,
        ...(capacityPounds === undefined ? {} : { capacityPounds }),
        ...(cubicFeet === undefined ? {} : { cubicFeet }),
        extradimensional: extradimensional === true,
        overCapacity:
          capacity !== undefined &&
          weight.numerator * capacity.denominator > capacity.numerator * weight.denominator,
      },
    ];
  });
}

/**
 * Sum each positive recorded instance once, independently of equipment flags. Items inside
 * an extradimensional container (Bag of Holding) are listed as stowed and add nothing.
 */
export function inventoryWeight(
  state: WeightState,
  bundled: Registry,
  capacityPounds?: number,
): InventoryWeight {
  const registry = characterRegistry(bundled, state.build);
  const holderOf = holders(state, registry);
  let itemWeight: Fraction = { numerator: 0n, denominator: 1n };
  const knownItems: KnownWeightItem[] = [];
  const unknown: UnknownWeightItem[] = [];
  const stowed: StowedItem[] = [];
  for (const { instanceId, itemId } of state.build.items) {
    const quantity = quantityOf(state, instanceId);
    if (quantity === 0) continue;
    const def = registry.get('item', itemId);
    const containerId = stowedIn(state, registry, holderOf, instanceId);
    if (containerId !== undefined) {
      stowed.push({ instanceId, itemId, name: def.name, quantity, containerId });
      continue;
    }
    const instanceWeight = itemFraction(def, quantity);
    if (instanceWeight === undefined) {
      unknown.push({ instanceId, itemId, name: def.name, quantity });
      continue;
    }
    knownItems.push({ instanceId, itemId, name: def.name, quantity, ...display(instanceWeight) });
    itemWeight = add(itemWeight, instanceWeight);
  }
  const coins = coinFraction(state.live.currency);
  const known = add(itemWeight, coins);
  const capacity = capacityPounds === undefined ? undefined : decimal(capacityPounds);
  const complete = unknown.length === 0;
  const exceeds =
    capacity !== undefined &&
    known.numerator * capacity.denominator > capacity.numerator * known.denominator;
  const item = display(itemWeight);
  const total = display(known);
  return {
    itemPounds: item.pounds,
    itemApproximate: item.approximate,
    coinPounds: display(coins).pounds,
    knownPounds: total.pounds,
    approximate: total.approximate,
    knownItems,
    unknown,
    stowed,
    complete,
    ...(exceeds ? { overCapacity: true } : capacity && complete ? { overCapacity: false } : {}),
  };
}
