import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import type { CharacterState } from '../calc/sheet';
import { toggleCondition } from './effects';
import { freshState, Session } from './test-utils';

function paladin(level: number): CharacterState {
  const state = structuredClone(freshState);
  state.build.classes = [{ classId: 'class.paladin', level }];
  state.build.hpEntries = Array.from({ length: level }, (_, index) => ({
    level: index + 1,
    classId: 'class.paladin',
    value: index === 0 ? 10 : 6,
    method: index === 0 ? ('max' as const) : ('average' as const),
  }));
  state.build.spells = [];
  return state;
}

describe('passive feature notes', () => {
  it('Aura of Courage warns before you mark yourself frightened while conscious', () => {
    const session = new Session(paladin(10));
    expect(session.preview(toggleCondition, { condition: 'frightened' }).reasons).toEqual([
      'Aura of Courage makes you immune to frightened',
    ]);
    expect(
      new Session(paladin(9)).preview(toggleCondition, { condition: 'frightened' }).reasons,
    ).toEqual([]);
    const down = paladin(10);
    down.live.conditions = ['unconscious'];
    expect(new Session(down).preview(toggleCondition, { condition: 'frightened' }).reasons).toEqual(
      [],
    );
  });

  it('save, initiative and check reminders are recorded on the features', () => {
    const on = (id: string) => registry.get('feature', id).rollNotes?.map((note) => note.on);
    expect(on('feature.barbarian.danger-sense')).toEqual(['DEX']);
    expect(on('feature.rogue.evasion')).toEqual(['DEX']);
    expect(on('feature.monk.evasion')).toEqual(['DEX']);
    expect(on('feature.barbarian.feral-instinct')).toEqual(['initiative']);
    expect(on('feature.rogue.reliable-talent')).toEqual(['checks']);
  });
});
