import { describe, expect, it } from 'vitest';
import type { CharacterState } from '../calc/sheet';
import { completeLongRest } from './rest';
import { convertSlotToPoints, createSlot, FONT_OF_MAGIC } from './sorcery';
import { freshState, Session } from './test-utils';

function sorcerer(level: number): CharacterState {
  const state = structuredClone(freshState);
  state.build.classes = [{ classId: 'class.sorcerer', level }];
  state.build.hpEntries = Array.from({ length: level }, (_, index) => ({
    level: index + 1,
    classId: 'class.sorcerer',
    value: index === 0 ? 6 : 4,
    method: index === 0 ? ('max' as const) : ('average' as const),
  }));
  return state;
}

describe('Flexible Casting', () => {
  it('turns a slot into sorcery points, capped at the max', () => {
    const session = new Session(sorcerer(5));
    session.state.live.featureUsesSpent[FONT_OF_MAGIC] = 3;
    expect(session.run(convertSlotToPoints, { slotLevel: 2 })).toBe(
      'Flexible Casting: L2 slot → 2 sorcery points (4/5 left)',
    );
    expect(session.state.live.slotsUsed[2]).toBe(1);
    expect(session.preview(convertSlotToPoints, { slotLevel: 3 }).reasons).toEqual([
      'Sorcery points cap at 5; 2 would be lost',
    ]);
    session.undo();
    expect(session.state.live.featureUsesSpent[FONT_OF_MAGIC]).toBe(3);
    expect(session.state.live.slotsUsed[2]).toBe(0);
  });

  it('creates a slot that counts until a long rest', () => {
    const session = new Session(sorcerer(5));
    expect(session.sheet.slots.max[1]).toBe(4);
    expect(session.run(createSlot, { slotLevel: 1 })).toBe(
      'Flexible Casting: 2 sorcery points → L1 slot (3/5 points left; fades on a long rest)',
    );
    expect(session.sheet.slots.max[1]).toBe(5);
    expect(session.sheet.slots.created?.[1]).toBe(1);
    expect(session.preview(createSlot, { slotLevel: 3 }).reasons).toEqual([
      'Needs 5 sorcery points; 3 left',
    ]);
    session.run(completeLongRest, null);
    expect(session.state.live.createdSlots).toBeUndefined();
    expect(session.sheet.slots.max[1]).toBe(4);
    expect(session.state.live.featureUsesSpent[FONT_OF_MAGIC] ?? 0).toBe(0);
  });

  it('blocks without the feature, above level 5, or with no slot left', () => {
    expect(new Session().preview(createSlot, { slotLevel: 1 }).result).toBe('blocked');
    const session = new Session(sorcerer(20));
    expect(session.preview(createSlot, { slotLevel: 6 }).reasons).toEqual([
      'Created slots are level 1 to 5',
    ]);
    session.state.live.slotsUsed[9] = 1;
    expect(session.preview(convertSlotToPoints, { slotLevel: 9 }).reasons).toEqual([
      'No level 9 slots left',
    ]);
    // Sorcerer 1 has no Font of Magic yet.
    expect(new Session(sorcerer(1)).preview(convertSlotToPoints, { slotLevel: 1 }).result).toBe(
      'blocked',
    );
  });
});
