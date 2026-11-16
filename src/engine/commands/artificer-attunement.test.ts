import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { computeSheet, type CharacterState } from '../calc/sheet';
import { setItemAttunement } from './items';
import { freshState, Session } from './test-utils';

const ITEMS = [
  'item.candle',
  'item.flute',
  'item.backpack',
  'item.dagger',
  'item.rope-hempen-50-feet',
];

function artificer(level: number, bonds = 0): CharacterState {
  const state: CharacterState = structuredClone(freshState);
  state.build.classes = [{ classId: 'class.artificer', level }];
  state.build.hpEntries = Array.from({ length: level }, (_, index) => ({
    level: index + 1,
    classId: 'class.artificer',
    value: index === 0 ? 8 : 5,
    method: index === 0 ? ('max' as const) : ('average' as const),
  }));
  state.build.spells = [];
  for (let index = 1; index <= bonds; index++) {
    const id = `bond-${index}`;
    state.build.items.push({ instanceId: id, itemId: ITEMS[index - 1]! });
    state.live.items = { ...state.live.items, [id]: { qty: 1, equipped: false, attuned: false } };
  }
  return state;
}

describe('Artificer attunement limit', () => {
  it('rises to 4, 5 and 6 at artificer levels 10, 14 and 18', () => {
    const limit = (level: number) => computeSheet(artificer(level), registry).attunementLimit;
    expect([9, 10, 13, 14, 17, 18, 20].map(limit)).toEqual([3, 4, 4, 5, 5, 6, 6]);
    expect(computeSheet(freshState, registry).attunementLimit).toBe(3);
  });

  it('allows a fourth bond at level 10 and blocks the fifth', () => {
    const session = new Session(artificer(10, 5));
    for (const instanceId of ['bond-1', 'bond-2', 'bond-3', 'bond-4'])
      session.run(setItemAttunement, { instanceId, attuned: true }, true);
    expect(
      session.preview(setItemAttunement, { instanceId: 'bond-5', attuned: true }).reasons,
    ).toEqual(['Already attuned to 4 items; end a recorded bond first']);
  });
});
