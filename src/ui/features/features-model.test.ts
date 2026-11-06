import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import { computeSheet, type CharacterState } from '../../engine/calc/sheet';
import { featuresModel } from './features-model';

function state(): CharacterState {
  const character = structuredClone(seedFile);
  character.live.featureUsesSpent = {};
  return character;
}

function model(character: CharacterState) {
  return featuresModel(character, computeSheet(character, registry), registry);
}

function find(character: CharacterState, id: string) {
  return model(character)
    .flatMap(({ entries }) => entries)
    .find((entry) => entry.id === id);
}

describe('featuresModel', () => {
  it('groups features by origin in display order, each once', () => {
    const groups = model(state());
    const origins = groups.map(({ origin }) => origin);
    expect(origins.slice(0, 2)).toEqual(['race', 'class']);
    expect(origins).toContain('subclass');
    expect(origins).toContain('background');
    const ids = groups.flatMap(({ entries }) => entries.map(({ id }) => id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('labels where a feature comes from and its activation', () => {
    const inspiration = find(state(), 'feature.bard.bardic-inspiration');
    expect(inspiration).toMatchObject({
      from: 'Bard 1',
      kind: 'active',
      activation: 'Bonus action',
      usable: true,
      ownPool: { used: 0, recharge: 'Long rest' },
    });
    expect(inspiration?.die).toBe('d6');
    const words = find(state(), 'feature.bard.cutting-words');
    expect(words).toMatchObject({ kind: 'triggered', activation: 'Reaction', usable: true });
    expect(words?.ownPool).toBeUndefined();
    expect(words?.sharedPool?.name).toBe('Bardic Inspiration');
    expect(words?.from).toMatch(/ 3$/);
  });

  it('marks passive features that feed the sheet and offers no Use for them', () => {
    const jack = find(state(), 'feature.bard.jack-of-all-trades');
    expect(jack).toMatchObject({ kind: 'passive', automatic: true, usable: false });
    expect(jack?.unavailableReason).toBeUndefined();
  });

  it('reports spent pools and favorites from saved state', () => {
    const character = state();
    const max = find(character, 'feature.bard.bardic-inspiration')!.ownPool!.max;
    character.live.featureUsesSpent['feature.bard.bardic-inspiration'] = max;
    character.build.favorites = ['feature.bard.cutting-words'];
    const words = find(character, 'feature.bard.cutting-words');
    expect(words?.favorite).toBe(true);
    expect(words?.sharedPool?.remaining).toBe(0);
    expect(words?.unavailableReason).toBe('No Bardic Inspiration uses left');
  });
});
