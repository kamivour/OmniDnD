import { describe, expect, it } from 'vitest';
import type { NamedCreature } from './identify';
import {
  additionalBlocks,
  applyOverrides,
  blockKey,
  confirmFindings,
  OverridesSchema,
  reviewIndex,
} from './overrides';
import { compareReprints } from './reprints';
import { reviewHtml, reviewPages, type ReviewReport } from './review';
import { indexCoverage, validateCreature } from './validate';

function block(): NamedCreature {
  return {
    page: 5,
    printed: 3,
    name: 'Chalk Sentry',
    heading: 'CHALK SENTRY',
    size: 'medium',
    creatureType: 'construct',
    alignment: 'unaligned',
    ac: 14,
    hp: 16,
    hpFormula: '3d8+3',
    speed: { walk: 25 },
    abilities: { STR: 16, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 8 },
    printedModifiers: { STR: 3, DEX: 2, CON: 1, INT: 0, WIS: 0, CHA: -1 },
    saves: { DEX: 4 },
    skills: { perception: 4 },
    senses: { passivePerception: 14 },
    vulnerabilities: [],
    resistances: [],
    immunities: [],
    conditionImmunities: [],
    languages: 'Etchings',
    cr: 1,
    xp: 200,
    proficiencyBonus: 2,
    traits: [
      {
        name: 'Etched Spark',
        text: 'Its spellcasting ability is Intelligence (spell save DC 10).',
      },
    ],
    actions: [
      {
        name: 'Chisel Tap',
        text: 'Melee Weapon Attack: +5 to hit. The strike chips a small mark.',
        attackBonus: 5,
        damage: [{ dice: '1d8+3', type: 'piercing' }],
      },
    ],
    bonusActions: [],
    reactions: [],
    legendaryActions: [],
    mythicActions: [],
    lairActions: [],
    intros: {},
    issues: [],
  };
}

describe('validateCreature', () => {
  it('checks the static rolls and both proficiency multipliers', () => {
    expect(validateCreature(block()).findings).toEqual([]);
  });

  it('changes a single digit when only one correction clears every check', () => {
    const creature = { ...block(), hp: 15, issues: ['hit points 15 do not match 3d8+3'] };
    expect(validateCreature(creature)).toMatchObject({
      creature: { hp: 16 },
      correction: { field: 'hp-average', from: 15, to: 16 },
      findings: [],
    });
    expect(creature.hp).toBe(15);
  });

  it('retains ambiguous, unrelated and multiple-character issues for review', () => {
    expect(validateCreature({ ...block(), saves: { DEX: 5 } })).toMatchObject({
      findings: [{ code: 'save:DEX', severity: 'review' }],
    });
    expect(validateCreature({ ...block(), hp: 25 }).correction).toBeUndefined();
    expect(
      validateCreature({ ...block(), hp: 15, issues: ['missing line'] }).correction,
    ).toBeUndefined();
    expect(
      validateCreature({ ...block(), hp: 15, skills: { perception: 5 } }).correction,
    ).toBeUndefined();
  });

  it('checks CON, printed modifiers, XP, PB, perception, hit, damage and DC independently', () => {
    const broken = block();
    broken.hpFormula = '3d8+1';
    broken.printedModifiers!.CHA = 1;
    broken.xp = 450;
    broken.proficiencyBonus = 3;
    broken.senses.passivePerception = 17;
    broken.actions[0]!.attackBonus = 6;
    broken.actions.push({
      ...broken.actions[0]!,
      attackBonus: 5,
      damage: [{ dice: '1d8+2', type: 'piercing' }],
    });
    broken.traits[0]!.text = 'Its spellcasting ability is Intelligence (spell save DC 18).';
    const result = validateCreature(broken);
    expect(result.findings.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'hp-average',
        'hp-constitution',
        'modifier:CHA',
        'xp',
        'proficiency',
        'passive-perception',
        'actions:0:Chisel Tap:attack',
        'actions:1:Chisel Tap:damage',
        'traits:0:Etched Spark:spell-dc',
      ]),
    );
    expect(result.correction).toBeUndefined();
  });
});

it('reports missing indexed forms and duplicate blocks without merging numbered forms', () => {
  const result = indexCoverage(
    [
      { ...block(), name: 'Sentry 1' },
      { ...block(), name: 'Sentry 1' },
    ],
    [{ name: 'Sentry 1' }, { name: 'Sentry 2' }],
  );
  expect(result).toMatchObject({ expected: 2, matched: 1, missing: [{ name: 'Sentry 2' }] });
  expect(result.duplicates[0]).toHaveLength(2);
});

