import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { computeSheet, type CharacterState } from '../calc/sheet';
import { freshState } from './test-utils';

const GWM = 'feature.feat.great-weapon-master';
const SHARPSHOOTER = 'feature.feat.sharpshooter';

function character(feat: string, classId?: string): CharacterState {
  const state = structuredClone(freshState);
  state.build.featureIds = [...state.build.featureIds, feat];
  if (classId) {
    state.build.classes = [{ classId, level: 1 }];
    state.build.hpEntries = [{ level: 1, classId, value: 10, method: 'max' }];
    // Proficiencies are stored on the build when the class is picked.
    state.build.proficiencies.weapons.push('martial');
  }
  for (const [instanceId, itemId] of [
    ['greatsword-1', 'item.greatsword'],
    ['longsword-1', 'item.longsword'],
    ['shortbow-1', 'item.shortbow'],
    ['heavy-crossbow-1', 'item.crossbow-heavy'],
  ] as const) {
    state.build.items.push({ instanceId, itemId });
    state.live.items[instanceId] = { qty: 1, equipped: true, attuned: false };
  }
  return state;
}

const attack = (state: CharacterState, id: string) =>
  computeSheet(state, registry).attacks.find((entry) => entry.instanceId === id)!;

describe('power attack option', () => {
  it('Great Weapon Master: proficient heavy melee weapons only', () => {
    const fighter = character(GWM, 'class.fighter');
    const sword = attack(fighter, 'greatsword-1');
    expect(sword.powerAttack).toEqual({
      source: 'Great Weapon Master',
      toHit: sword.toHit.value - 5,
      damageBonus: sword.damage!.bonus + 10,
    });
    expect(attack(fighter, 'longsword-1').powerAttack).toBeUndefined();
    expect(attack(fighter, 'heavy-crossbow-1').powerAttack).toBeUndefined();
    // A bard is not proficient with a greatsword.
    expect(attack(character(GWM), 'greatsword-1').powerAttack).toBeUndefined();
  });

  it('Sharpshooter: proficient ranged weapons only', () => {
    const bard = character(SHARPSHOOTER);
    const bow = attack(bard, 'shortbow-1');
    expect(bow.powerAttack).toMatchObject({ source: 'Sharpshooter', toHit: bow.toHit.value - 5 });
    expect(attack(bard, 'longsword-1').powerAttack).toBeUndefined();
    expect(attack(bard, 'heavy-crossbow-1').powerAttack).toBeUndefined();
    expect(
      attack(character(SHARPSHOOTER, 'class.fighter'), 'heavy-crossbow-1').powerAttack,
    ).toBeDefined();
    expect(attack(freshState, 'rapier-1').powerAttack).toBeUndefined();
  });
});
