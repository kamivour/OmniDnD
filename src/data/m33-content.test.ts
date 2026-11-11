import { describe, expect, it } from 'vitest';
import { registry } from './registry';

const IDS = [
  'barbarian.beast',
  'barbarian.wild-magic',
  'bard.creation',
  'bard.eloquence',
  'cleric.order',
  'cleric.peace',
  'druid.spores',
  'druid.stars',
  'druid.wildfire',
  'fighter.rune-knight',
  'monk.mercy',
  'monk.astral-self',
];

describe('M33 Tasha’s subclasses, part 1', () => {
  it('registers 12 subclasses with resolving features and guidance', () => {
    for (const slug of IDS) {
      const sub = registry.get('subclass', `subclass.${slug}`);
      expect(sub.source).toBe('TCE');
      expect(sub.features.length).toBeGreaterThan(2);
      for (const ref of sub.features) {
        expect(registry.get('feature', ref.featureId).origin).toBe('subclass');
      }
      expect(registry.entries.has(`subclass.${slug}`)).toBe(true);
    }
  });

  it('shared pools are linked', () => {
    expect(registry.get('feature', 'feature.monk.mercy-hand-of-healing').usesFrom).toBe(
      'feature.monk.ki',
    );
    expect(registry.get('feature', 'feature.cleric.peace-balm-of-peace').usesFrom).toBe(
      'feature.cleric.channel-divinity',
    );
    expect(registry.get('feature', 'feature.druid.stars-starry-form').usesFrom).toBe(
      'feature.druid.wild-shape',
    );
  });
});
