import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { computeSheet, type CharacterState } from '../calc/sheet';
import { spellSelectionDetails } from '../calc/spell-selections';
import { spellSlots } from '../calc/slots';
import { levelUp } from './level';
import { freshState, Session } from './test-utils';

function artificer(level: number, subclassId?: string): CharacterState {
  const state = structuredClone(freshState);
  state.campaign = { ...state.campaign, sources: ['PHB', 'TCE'], hpMethod: 'average' };
  state.build.classes = [
    { classId: 'class.artificer', level, ...(subclassId ? { subclassId } : {}) },
  ];
  state.build.hpEntries = Array.from({ length: level }, (_, index) => ({
    level: index + 1,
    classId: 'class.artificer',
    value: index === 0 ? 8 : 5,
    method: index === 0 ? ('max' as const) : ('average' as const),
    floor: 'none' as const,
  }));
  state.build.featureIds = [];
  state.build.abilityScores.bonuses = [];
  state.build.abilityScores.base = { STR: 10, DEX: 12, CON: 14, INT: 16, WIS: 10, CHA: 8 };
  return state;
}

describe('Artificer', () => {
  it('rounds half-caster slots up and casts from level 1', () => {
    expect(spellSlots([{ progression: 'artificer', level: 1 }]).max.slice(1, 3)).toEqual([2, 0]);
    expect(spellSlots([{ progression: 'artificer', level: 5 }]).max.slice(1, 4)).toEqual([4, 2, 0]);
    // Multiclass table also rounds up: Artificer 3 + Wizard 2 = caster level 4.
    expect(
      spellSlots([
        { progression: 'artificer', level: 3 },
        { progression: 'full', level: 2 },
      ]).max.slice(1, 3),
    ).toEqual([4, 3]);
  });

  it('prepares INT mod + half level, with the artificer spell list', () => {
    const state = artificer(5);
    const sheet = computeSheet(state, registry);
    const stats = sheet.spellcasting.find((entry) => entry.classId === 'class.artificer');
    expect(stats?.preparedLimit).toBe(5); // INT +3, half of 5 rounded down is 2
    expect(stats?.cantripsKnown).toBe(2);
    const details = spellSelectionDetails({ ...state, sheet, registry }, 'class.artificer');
    expect(details.mode).toBe('prepared');
    expect(details.candidates.prepared).toContain('spell.cure-wounds');
    expect(details.candidates.prepared).not.toContain('spell.fireball');
    expect(details.candidates.cantrips).toContain('spell.guidance');
  });

  it('grants class and subclass features by level', () => {
    const names = (state: CharacterState) =>
      computeSheet(state, registry).features.map(({ def }) => def.name);
    expect(names(artificer(2))).toEqual(
      expect.arrayContaining(['Magical Tinkering', 'Spellcasting', 'Infuse Item']),
    );
    expect(names(artificer(2))).not.toContain('Flash of Genius');
    const smith = names(artificer(9, 'subclass.artificer.battle-smith'));
    expect(smith).toEqual(
      expect.arrayContaining(['Flash of Genius', 'Steel Defender', 'Arcane Jolt', 'Extra Attack']),
    );
  });

  it('offers Artificer subclasses and infusions through the level-up choices', () => {
    const session = new Session(artificer(2));
    session.run(levelUp, {
      classId: 'class.artificer',
      choices: {
        subclassId: 'subclass.artificer.artillerist',
        features: ['feature.artificer.infusion-enhanced-weapon'],
      },
    });
    expect(session.state.build.classes[0]?.subclassId).toBe('subclass.artificer.artillerist');
    expect(session.state.build.featureIds).toContain('feature.artificer.infusion-enhanced-weapon');
  });
});
