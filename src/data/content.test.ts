import { describe, expect, it } from 'vitest';
import seed from '../../data/characters/the-fool.json';
import { AnyRefIdSchema, ExportFileSchema, RefPackSchema } from '../engine/schema';
import { contentPacks, registry } from './registry';

const fool = ExportFileSchema.parse(seed);

/** Every reference id in a value, keys included. */
function referencedIds(value: unknown): string[] {
  if (typeof value === 'string') return AnyRefIdSchema.safeParse(value).success ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(referencedIds);
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => [
      ...referencedIds(key),
      ...referencedIds(item),
    ]);
  }
  return [];
}

/** The Fool's features through level 4, so the level-up test finds its entries too. */
function foolFeatureIds(maxLevel = 4): string[] {
  const race = registry.get('race', fool.build.raceId);
  const background = registry.get('background', fool.build.backgroundId);
  return [
    ...race.featureIds,
    ...background.featureIds,
    ...fool.build.classes
      .flatMap(({ classId, subclassId }) => [
        ...registry.get('class', classId).features,
        ...(subclassId ? registry.get('subclass', subclassId).features : []),
      ])
      .filter((row) => row.level <= maxLevel)
      .map((row) => row.featureId),
  ];
}

const foolSpellIds = fool.build.spells.flatMap((list) => list.known);

describe('data/content', () => {
  it('holds only non-SRD entries, with summaries and no book text', () => {
    const entries = Object.values(contentPacks).flatMap((pack) => RefPackSchema.parse(pack));
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry, entry.id).toMatchObject({ srd: false, ruleset: '5e-2014' });
      expect(entry.fullText, entry.id).toBeUndefined();
      expect(entry.summary, entry.id).toBeDefined();
    }
  });
});

describe('registry', () => {
  it('resolves every id The Fool seed references', () => {
    expect(referencedIds(seed).filter((id) => !registry.entries.has(id))).toEqual([]);
  });

  it('has a summary for each of The Fool’s spells and features', () => {
    const missing = [...foolSpellIds, ...foolFeatureIds()].filter(
      (id) => registry.entries.get(id)?.summary === undefined,
    );
    expect(missing).toEqual([]);
  });

  it('sets the activation of each of The Fool’s features', () => {
    const activation = Object.fromEntries(
      foolFeatureIds().map((id) => [id, registry.get('feature', id).activation]),
    );
    expect(activation).toEqual({
      'feature.darkvision': 'passive',
      'feature.fey-ancestry': 'passive',
      'feature.skill-versatility': 'passive',
      'feature.false-identity': 'passive',
      'feature.bard.spellcasting': 'passive',
      'feature.bard.bardic-inspiration': 'bonus',
      'feature.bard.jack-of-all-trades': 'passive',
      'feature.bard.song-of-rest': 'special',
      'feature.bard.expertise': 'passive',
      'feature.bard.college': 'passive',
      'feature.bard.ability-score-improvement': 'passive',
      'feature.bard.bonus-proficiencies': 'passive',
      'feature.bard.cutting-words': 'reaction',
    });
  });

  it('carries the mechanics TEST_CHARACTER §4 needs', () => {
    expect(registry.get('feature', 'feature.bard.bardic-inspiration')).toMatchObject({
      uses: { max: { abilityMod: 'CHA', min: 1 }, recharge: { 1: 'long', 5: 'short' } },
      die: { 1: 'd6', 5: 'd8', 10: 'd10', 15: 'd12' },
    });
    expect(registry.get('feature', 'feature.bard.cutting-words')).toMatchObject({
      usesFrom: 'feature.bard.bardic-inspiration',
    });
    expect(registry.get('feature', 'feature.bard.cutting-words').trigger).toBeDefined();
    expect(registry.get('feature', 'feature.bard.jack-of-all-trades').modifiers).toEqual([
      { target: 'unproficient-checks', value: { proficiency: 'half' } },
    ]);
    expect(registry.get('feature', 'feature.bard.song-of-rest').die).toMatchObject({ 2: 'd6' });
  });

  it('tags The Fool’s spells by type, main type first (D39)', () => {
    const tags = Object.fromEntries(foolSpellIds.map((id) => [id, registry.get('spell', id).tags]));
    expect(tags).toEqual({
      'spell.vicious-mockery': ['damage', 'debuff'],
      'spell.minor-illusion': ['utility'],
      'spell.healing-word': ['healing'],
      'spell.dissonant-whispers': ['damage', 'control'],
      'spell.faerie-fire': ['debuff', 'utility'],
      'spell.disguise-self': ['utility'],
      'spell.suggestion': ['control'],
      'spell.invisibility': ['buff', 'utility'],
    });
  });

  it('has the Dissonant Whispers roll and the effects spells create', () => {
    expect(registry.get('spell', 'spell.dissonant-whispers')).toMatchObject({
      save: 'WIS',
      damage: { dice: '3d6', upcastPerLevel: '1d6', type: 'psychic' },
    });
    expect(registry.get('spell', 'spell.invisibility').effect).toMatchObject({
      target: 'any',
      conditions: ['invisible'],
    });
    expect(registry.get('spell', 'spell.disguise-self').effect?.target).toBe('self');
    expect(registry.get('spell', 'spell.faerie-fire').effect?.target).toBe('any');
  });

  it('keeps SRD text under our own-words summary', () => {
    const mockery = registry.get('spell', 'spell.vicious-mockery');
    expect(mockery.srd).toBe(true);
    expect(mockery.fullText).toBeDefined();
    expect(mockery.summaryReviewed).toBe(false);
  });
});
