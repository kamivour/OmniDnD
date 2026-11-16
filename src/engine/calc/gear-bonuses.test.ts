import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { freshState } from '../commands/test-utils';
import { computeSheet, type CharacterState } from './sheet';

function withGear(
  state: CharacterState,
  gear: { itemId: string; equipped?: boolean; attuned?: boolean }[],
): CharacterState {
  state.build.items = gear.map(({ itemId }, index) => ({ instanceId: `g-${index}`, itemId }));
  state.live.items = Object.fromEntries(
    gear.map(({ equipped = false, attuned = false }, index) => [
      `g-${index}`,
      { qty: 1, equipped, attuned },
    ]),
  );
  return state;
}

function dualWielder(gear: Parameters<typeof withGear>[1]) {
  const state = structuredClone(freshState);
  state.build.featureIds = [...state.build.featureIds, 'feature.feat.dual-wielder'];
  return withGear(state, gear);
}

function artificer(level: number, attuned: number): CharacterState {
  const state = structuredClone(freshState);
  state.build.classes = [{ classId: 'class.artificer', level }];
  state.build.hpEntries = Array.from({ length: level }, (_, index) => ({
    level: index + 1,
    classId: 'class.artificer',
    value: index === 0 ? 8 : 5,
    method: index === 0 ? ('max' as const) : ('average' as const),
  }));
  state.build.spells = [];
  const items = ['item.dagger', 'item.candle', 'item.flute', 'item.backpack'];
  return withGear(
    state,
    items.map((itemId, index) => ({ itemId, attuned: index < attuned })),
  );
}

describe('gear-based feature bonuses', () => {
  it('Dual Wielder adds +1 AC only with two melee weapons and no shield', () => {
    const ac = (gear: Parameters<typeof withGear>[1]) =>
      computeSheet(dualWielder(gear), registry).ac;
    const one = ac([{ itemId: 'item.shortsword', equipped: true }]).value;
    const two = ac([
      { itemId: 'item.shortsword', equipped: true },
      { itemId: 'item.scimitar', equipped: true },
    ]);
    expect(two.value).toBe(one + 1);
    expect(two.parts).toContainEqual({ label: 'Dual Wielder', value: 1 });
    const shielded = ac([
      { itemId: 'item.shortsword', equipped: true },
      { itemId: 'item.scimitar', equipped: true },
      { itemId: 'item.shield', equipped: true },
    ]);
    expect(shielded.parts.map((part) => part.label)).not.toContain('Dual Wielder');
    const carried = ac([
      { itemId: 'item.shortsword', equipped: true },
      { itemId: 'item.scimitar' },
    ]);
    expect(carried.value).toBe(one);
  });

  it('Soul of Artifice adds +1 to every save per attuned item at artificer 20', () => {
    const save = (level: number, attuned: number) =>
      computeSheet(artificer(level, attuned), registry).saves.WIS.value;
    expect(save(20, 3)).toBe(save(20, 0) + 3);
    expect(save(20, 1)).toBe(save(20, 0) + 1);
    expect(save(19, 3)).toBe(save(19, 0));
    expect(computeSheet(artificer(20, 2), registry).saves.STR.parts).toContainEqual({
      label: 'Soul of Artifice',
      value: 2,
    });
  });
});
