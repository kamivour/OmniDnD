import { describe, expect, it } from 'vitest';
import type { CharacterBuild } from '../schema';
import type { Stat } from './stat';
import {
  CounterCorrectionValueSchema,
  counterCorrection,
  overridePath,
  overrideStat,
  resolveDieOverride,
} from './value-overrides';

type Override = CharacterBuild['overrides'][number];
const build = (...overrides: Override[]) => ({ overrides });
const entry = (path: string, value: unknown, note = 'DM approved'): Override => ({
  path,
  value,
  note,
});
const ac: Stat = {
  value: 13,
  parts: [
    { label: 'Leather', value: 11 },
    { label: 'DEX', value: 2 },
  ],
  notes: ['Leather 11 + DEX 2 = 13.'],
};
const correction = (remaining: number, spent: number, max = 3, spentBefore = 0) => ({
  kind: 'remaining-correction' as const,
  remaining,
  spentBefore,
  spent,
  max,
});

describe('value overrides', () => {
  it('keeps canonical paths distinct for arbitrary instance IDs', () => {
    expect(overridePath('attacks', 'sword/~edge', 'toHit')).toBe('/attacks/sword~1~0edge/toHit');
    expect(overridePath('slots', 'max', 1)).toBe('/slots/max/1');
    expect(overridePath('a/b')).not.toBe(overridePath('a', 'b'));
    expect(overridePath('~1')).not.toBe(overridePath('/'));
    expect(overridePath('')).toBe('/');
    expect(overridePath()).toBe('');
  });

  it('keeps formula explanations honest and adds the noted adjustment without mutating inputs', () => {
    const source = build(entry('/ac', 17, '  enchanted coat  '), entry('/unknown/path', 99));
    const before = structuredClone({ source, ac });
    const actual = overrideStat(source, '/ac', ac, { min: 0 });
    expect(actual).toEqual({
      value: 17,
      parts: [...ac.parts, { label: 'Override: enchanted coat', value: 4 }],
      notes: [...ac.notes!, 'Override: enchanted coat. Calculated 13; using 17.'],
      override: { path: '/ac', note: 'enchanted coat', calculated: 13, value: 17 },
    });
    expect(actual.parts.reduce((sum, part) => sum + part.value, 0)).toBe(actual.value);
    expect({ source, ac }).toEqual(before);
    expect(source.overrides).toHaveLength(2);
  });

  it('uses the last valid exact-path entry while preserving invalid and duplicate legacy records', () => {
    const source = build(
      entry('/ac', 15, 'older'),
      entry('/ac/value', 99),
      entry('/ac', 17, 'newer'),
      entry('/ac', 18, '  '),
      entry('/ac', '19'),
      entry('/ac', 2.5),
      entry('/ac', 31),
    );
    const before = structuredClone(source);
    expect(overrideStat(source, '/ac', ac, { min: 0, max: 30 }).override?.note).toBe('newer');
    expect(overrideStat(source, '/ac', ac, { min: 0, max: 30 }).value).toBe(17);
    expect(source).toEqual(before);
  });

  it('marks an explicit same-value override and accepts signed results in their domain', () => {
    const same = overrideStat(build(entry('/ac', 13)), '/ac', ac);
    expect(same.override?.calculated).toBe(13);
    expect(same.parts.at(-1)?.value).toBe(0);
    expect(
      overrideStat(build(entry('/initiative', -3)), '/initiative', { value: 2, parts: [] }).value,
    ).toBe(-3);
  });

  it.each([NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, Number.MIN_SAFE_INTEGER - 1])(
    'ignores unsafe numeric values (%s)',
    (value) => {
      expect(overrideStat(build(entry('/ac', value)), '/ac', ac)).toBe(ac);
    },
  );

  it('rejects unsafe explanation adjustments and preserves the nearest earlier valid entry', () => {
    const base = { value: Number.MIN_SAFE_INTEGER, parts: [] };
    const source = build(entry('/signed', -1), entry('/signed', Number.MAX_SAFE_INTEGER));
    expect(overrideStat(source, '/signed', base).value).toBe(-1);
    const invalidBase = { value: Infinity, parts: [] };
    expect(overrideStat(build(entry('/signed', 1)), '/signed', invalidBase)).toBe(invalidBase);
  });

  it('returns the original stat when the target has no valid override', () => {
    const source = build(entry('/ac', -1), entry('/speed', 30));
    expect(overrideStat(source, '/ac', ac, { min: 0 })).toBe(ac);
    expect(overrideStat(source, '/initiative', ac)).toBe(ac);
  });

  it('resolves only supported dice, with the same noted duplicate precedence', () => {
    const path = '/features/feature.bard.bardic-inspiration/die';
    const source = build(
      entry(path, 'd8', 'older'),
      entry(path, 'd10', ' table ruling '),
      entry(path, 'd12', ''),
      entry(path, '2d6'),
      entry(path, 'd100'),
      entry('/features/another/die', 'd20'),
    );
    const before = structuredClone(source);
    expect(resolveDieOverride(source, path, 'd6')).toEqual({
      value: 'd10',
      override: { path, note: 'table ruling', calculated: 'd6', value: 'd10' },
    });
    expect(resolveDieOverride(build(entry(path, 'd8', ' ')), path, 'd6')).toEqual({ value: 'd6' });
    expect(source).toEqual(before);
  });
});

describe('remaining counter correction provenance', () => {
  const path = '/hitDice/d8/remaining';

  it('retains prior spending for Reset while reporting only the matching current counter and maximum', () => {
    const value = correction(2, 1, 3, 2);
    const source = build(entry(path, value, '  missed a recovery  '));
    const before = structuredClone(source);
    expect(counterCorrection(source, path, 1, 3)).toEqual({
      path,
      note: 'missed a recovery',
      value,
    });
    expect(counterCorrection(source, path, 2, 3)).toBeUndefined();
    expect(counterCorrection(source, path, 1, 4)).toBeUndefined();
    expect(counterCorrection(source, '/hitDice/d10/remaining', 1, 3)).toBeUndefined();
    expect(source).toEqual(before);
  });

  it('does not revive an older matching correction after the newest correction becomes inactive', () => {
    const source = build(
      entry(path, correction(2, 1), 'older'),
      entry(path, correction(1, 2), 'newer'),
      entry(path, { unknown: true }),
    );
    expect(counterCorrection(source, path, 1, 3)).toBeUndefined();
    expect(counterCorrection(source, path, 2, 3)?.note).toBe('newer');
  });

  it.each([
    correction(-1, 4),
    correction(1, 1),
    correction(4, 0),
    correction(1, 2, 3, -1),
    correction(1.5, 1.5),
    correction(0, Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 1),
    { ...correction(2, 1), unknown: 'not a correction field' },
    2,
  ])('ignores malformed correction values (%j)', (value) => {
    expect(CounterCorrectionValueSchema.safeParse(value).success).toBe(false);
    expect(counterCorrection(build(entry(path, value)), path, 1, 3)).toBeUndefined();
  });

  it('ignores blank notes and supports zero resources without pinning any output', () => {
    expect(
      counterCorrection(build(entry(path, correction(2, 1), ' ')), path, 1, 3),
    ).toBeUndefined();
    expect(counterCorrection(build(entry(path, correction(0, 0, 0))), path, 0, 0)?.value).toEqual(
      correction(0, 0, 0),
    );
    expect(counterCorrection(build(entry(path, correction(3, 0))), path, 1, 3)).toBeUndefined();
  });
});
