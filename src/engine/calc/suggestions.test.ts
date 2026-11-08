import { describe, expect, it } from 'vitest';
import type { Guidance } from '../schema/guidance';
import { pointBuyCost } from './ability-methods';
import {
  skillSuggestions,
  spellSuggestions,
  suggestAbilityBases,
  synergyNotes,
} from './suggestions';

const entry = (id: string, extra: Partial<Guidance> = {}): Guidance => ({
  id,
  kind: 'class',
  pitch: 'x',
  strengths: ['a'],
  weaknesses: ['b'],
  ...extra,
});

describe('suggestAbilityBases', () => {
  it('puts the best scores in the main abilities and uses each value once', () => {
    const bases = suggestAbilityBases(['INT', 'CON', 'DEX']);
    expect(bases).toEqual({ INT: 15, CON: 14, DEX: 13, WIS: 12, CHA: 10, STR: 8 });
  });

  it('fills unnamed abilities in a fixed order', () => {
    expect(suggestAbilityBases(['STR'])).toEqual({
      STR: 15,
      CON: 14,
      DEX: 13,
      WIS: 12,
      CHA: 10,
      INT: 8,
    });
  });

  it('always costs exactly 27 points, so it fits point buy', () => {
    expect(pointBuyCost(suggestAbilityBases(['CHA', 'DEX']))).toBe(27);
  });
});

describe('skillSuggestions', () => {
  it('tags class picks first, then skills on a main ability', () => {
    const tags = skillSuggestions(['stealth', 'athletics', 'arcana', 'history'], {
      skills: ['stealth'],
      mainAbilities: ['STR'],
    });
    expect(tags).toEqual({
      stealth: 'Often taken by this class',
      athletics: 'Uses STR, a main ability',
    });
  });

  it('returns nothing without guidance', () => {
    expect(skillSuggestions(['stealth'], undefined)).toEqual({});
  });
});

describe('spellSuggestions', () => {
  it('keeps only spells on the offered list', () => {
    const result = spellSuggestions(
      {
        starterSpells: [
          { id: 'spell.a', why: 'A' },
          { id: 'spell.b', why: 'B' },
        ],
      },
      ['spell.b', 'spell.c'],
    );
    expect(result).toEqual({ 'spell.b': 'B' });
  });
});

describe('synergyNotes', () => {
  it('lists a pairing once even when both sides mention it', () => {
    const race = entry('race.x', { kind: 'race', goodWith: [{ id: 'class.y', why: 'fits' }] });
    const cls = entry('class.y', { goodWith: [{ id: 'race.x', why: 'fits too' }] });
    expect(synergyNotes([race, cls], ['race.x', 'class.y'])).toEqual([
      { from: 'race.x', with: 'class.y', why: 'fits' },
    ]);
  });

  it('skips pairings with entries that are not chosen', () => {
    const race = entry('race.x', { goodWith: [{ id: 'class.z', why: 'no' }] });
    expect(synergyNotes([race], ['race.x'])).toEqual([]);
  });
});
