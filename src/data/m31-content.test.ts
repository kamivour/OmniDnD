import { describe, expect, it } from 'vitest';
import { registry } from './registry';

describe('M31 Tasha’s options', () => {
  it('Custom Lineage gives a free +2 and a feature', () => {
    const race = registry.get('race', 'race.custom-lineage');
    expect(race.abilityChoices).toMatchObject({ count: 1, value: 2 });
    expect(
      race.featureIds.every(
        (id) => registry.entries.has(`feature:${id}`) || !!registry.get('feature', id),
      ),
    ).toBe(true);
  });

  it('adds the seven feats', () => {
    for (const slug of [
      'artificer-initiate',
      'chef',
      'eldritch-adept',
      'fighting-initiate',
      'gunner',
      'metamagic-adept',
      'poisoner',
    ]) {
      const f = registry.get('feature', `feature.feat.${slug}`);
      expect(f.source).toBe('TCE');
      expect(f.fullText).toBeUndefined();
    }
  });

  it('new maneuvers draw on Combat Superiority', () => {
    const m = registry.get('feature', 'feature.fighter.maneuver-brace');
    expect(m.usesFrom).toBe('feature.fighter.battle-master-combat-superiority');
  });

  it('adds Pact of the Talisman and its invocations', () => {
    expect(registry.get('feature', 'feature.warlock.pact-of-the-talisman').uses).toBeDefined();
    expect(
      registry.get('feature', 'feature.warlock.eldritch-invocation-undying-servitude'),
    ).toBeDefined();
    expect(registry.get('feature', 'feature.sorcerer.metamagic-seeking-spell')).toBeDefined();
  });

  it('Primal Companion replaces Ranger’s Companion', () => {
    const f = registry.get('feature', 'feature.tce.ranger-primal-companion');
    expect(f.optional).toMatchObject({ classId: 'class.ranger', level: 3 });
  });
});
