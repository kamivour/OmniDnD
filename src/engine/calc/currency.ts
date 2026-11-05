import type { LiveState } from '../schema';

export const CURRENCY_UNITS = ['cp', 'sp', 'ep', 'gp', 'pp'] as const;
export type CurrencyUnit = (typeof CURRENCY_UNITS)[number];

// 2014 Basic Rules, Equipment: copper equivalents for the recorded denominations.
const COPPER_VALUE: Record<CurrencyUnit, bigint> = {
  cp: 1n,
  sp: 10n,
  ep: 50n,
  gp: 100n,
  pp: 1000n,
};

export interface CurrencyTotals {
  copper: bigint;
  coins: bigint;
  /** Exact GP value, without grouping, exponent notation or unnecessary trailing zeroes. */
  gold: string;
}

/** Totals may exceed number's safe range; these derived BigInts never enter saved character data. */
export function currencyTotals(currency: LiveState['currency']): CurrencyTotals {
  let copper = 0n;
  let coins = 0n;
  for (const unit of CURRENCY_UNITS) {
    const count = currency[unit];
    if (!Object.hasOwn(currency, unit) || !Number.isSafeInteger(count) || count < 0)
      throw new Error(`${unit} must be a recorded nonnegative safe whole coin count`);
    const exact = BigInt(count);
    copper += exact * COPPER_VALUE[unit];
    coins += exact;
  }
  const whole = (copper / 100n).toString();
  const fraction = (copper % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return { copper, coins, gold: fraction ? `${whole}.${fraction}` : whole };
}
