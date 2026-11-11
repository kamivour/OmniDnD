import { describe, expect, it } from 'vitest';
import { registry } from './registry';

const spell = (slug: string) => registry.get('spell', `spell.${slug}`);

describe('M36 Xanathar’s spells', () => {
  it('adds cantrips with scaling damage', () => {
    expect(spell('frostbite').damage).toMatchObject({ dice: '1d6', type: 'cold' });
    expect(spell('thunderclap').level).toBe(0);
    expect(spell('word-of-radiance').classes).toEqual(['class.cleric']);
    expect(spell('magic-stone').attack).toBe('ranged');
  });

  it('adds leveled spells with upcast damage', () => {
    expect(spell('erupting-earth').damage).toMatchObject({
      dice: '3d12',
      upcastPerLevel: '1d12',
    });
    expect(spell('ceremony').casting).toEqual({ cost: 'hours', amount: 1 });
    expect(spell('skywrite').ritual).toBe(true);
    expect(spell('mind-spike').duration.concentration).toBe(true);
  });

  it('adds high-level spells', () => {
    expect(spell('psychic-scream').level).toBe(9);
    expect(spell('invulnerability').duration.concentration).toBe(true);
    expect(spell('vitriolic-sphere').damage).toMatchObject({ dice: '10d4', type: 'acid' });
    expect(spell('steel-wind-strike').attack).toBe('melee');
    expect(spell('create-homunculus').casting).toEqual({ cost: 'hours', amount: 1 });
    expect(spell('power-word-pain').source).toBe('XGE');
  });

  it('every Xanathar spell is tagged with its book', () => {
    for (const slug of ['gust', 'ice-knife', 'catnap', 'wall-of-water']) {
      expect(spell(slug).source).toBe('XGE');
    }
  });
});
