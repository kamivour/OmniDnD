import type { Registry } from '../registry';
import type { LiveState } from '../schema';
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

export interface InventoryWeight {
  itemPounds: string;
  itemApproximate: boolean;
  coinPounds: string;
  knownPounds: string;
  approximate: boolean;
  knownItems: KnownWeightItem[];
  unknown: UnknownWeightItem[];
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

/** Sum each positive recorded instance once, independently of its container links or equipment flags. */
export function inventoryWeight(
  state: Pick<CharacterState, 'build' | 'live'>,
  registry: Registry,
  capacityPounds?: number,
): InventoryWeight {
  let itemWeight: Fraction = { numerator: 0n, denominator: 1n };
  const knownItems: KnownWeightItem[] = [];
  const unknown: UnknownWeightItem[] = [];
  for (const { instanceId, itemId } of state.build.items) {
    const live = Object.hasOwn(state.live.items, instanceId)
      ? state.live.items[instanceId]
      : undefined;
    const quantity = live?.qty ?? 0;
    if (!Number.isSafeInteger(quantity) || quantity < 0)
      throw new Error('Recorded item quantities must be safe nonnegative integers');
    if (quantity === 0) continue;
    const def = registry.get('item', itemId);
    if (def.weight === undefined) {
      unknown.push({ instanceId, itemId, name: def.name, quantity });
      continue;
    }
    const bundle = def.bundle ?? 1;
    if (!Number.isSafeInteger(bundle) || bundle < 1)
      throw new Error('Item weight bundles must be safe positive integers');
    const weight = decimal(def.weight);
    const instanceWeight = fraction(
      weight.numerator * BigInt(quantity),
      weight.denominator * BigInt(bundle),
    );
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
    complete,
    ...(exceeds ? { overCapacity: true } : capacity && complete ? { overCapacity: false } : {}),
  };
}
