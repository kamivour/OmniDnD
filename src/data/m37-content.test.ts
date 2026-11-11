import { describe, expect, it } from 'vitest';
import { registry } from './registry';

const IDS = [
  'barbarian.ancestral-guardian',
  'barbarian.storm-herald',
  'barbarian.zealot',
  'bard.glamour',
  'bard.swords',
  'bard.whispers',
  'cleric.forge',
  'cleric.grave',
  'fighter.arcane-archer',
  'fighter.samurai',
  'monk.drunken-master',
  'monk.kensei',
  'monk.sun-soul',
];

describe('M37 Xanathar’s subclasses, part 1', () => {
  it('registers 13 subclasses with resolving features', () => {
    for (const slug of IDS) {
      const sub = registry.get('subclass', `subclass.${slug}`);
      expect(sub.source).toBe('XGE');
      expect(sub.features.length).toBeGreaterThan(2);
      for (const ref of sub.features) {
        expect(registry.get('feature', ref.featureId).origin).toBe('subclass');
      }
    }
  });

  it('shared pools are linked', () => {
    expect(registry.get('feature', 'feature.monk.sun-soul-radiant-sun-bolt').usesFrom).toBe(
      'feature.monk.ki',
    );
    expect(registry.get('feature', 'feature.cleric.grave-path-to-the-grave').usesFrom).toBe(
      'feature.cleric.channel-divinity',
    );
    expect(registry.get('feature', 'feature.bard.swords-blade-flourish').usesFrom).toBe(
      'feature.bard.bardic-inspiration',
    );
  });
});
