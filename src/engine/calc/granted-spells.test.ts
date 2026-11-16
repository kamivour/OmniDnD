import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { castSpell } from '../commands/spells';
import { freshState, Session } from '../commands/test-utils';
import { grantedSpells, spellListsWithGrants } from './granted-spells';
import { computeSheet, type CharacterState } from './sheet';
import { spellSelectionDetails } from './spell-selections';

function character(
  classId: string,
  level: number,
  subclassId?: string,
  spells: CharacterState['build']['spells'] = [],
): CharacterState {
  const die = Number(registry.get('class', classId).hitDie.slice(1));
  return {
    ...freshState,
    build: {
      ...freshState.build,
      classes: [{ classId, level, ...(subclassId ? { subclassId } : {}) }],
      hpEntries: Array.from({ length: level }, (_, index) => ({
        level: index + 1,
        classId,
        value: index === 0 ? die : die / 2 + 1,
        method: index === 0 ? ('max' as const) : ('average' as const),
      })),
      spells,
    },
  };
}

const ids = (state: CharacterState) =>
  grantedSpells(registry, state.build).map((entry) => entry.spellId);

describe('grantedSpells', () => {
  it('gives a Light cleric the domain spells for each level reached, plus the Light cantrip', () => {
    expect(ids(character('class.cleric', 1, 'subclass.cleric.light'))).toEqual([
      'spell.light',
      'spell.burning-hands',
      'spell.faerie-fire',
    ]);
    const fifth = ids(character('class.cleric', 5, 'subclass.cleric.light'));
    expect(fifth).toEqual(
      expect.arrayContaining([
        'spell.flaming-sphere',
        'spell.scorching-ray',
        'spell.daylight',
        'spell.fireball',
      ]),
    );
    expect(fifth).not.toContain('spell.wall-of-fire');
    expect(
      grantedSpells(registry, character('class.cleric', 1, 'subclass.cleric.light').build)[0],
    ).toMatchObject({ classId: 'class.cleric', from: 'Light Domain' });
  });

  it('gives nothing before a subclass is chosen', () => {
    expect(ids(character('class.cleric', 5))).toEqual([]);
  });

  it('adds grants as prepared for prepared casters and as known for known casters', () => {
    const cleric = spellListsWithGrants(
      registry,
      character('class.cleric', 1, 'subclass.cleric.light', [
        { classId: 'class.cleric', known: ['spell.sacred-flame'], prepared: ['spell.bless'] },
      ]).build,
    );
    expect(cleric).toEqual([
      {
        classId: 'class.cleric',
        known: ['spell.sacred-flame', 'spell.light'],
        prepared: ['spell.bless', 'spell.burning-hands', 'spell.faerie-fire'],
      },
    ]);
    const ranger = spellListsWithGrants(
      registry,
      character('class.ranger', 3, 'subclass.ranger.gloom-stalker').build,
    );
    expect(ranger).toEqual([{ classId: 'class.ranger', known: ['spell.disguise-self'] }]);
  });
});

describe('granted spells and limits', () => {
  it('never count toward the prepared limit and are not offered as picks', () => {
    const state = character('class.cleric', 1, 'subclass.cleric.light', [
      {
        classId: 'class.cleric',
        known: [],
        prepared: ['spell.bless', 'spell.burning-hands'],
      },
    ]);
    const details = spellSelectionDetails(
      { ...state, registry, sheet: computeSheet(state, registry) },
      'class.cleric',
    );
    expect(details.prepared.count).toBe(1);
    expect(details.granted.map((entry) => entry.id)).toContain('spell.faerie-fire');
    expect(details.candidates.prepared).not.toContain('spell.faerie-fire');
    expect(details.candidates.prepared).toContain('spell.cure-wounds');
  });

  it('are castable without a "not prepared" warning', () => {
    const session = new Session(character('class.cleric', 1, 'subclass.cleric.light'));
    expect(
      session.preview(castSpell, {
        spellId: 'spell.burning-hands',
        classId: 'class.cleric',
        slotLevel: 1,
      }),
    ).toEqual({ result: 'ok', reasons: [] });
  });
});
