import { describe, expect, it } from 'vitest';
import seed from '../../../data/characters/the-fool.json';
import { registry } from '../../data/registry';
import { ExportFileSchema } from '../schema';
import { byLevel, characterFeatures, resolveFormula, type FormulaContext } from './features';

const fool = ExportFileSchema.parse(seed);
const ctx: FormulaContext = {
  mods: { STR: 0, DEX: 2, CON: 1, INT: 1, WIS: 1, CHA: 5 },
  proficiency: 2,
};

describe('byLevel', () => {
  const table = { 1: 'd6', 5: 'd8', 10: 'd10' };

  it('takes the highest row at or below the level', () => {
    expect([1, 4, 5, 9, 10, 20].map((level) => byLevel(table, level))).toEqual([
      'd6',
      'd6',
      'd8',
      'd8',
      'd10',
      'd10',
    ]);
  });

  it('is undefined below the first row', () => {
    expect(byLevel({ 2: 'd6' }, 1)).toBeUndefined();
  });
});

describe('resolveFormula', () => {
  it('resolves numbers, ability modifiers, and proficiency', () => {
    expect(resolveFormula(3, ctx)).toBe(3);
    expect(resolveFormula({ abilityMod: 'CHA' }, ctx)).toBe(5);
    expect(resolveFormula({ proficiency: 'full' }, ctx)).toBe(2);
    expect(resolveFormula({ proficiency: 'double' }, ctx)).toBe(4);
  });

  it('rounds half proficiency down', () => {
    expect(resolveFormula({ proficiency: 'half' }, { ...ctx, proficiency: 3 })).toBe(1);
  });

  it('applies a minimum to an ability modifier', () => {
    expect(resolveFormula({ abilityMod: 'STR', min: 1 }, ctx)).toBe(1);
  });

  it('reads level tables and per-level counts at the feature level', () => {
    const rage = { byLevel: { 1: 2, 3: 3, 6: 4 } };
    expect([1, 2, 3, 5, 6, 20].map((level) => resolveFormula(rage, ctx, level))).toEqual([
      2, 2, 3, 3, 4, 4,
    ]);
    expect(resolveFormula({ byLevel: { 2: 1 } }, ctx, 1)).toBe(0);
    expect(resolveFormula({ perLevel: 1 }, ctx, 7)).toBe(7);
    expect(resolveFormula({ perLevel: 1 }, ctx)).toBe(0);
  });
});

describe('characterFeatures', () => {
  it('counts other classes’ limited uses at their class level', () => {
    const build = {
      ...fool.build,
      classes: [
        { classId: 'class.fighter', subclassId: undefined, level: 17 },
        { classId: 'class.monk', subclassId: undefined, level: 3 },
      ],
    };
    const all = characterFeatures(build, registry, ctx);
    const uses = (id: string) => all.find((feature) => feature.def.id === id)?.uses;
    expect(uses('feature.fighter.second-wind')).toEqual({ max: 1, recharge: 'short' });
    expect(uses('feature.fighter.action-surge')).toEqual({ max: 2, recharge: 'short' });
    expect(uses('feature.fighter.indomitable')).toEqual({ max: 3, recharge: 'long' });
    expect(uses('feature.monk.ki')).toEqual({ max: 3, recharge: 'short' });
  });

  const features = characterFeatures(fool.build, registry, ctx);
  const find = (id: string) => features.find((feature) => feature.def.id === id);

  it('lists each feature once', () => {
    const ids = features.map((feature) => feature.def.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes race, class, and subclass features up to the class level', () => {
    expect(find('feature.fey-ancestry')?.level).toBe(3);
    expect(find('feature.bard.jack-of-all-trades')).toBeDefined();
    expect(find('feature.bard.cutting-words')).toBeDefined();
    expect(find('feature.bard.ability-score-improvement')).toBeUndefined();
  });

  it('resolves Bardic Inspiration and Song of Rest at Bard 3 (TEST_CHARACTER §4)', () => {
    expect(find('feature.bard.bardic-inspiration')).toMatchObject({
      level: 3,
      uses: { max: 5, recharge: 'long' },
      die: 'd6',
    });
    expect(find('feature.bard.song-of-rest')?.die).toBe('d6');
  });

  it('switches Bardic Inspiration to a short rest and a d8 at Bard 5', () => {
    const bard5 = {
      ...fool.build,
      classes: fool.build.classes.map((entry) => ({ ...entry, level: 5 })),
    };
    const inspiration = characterFeatures(bard5, registry, ctx).find(
      (feature) => feature.def.id === 'feature.bard.bardic-inspiration',
    );
    expect(inspiration).toMatchObject({ uses: { max: 5, recharge: 'short' }, die: 'd8' });
  });
});
