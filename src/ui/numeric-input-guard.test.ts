import { describe, expect, it } from 'vitest';
import { numericRules, numericTextAllowed } from './numeric-input-guard';

const field = (type: string, inputMode: string, attrs: Record<string, string> = {}) => ({
  type,
  inputMode,
  getAttribute: (name: string) => attrs[name] ?? null,
});

describe('numeric input guard', () => {
  it('only digits enter a whole-number field that cannot go negative', () => {
    const rules = { signed: false, decimal: false };
    expect(numericTextAllowed('15', rules)).toBe(true);
    for (const text of ['e', '1e5', '-', '+', '.', 'a', ' 1']) {
      expect(numericTextAllowed(text, rules)).toBe(false);
    }
  });

  it('signs and decimal points enter only where the field allows them', () => {
    expect(numericTextAllowed('-2', { signed: true, decimal: false })).toBe(true);
    expect(numericTextAllowed('+3', { signed: true, decimal: false })).toBe(true);
    expect(numericTextAllowed('0.5', { signed: false, decimal: true })).toBe(true);
    expect(numericTextAllowed('0.5', { signed: true, decimal: false })).toBe(false);
    expect(numericTextAllowed('e', { signed: true, decimal: true })).toBe(false);
  });

  it('reads the rules from the field', () => {
    expect(numericRules(field('text', ''))).toBeUndefined();
    expect(numericRules(field('number', 'numeric', { min: '3', step: '1' }))).toEqual({
      signed: false,
      decimal: false,
    });
    expect(numericRules(field('number', '', { min: '0' }))?.signed).toBe(false);
    expect(numericRules(field('text', 'numeric'))).toEqual({ signed: true, decimal: false });
    expect(numericRules(field('text', 'decimal', { min: '0' }))).toEqual({
      signed: false,
      decimal: true,
    });
    expect(numericRules(field('number', '', { min: '-5', step: '0.5' }))).toEqual({
      signed: true,
      decimal: true,
    });
  });
});
