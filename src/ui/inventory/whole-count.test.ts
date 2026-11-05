import { describe, expect, it } from 'vitest';
import { parseWholeCount } from './whole-count';

describe('parseWholeCount', () => {
  it.each([
    ['0', 0],
    ['0000', 0],
    ['0.0', 0],
    ['.0', 0],
    ['1', 1],
    ['0002', 2],
    ['+2', 2],
    ['  2  ', 2],
    ['2.0', 2],
    ['2.', 2],
    ['2.00000000000000000', 2],
    ['1e3', 1000],
    ['1E+3', 1000],
    ['0.1e1', 1],
    ['0.0001e4', 1],
    ['100e-2', 1],
    ['1.2345e4', 12345],
    ['123.4500e2', 12345],
    ['0.10000000000000000000e1', 1],
    ['1e00000000000000000000003', 1000],
    ['1e-0000000000000', 1],
    ['1e15', 1000000000000000],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
    ['9007199254740991.0', Number.MAX_SAFE_INTEGER],
    ['90071992547409910e-1', Number.MAX_SAFE_INTEGER],
    ['9007199254740991000e-3', Number.MAX_SAFE_INTEGER],
  ] as const)('parses exact whole text %s as %s', (input, expected) => {
    expect(parseWholeCount(input)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    '-',
    '+',
    '.',
    '+.',
    '1e',
    '1e+',
    '1e--1',
    '-0',
    '-1',
    '-2.0',
    '-1e3',
    'NaN',
    'Infinity',
    '-Infinity',
    '0x10',
    '0b10',
    '1/2',
    '1+1',
    '1_000',
    '1,000',
    '1 2',
    '1\n2',
    '0.5',
    '0.1e0',
    '100e-3',
    '1.2345e3',
    '0.99999999999999999',
    '1.00000000000000001',
    '9007199254740990.1',
    '9007199254740990.5',
    '9007199254740991.1',
    '90071992547409910e-2',
    '9007199254740992',
    '9999999999999999',
    '9.1e15',
    '1e16',
  ])('rejects invalid, fractional or unsafe text %j without rounding', (input) => {
    expect(parseWholeCount(input)).toBeUndefined();
  });

  it('rejects enormous positive and negative exponents before constructing a shifted number', () => {
    expect(parseWholeCount('1e1000000000')).toBeUndefined();
    expect(parseWholeCount('1e-1000000000')).toBeUndefined();
    expect(parseWholeCount(`1e${'9'.repeat(10000)}`)).toBeUndefined();
    expect(parseWholeCount(`1e-${'9'.repeat(10000)}`)).toBeUndefined();
  });

  it('handles exact zero and cancelling zeroes without exponent-sized allocation', () => {
    expect(parseWholeCount(`0e${'9'.repeat(10000)}`)).toBe(0);
    expect(parseWholeCount(`0e-${'9'.repeat(10000)}`)).toBe(0);
    expect(parseWholeCount(`1${'0'.repeat(10000)}e-10000`)).toBe(1);
  });
});
