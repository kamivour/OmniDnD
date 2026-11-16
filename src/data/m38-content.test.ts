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

describe('Oathbreaker', () => {
  it('is a DMG paladin oath with spells, Channel Divinity and a capstone', () => {
    const oath = registry.get('subclass', 'subclass.paladin.oathbreaker');
    expect(oath.source).toBe('DMG');
    expect(oath.features.map((row) => row.level)).toEqual([3, 3, 3, 7, 15, 20]);
    for (const { featureId } of oath.features) expect(registry.entries.has(featureId)).toBe(true);
    expect(registry.get('feature', 'feature.paladin.oathbreaker-dreadful-aspect').usesFrom).toBe(
      'feature.paladin.channel-divinity',
    );
    expect(oath.grantedSpells?.find((row) => row.level === 17)?.spellIds).toEqual([
      'spell.contagion',
      'spell.dominate-person',
    ]);
    for (const row of oath.grantedSpells ?? [])
      for (const id of row.spellIds) expect(registry.entries.has(id)).toBe(true);
  });
});
