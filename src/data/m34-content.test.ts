import { describe, expect, it } from 'vitest';
import { registry } from './registry';

const IDS = [
  'paladin.glory',
  'paladin.watchers',
  'ranger.fey-wanderer',
  'ranger.swarmkeeper',
  'rogue.phantom',
  'rogue.soulknife',
  'sorcerer.aberrant-mind',
  'sorcerer.clockwork-soul',
  'warlock.fathomless',
  'warlock.genie',
  'wizard.order-of-scribes',
];

describe('M34 Tasha’s subclasses, part 2', () => {
  it('registers 11 subclasses with resolving features', () => {
    for (const slug of IDS) {
      const sub = registry.get('subclass', `subclass.${slug}`);
      expect(sub.source).toBe('TCE');
      expect(sub.features.length).toBeGreaterThan(2);
      for (const ref of sub.features) {
        expect(registry.get('feature', ref.featureId).origin).toBe('subclass');
      }
    }
  });

  it('shared pools are linked', () => {
    expect(registry.get('feature', 'feature.paladin.glory-peerless-athlete').usesFrom).toBe(
      'feature.paladin.channel-divinity',
    );
    expect(registry.get('feature', 'feature.sorcerer.clockwork-soul-bastion-of-law').usesFrom).toBe(
      'feature.sorcerer.font-of-magic',
    );
  });
});
