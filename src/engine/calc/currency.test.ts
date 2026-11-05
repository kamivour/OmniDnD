import { describe, expect, it } from 'vitest';
import type { LiveState } from '../schema';
import { currencyTotals } from './currency';

type Wallet = LiveState['currency'];
const wallet = (changes: Partial<Wallet> = {}): Wallet => ({
  cp: 0,
  sp: 0,
  ep: 0,
  gp: 0,
  pp: 0,
  ...changes,
});

describe('currencyTotals', () => {
  it('keeps an empty wallet exact and leaves the source untouched', () => {
    const source = wallet();
    expect(currencyTotals(source)).toEqual({ copper: 0n, coins: 0n, gold: '0' });
    expect(source).toEqual(wallet());
  });

  it.each([
    ['cp', 1n, '0.01'],
    ['sp', 10n, '0.1'],
    ['ep', 50n, '0.5'],
    ['gp', 100n, '1'],
    ['pp', 1000n, '10'],
  ] as const)('values one actual %s coin at the 2014 exchange rate', (unit, copper, gold) => {
    expect(currencyTotals(wallet({ [unit]: 1 }))).toEqual({ copper, coins: 1n, gold });
  });

  it('derives The Fool’s recorded 49 gp and 5 sp without converting those coins', () => {
    const source = wallet({ gp: 49, sp: 5 });
    expect(currencyTotals(source)).toEqual({ copper: 4950n, coins: 54n, gold: '49.5' });
    expect(source).toEqual(wallet({ gp: 49, sp: 5 }));
  });

  it('adds every denomination independently, including electrum and individual coin count', () => {
    expect(currencyTotals(wallet({ cp: 3, sp: 4, ep: 5, gp: 6, pp: 7 }))).toEqual({
      copper: 7893n,
      coins: 25n,
      gold: '78.93',
    });
  });

  it.each([
    [1, '0.01'],
    [10, '0.1'],
    [100, '1'],
    [101, '1.01'],
    [105, '1.05'],
    [110, '1.1'],
    [999, '9.99'],
  ] as const)('formats %i cp as the exact plain GP string %s', (cp, gold) => {
    expect(currencyTotals(wallet({ cp })).gold).toBe(gold);
  });

  it('keeps combined maximum safe coin counts exact beyond number arithmetic', () => {
    const max = Number.MAX_SAFE_INTEGER;
    const source = wallet({ cp: max, sp: max, ep: max, gp: max, pp: max });
    expect(currencyTotals(source)).toEqual({
      copper: 10457358334754290551n,
      coins: 45035996273704955n,
      gold: '104573583347542905.51',
    });
    expect(Object.values(source).every((count) => count === max)).toBe(true);
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, -Infinity])(
    'rejects an invalid recorded coin count %s rather than rounding it',
    (count) => {
      expect(() => currencyTotals(wallet({ gp: count }))).toThrow(
        'nonnegative safe whole coin count',
      );
    },
  );

  it('does not invent missing denomination counts or use inherited values', () => {
    expect(() => currencyTotals({ gp: 1 } as Wallet)).toThrow();
    const source = Object.create(wallet()) as Wallet;
    expect(() => currencyTotals(source)).toThrow('cp must be a recorded');
  });
});