it('applies a field patch by original page and heading and keeps missing data blocking', () => {
  const creature = { ...block(), hp: undefined, ac: undefined };
  const overrides = OverridesSchema.parse({
    blocks: { '3:CHALK SENTRY': { reason: 'Read the print', fields: { hp: 16 } } },
  });
  const patched = applyOverrides([creature], overrides)[0]!;
  expect(patched.hp).toBe(16);
  expect(creature.hp).toBeUndefined();
  expect(blockKey(patched)).toBe('3:CHALK SENTRY');
  const checked = validateCreature(patched);
  expect(confirmFindings(checked, [checked.findings[0]!]).findings).toEqual([
    expect.objectContaining({ code: 'missing:ac', severity: 'blocking' }),
  ]);
  expect(() => applyOverrides([], overrides)).toThrow('No block matches override');
});

it('keeps review exceptions tied to an exact finding and permits explicit index corrections', () => {
  const result = validateCreature({ ...block(), actions: [], issues: ['Printed without actions'] });
  const confirmed = confirmFindings(result, [
    { code: 'missing:actions', message: 'No actions were read.' },
    { code: 'parse:0', message: 'Unrelated note' },
  ]);
  expect(confirmed.confirmed.map(({ code }) => code)).toEqual(['missing:actions']);
  expect(confirmed.findings.map(({ code }) => code)).toEqual(['parse:0']);
  const names = reviewIndex(
    [{ name: 'Sentries' }, { name: 'Chalk' }],
    OverridesSchema.parse({
      index: {
        Sentries: { kind: 'heading', reason: 'Family heading' },
        Chalk: { kind: 'alias', name: 'Chalk Sentry', page: 3, reason: 'Abbreviation in index' },
        'Dust Wisp': { kind: 'missing', page: 9, reason: 'Index line lost to OCR' },
      },
    }),
  );
  expect(names).toEqual([
    { name: 'Chalk Sentry', page: 3 },
    { name: 'Dust Wisp', page: 9 },
  ]);
  expect(() =>
    reviewIndex(
      [{ name: 'Dust Wisp' }],
      OverridesSchema.parse({ index: { 'Dust Wisp': { kind: 'missing', page: 9, reason: 'x' } } }),
    ),
  ).toThrow('Index already lists Dust Wisp');
});

it('requires the full stat card for a block missing from the PDF text', () => {
  const {
    name,
    size,
    creatureType,
    ac,
    hp,
    hpFormula,
    speed,
    abilities,
    cr,
    xp,
    proficiencyBonus,
    languages,
    actions,
  } = block();
  const fields = {
    name,
    size,
    creatureType,
    ac,
    hp,
    hpFormula,
    speed,
    abilities,
    cr,
    xp,
    proficiencyBonus,
    languages,
    actions,
  };
  const patch = { reason: 'Read the printed card', fields };
  const overrides = OverridesSchema.parse({ added: { '3:CHALK SENTRY': patch } });
  const [added] = additionalBlocks(overrides, 2, 6);
  expect(added).toMatchObject({ printed: 3, page: 5, heading: 'CHALK SENTRY', name });
  expect(validateCreature(added!).findings).toEqual([]);
  expect(() => additionalBlocks(overrides, 2, 4)).toThrow('outside the PDF');
  expect(
    OverridesSchema.safeParse({
      added: { '3:CHALK SENTRY': { ...patch, fields: { ...fields, hp: undefined } } },
    }).success,
  ).toBe(false);
});

it('compares earlier printings and renders only flagged pages with escaped detail text', () => {
  const base = block();
  const parsed = validateCreature({ ...base, hp: undefined, name: 'Sentry <ornament>' });
  const changed = compareReprints([base], [{ ...base, ac: 15 }]);
  expect(changed).toMatchObject({
    matched: 1,
    changed: [{ differences: [{ field: 'ac', earlier: 14, later: 15 }] }],
  });
  const report: ReviewReport = {
    book: 'Demo',
    records: [parsed, validateCreature({ ...base, page: 6 })],
    coverage: indexCoverage([base], [{ name: 'Chalk Sentry' }, { name: 'Coal Sentry', page: 3 }]),
    reprints: changed,
  };
  expect(reviewPages(report, 2, 6)).toEqual([5]);
  const output = reviewHtml(report, new Map([[5, 'renders/page-5.png']]), 2);
  expect(output).toContain('Sentry &lt;ornament&gt;');
  expect(output).toContain('renders/page-5.png');
  expect(output).toContain('1/1 matched blocks differ');
  expect(output).not.toContain('Sentry <ornament>');
});
