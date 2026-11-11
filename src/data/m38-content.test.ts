import { describe, expect, it } from 'vitest';
import { registry } from './registry';

const IDS = [
  'paladin.conquest',
  'paladin.redemption',
  'ranger.horizon-walker',
  'ranger.monster-slayer',
  'rogue.inquisitive',
  'rogue.mastermind',
  'rogue.scout',
  'rogue.swashbuckler',
  'sorcerer.divine-soul',
  'sorcerer.shadow-magic',
  'sorcerer.storm-sorcery',
  'warlock.celestial',
  'warlock.hexblade',
];

describe('M38 Xanathar’s subclasses, part 2', () => {
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
    expect(registry.get('feature', 'feature.paladin.conquest-conquering-presence').usesFrom).toBe(
      'feature.paladin.channel-divinity',
    );
    expect(registry.get('feature', 'feature.sorcerer.shadow-magic-umbral-form').usesFrom).toBe(
      'feature.sorcerer.font-of-magic',
    );
    expect(registry.get('feature', 'feature.warlock.hexblade-hexblades-curse').uses?.recharge).toBe(
      'short',
    );
  });
});
