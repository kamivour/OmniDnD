import { describe, expect, it } from 'vitest';
import { compareGold, formatReport, similarity, type GoldCreature } from './gold.ts';
import type { NamedCreature } from './identify.ts';

function parsed(extra: Partial<NamedCreature>): NamedCreature {
  return {
    page: 10,
    speed: {},
    abilities: {},
    saves: {},
    skills: {},
    vulnerabilities: [],
    resistances: [],
    immunities: [],
    conditionImmunities: [],
    senses: {},
    traits: [],
    actions: [],
    bonusActions: [],
    reactions: [],
    legendaryActions: [],
    mythicActions: [],
    lairActions: [],
    intros: {},
    issues: [],
    ...extra,
  };
}

describe('similarity', () => {
  it('scores words matched in order against the longer text', () => {
    expect(similarity('The toad hops away.', 'the toad hops away')).toBe(1);
    expect(similarity('a b c d', 'a b x d')).toBe(0.75);
    expect(similarity('a b', 'a b c d')).toBe(0.5);
    expect(similarity('', '')).toBe(1);
  });
});

describe('compareGold', () => {
  const bite =
    'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) piercing damage.';
  const toad = parsed({
    name: 'Mire Toad',
    acNote: 'natural armor, shield',
    hp: 10,
    speed: { walk: 20, swim: 40 },
    languages: "understands Common but can't speak them",
    actions: [
      {
        name: 'Bite',
        text: bite,
        usage: 'Recharge 5–6',
        damage: [{ dice: '1d6+2', type: 'piercing' }],
      },
    ],
  });
  const gold: GoldCreature[] = [
    {
      name: 'Mire Toad',
      ac: 13,
      acNote: 'natural armor; 15 with shield',
      hp: 9,
      speed: { walk: 20, swim: 40 },
      languages: "understands Common but can't speak",
      actions: [
        {
          name: 'Bite',
          text: bite,
          usage: 'Recharge 5–6',
          attackBonus: 4,
          damage: [{ dice: '1d6+2', type: 'piercing' }],
        },
      ],
    },
    { name: 'Werebear, Bear Form' },
    { name: 'Bog Hound' },
  ];
  const report = compareGold([toad], gold);

  it('counts compared, skipped per-form and missing creatures', () => {
    expect(report).toMatchObject({ compared: 1, skipped: 1, notFound: ['Bog Hound'] });
  });

  it('forgives armor note wording and the SRD dropping "them"', () => {
    expect(report.fields.acNote).toMatchObject({ right: 1, wrong: 0 });
    expect(report.fields.languages).toMatchObject({ right: 1, wrong: 0 });
    expect(report.fields.speed).toMatchObject({ right: 1, wrong: 0 });
  });

  it('keeps a value read wrong apart from one OCR lost', () => {
    expect(report.fields.hp).toMatchObject({
      right: 0,
      wrong: 1,
      examples: ['Mire Toad: 10 vs 9'],
    });
    expect(report.fields.ac).toMatchObject({ right: 0, wrong: 0, lost: 1 });
    expect(report.fields.attackBonus).toMatchObject({ lost: 1 });
  });

  it('compares entry names, text, usage and damage', () => {
    expect(report.fields['actions names']).toMatchObject({ right: 1 });
    expect(report.fields['entry text']).toMatchObject({ right: 1, wrong: 0 });
    expect(report.fields.usage).toMatchObject({ right: 1 });
    expect(report.fields.damage).toMatchObject({ right: 1 });
  });

  it('prints a short report', () => {
    const text = formatReport(report);
    expect(text).toContain('compared 1, not found 1, per-form entries skipped 1');
    expect(text).toContain('Mire Toad: 10 vs 9');
    expect(text).toContain('not found: Bog Hound');
  });
});
