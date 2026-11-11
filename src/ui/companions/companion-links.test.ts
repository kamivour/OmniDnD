import { describe, expect, it } from 'vitest';
import type { Companion } from '../../engine/schema';
import { companionLink, existingCompanion, linkByKey } from './companion-links';

describe('companion links', () => {
  it('knows features and spells that bring a creature into play', () => {
    expect(companionLink('feature.artificer.battle-smith-steel-defender')?.template).toBe(
      'Steel Defender',
    );
    expect(companionLink('spell.find-familiar')?.limitKey).toBe('familiar');
    expect(companionLink('spell.conjure-animals')?.key).toBe('summon');
    expect(companionLink('spell.fireball')).toBeUndefined();
  });

  it('finds the key a link carries', () => {
    expect(linkByKey('eldritch-cannon')?.template).toBe('Eldritch Cannon');
    expect(linkByKey('summon')?.template).toBeUndefined();
    expect(linkByKey('nope')).toBeUndefined();
    expect(linkByKey(null)).toBeUndefined();
  });

  it('matches an existing companion by limit key, never for picked summons', () => {
    const mine = { id: 'a', limit: { key: 'steel-defender', max: 1 } } as Companion;
    expect(existingCompanion(linkByKey('steel-defender')!, [mine])).toBe(mine);
    expect(existingCompanion(linkByKey('eldritch-cannon')!, [mine])).toBeUndefined();
    expect(existingCompanion(linkByKey('summon')!, [mine])).toBeUndefined();
  });
});
