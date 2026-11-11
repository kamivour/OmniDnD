import { describe, expect, it } from 'vitest';
import { registry } from './registry';

const NEW = [
  'subclass.bard.valor',
  'subclass.cleric.knowledge',
  'subclass.cleric.light',
  'subclass.cleric.nature',
  'subclass.cleric.tempest',
  'subclass.cleric.trickery',
  'subclass.cleric.war',
  'subclass.druid.moon',
  'subclass.sorcerer.wild-magic',
  'subclass.warlock.archfey',
  'subclass.warlock.great-old-one',
  ...[
    'abjuration',
    'conjuration',
    'divination',
    'enchantment',
    'illusion',
    'necromancy',
    'transmutation',
  ].map((s) => `subclass.wizard.${s}`),
];

describe('M29 caster subclasses', () => {
  it('registers all 18 subclasses with resolvable features', () => {
    expect(NEW).toHaveLength(18);
    for (const id of NEW) {
      for (const f of registry.get('subclass', id).features) {
        expect(registry.get('feature', f.featureId).id).toBe(f.featureId);
      }
    }
  });

  it('subclass Channel Divinity features draw from the class pool', () => {
    const f = registry.get('feature', 'feature.cleric.knowledge-read-thoughts');
    expect(f.usesFrom).toBe('feature.cleric.channel-divinity');
  });
});
