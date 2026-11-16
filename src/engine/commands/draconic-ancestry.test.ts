import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { pendingChoices } from '../calc/pending-choices';
import { computeSheet, type CharacterState } from '../calc/sheet';
import { featureUseDetails, useFeature } from './features';
import { resolveChoices } from './resolve-choices';
import { spellCastDetails } from './spell-options';
import { freshState, Session } from './test-utils';

const BREATH = 'feature.breath-weapon';

function character(raceId: string, classId: string, level: number, subclassId?: string) {
  const state: CharacterState = structuredClone(freshState);
  state.build.raceId = raceId;
  delete state.build.subraceId;
  state.build.classes = [{ classId, level, ...(subclassId ? { subclassId } : {}) }];
  state.build.hpEntries = Array.from({ length: level }, (_, index) => ({
    level: index + 1,
    classId,
    value: index === 0 ? 8 : 5,
    method: index === 0 ? ('max' as const) : ('average' as const),
  }));
  state.build.spells = [{ classId, known: ['spell.fire-bolt', 'spell.ray-of-frost'] }];
  return state;
}

const open = (state: CharacterState, prefix: string) =>
  pendingChoices(state, registry).find((row) => row.prefix === prefix);

describe('Dragonborn draconic ancestry', () => {
  it('asks for an ancestry, then sets resistance and the breath weapon', () => {
    const session = new Session(character('race.dragonborn', 'class.bard', 1));
    const pick = open(session.state, 'feature.draconic-ancestry-');
    expect(pick?.count).toBe(1);
    expect(pick?.optionIds).toHaveLength(10);
    expect(session.sheet.breathWeapon).toBeUndefined();

    session.run(resolveChoices, {
      classId: 'class.bard',
      choices: { features: ['feature.draconic-ancestry-green'] },
    });
    expect(open(session.state, 'feature.draconic-ancestry-')).toBeUndefined();
    const sheet = session.sheet;
    expect(sheet.features.flatMap(({ def }) => def.defenses?.resistances ?? [])).toContain(
      'poison',
    );
    const con = sheet.abilities.CON.mod;
    expect(sheet.breathWeapon).toEqual({
      featureId: BREATH,
      dc: 8 + con + 2,
      save: 'CON',
      area: '15 ft cone',
      type: 'poison',
      dice: '2d6',
    });
  });

  it('blocks a second ancestry and a pick from another race', () => {
    const session = new Session(character('race.dragonborn', 'class.bard', 1));
    expect(
      session.preview(resolveChoices, {
        classId: 'class.bard',
        choices: { features: ['feature.draconic-ancestry-red', 'feature.draconic-ancestry-blue'] },
      }).reasons,
    ).toEqual(['Only 1 Draconic Ancestry picks are open']);
    const human = new Session(character('race.human', 'class.bard', 1));
    expect(
      human.preview(resolveChoices, {
        classId: 'class.bard',
        choices: { features: ['feature.draconic-ancestry-red'] },
      }).reasons,
    ).toEqual(['That feature is not a pick for this class']);
  });

  it('scales breath damage by character level and recharges on a short rest', () => {
    const state = character('race.dragonborn', 'class.bard', 11);
    state.build.featureIds.push('feature.draconic-ancestry-blue');
    const sheet = computeSheet(state, registry);
    expect(sheet.breathWeapon).toMatchObject({ dice: '4d6', area: '5 by 30 ft line', save: 'DEX' });
    const session = new Session(state);
    session.run(useFeature, { featureId: BREATH });
    expect(featureUseDetails(session, BREATH).unavailableReason).toBe('No Breath Weapon uses left');
    expect(featureUseDetails(session, BREATH).uses?.recharge).toBe('short');
  });
});

describe('Draconic Sorcerer ancestry', () => {
  const sorcerer = (level: number) =>
    character('race.human', 'class.sorcerer', level, 'subclass.sorcerer.draconic');

  it('asks for a Dragon Ancestor at sorcerer level 1', () => {
    const pick = open(sorcerer(1), 'feature.sorcerer.dragon-ancestor-');
    expect(pick?.count).toBe(1);
    expect(pick?.optionIds).toHaveLength(10);
  });

  it('Elemental Affinity adds CHA to matching spell damage from level 6', () => {
    const at = (level: number, spellId: string) => {
      const state = sorcerer(level);
      state.build.featureIds.push('feature.sorcerer.dragon-ancestor-red-fire-damage');
      const sheet = computeSheet(state, registry);
      return spellCastDetails(
        { ...state, registry, sheet },
        { spellId, classId: 'class.sorcerer', slotLevel: 0 },
      ).damage;
    };
    const cha = computeSheet(sorcerer(6), registry).abilities.CHA.mod;
    expect(at(5, 'spell.fire-bolt')?.affinity).toBeUndefined();
    expect(at(6, 'spell.fire-bolt')?.affinity).toEqual({ name: 'Elemental Affinity', bonus: cha });
    expect(at(6, 'spell.ray-of-frost')?.affinity).toBeUndefined();
  });

  it('Elemental Affinity resistance spends one sorcery point', () => {
    const session = new Session(sorcerer(6));
    session.run(useFeature, { featureId: 'feature.sorcerer.elemental-affinity' });
    expect(session.live.featureUsesSpent['feature.sorcerer.font-of-magic']).toBe(1);
    session.undo();
    expect(session.live.featureUsesSpent['feature.sorcerer.font-of-magic'] ?? 0).toBe(0);
  });
});
