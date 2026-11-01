import { describe, expect, it } from 'vitest';
import { buildRegistry } from './registry';
import { MechanicsOverlaySchema, type RefEntry } from './schema';

/** Placeholder text only: the repo is public. */
const trait = (): RefEntry => ({
  kind: 'feature',
  id: 'feature.test-trait',
  name: 'Test trait',
  ruleset: '5e-2014',
  source: 'PHB',
  srd: true,
  fullText: 'Placeholder text.',
  origin: 'race',
  activation: 'special',
});

const blinded = (): RefEntry => ({
  kind: 'condition',
  id: 'condition.blinded',
  name: 'Blinded',
  ruleset: '5e-2014',
  source: 'PHB',
  srd: true,
});

describe('buildRegistry', () => {
  it('merges summary and mechanics overlays into the entry', () => {
    const registry = buildRegistry(
      [[trait()], [blinded()]],
      [{ id: 'feature.test-trait', summary: { effect: 'Placeholder summary.' } }],
      [{ id: 'feature.test-trait', activation: 'bonus', uses: { max: 2, recharge: 'long' } }],
    );
    expect(registry.get('feature', 'feature.test-trait')).toMatchObject({
      name: 'Test trait',
      fullText: 'Placeholder text.',
      summary: { effect: 'Placeholder summary.' },
      activation: 'bonus',
      uses: { max: 2, recharge: 'long' },
    });
    expect(registry.entries.size).toBe(2);
  });

  it('rejects an id in two packs and overlays for unknown or repeated ids', () => {
    expect(() => buildRegistry([[trait()], [trait()]], [], [])).toThrow(
      'feature.test-trait is in more than one pack',
    );
    expect(() => buildRegistry([[trait()]], [], [{ id: 'feature.other' }])).toThrow(
      'mechanics overlay for unknown id feature.other',
    );
    const twice = { id: 'feature.test-trait', activation: 'passive' };
    expect(() => buildRegistry([[trait()]], [], [twice, twice])).toThrow(
      'Two mechanics overlays for feature.test-trait',
    );
  });

  it('checks the merged entry, so bad values and misspelled fields fail', () => {
    expect(() =>
      buildRegistry([[trait()]], [], [{ id: 'feature.test-trait', activation: 'sometimes' }]),
    ).toThrow('feature.test-trait after mechanics overlay');
    expect(() =>
      buildRegistry([[trait()]], [], [{ id: 'feature.test-trait', usesFor: 'feature.x' }]),
    ).toThrow(/usesFor/);
  });

  it('keeps text out of mechanics overlays', () => {
    expect(
      MechanicsOverlaySchema.safeParse({ id: 'feature.test-trait', summary: { effect: 'x' } })
        .success,
    ).toBe(false);
    expect(
      MechanicsOverlaySchema.safeParse({ id: 'feature.test-trait', name: 'Renamed' }).success,
    ).toBe(false);
  });

  it('get throws on a missing id or the wrong kind', () => {
    const registry = buildRegistry([[trait(), blinded()]], [], []);
    expect(registry.get('condition', 'condition.blinded').name).toBe('Blinded');
    expect(() => registry.get('spell', 'spell.missing')).toThrow('Unknown spell spell.missing');
    expect(() => registry.get('spell', 'condition.blinded')).toThrow(
      'condition.blinded is a condition, not a spell',
    );
  });
});
