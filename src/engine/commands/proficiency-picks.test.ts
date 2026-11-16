import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { pendingChoices } from '../calc/pending-choices';
import { computeSheet, type CharacterState } from '../calc/sheet';
import { chooseProficiencies } from './proficiency-picks';
import { freshState, Session } from './test-utils';

const VERSATILITY = 'feature.skill-versatility';
const KNOWLEDGE = 'feature.cleric.knowledge-blessings-of-knowledge';
const DEFT = 'feature.tce.ranger-deft-explorer';

function variant(change: (state: CharacterState) => void): CharacterState {
  const state = structuredClone(freshState);
  change(state);
  return state;
}

const proficientSkills = (state: CharacterState) =>
  Object.entries(computeSheet(state, registry).skills)
    .filter(([, skill]) => skill.proficiency !== 'none')
    .map(([id]) => id);

describe('race and feature proficiencies', () => {
  it('keeps The Fool at ten skills and Celestial through stored picks', () => {
    const sheet = computeSheet(freshState, registry);
    expect(proficientSkills(freshState)).toHaveLength(10);
    expect(sheet.proficiencies.languages).toContain('Celestial');
    expect(sheet.grantedProficiencies).toContainEqual({
      kind: 'skills',
      value: 'intimidation',
      source: 'Skill Versatility',
    });
  });

  it('fixed race grants: Keen Senses and Dwarven Combat Training', () => {
    const elf = variant((state) => {
      state.build.raceId = 'race.elf';
      delete state.build.subraceId;
      state.build.proficiencies.skills = state.build.proficiencies.skills.filter(
        (skill) => skill !== 'perception',
      );
    });
    expect(proficientSkills(elf)).toContain('perception');

    const dwarf = variant((state) => {
      state.build.raceId = 'race.dwarf';
      delete state.build.subraceId;
    });
    expect(computeSheet(dwarf, registry).proficiencies.weapons).toEqual(
      expect.arrayContaining(['item.battleaxe', 'item.warhammer']),
    );
  });

  it('College of Valor armor counts as proficient', () => {
    const valor = variant((state) => {
      state.build.classes[0]!.subclassId = 'subclass.bard.valor';
    });
    const armor = computeSheet(valor, registry).proficiencies.armor;
    expect(armor).toEqual(expect.arrayContaining(['light', 'medium', 'shield']));
  });

  it('Skill Versatility asks in To do until picked, and blocks wrong picks', () => {
    const session = new Session(
      variant((state) => {
        delete state.build.proficiencyPicks![VERSATILITY];
      }),
    );
    const open = pendingChoices(session.state, registry).find(
      (row) => row.kind === 'proficiencies',
    );
    expect(open).toMatchObject({ featureId: VERSATILITY, count: 2 });

    expect(
      session.preview(chooseProficiencies, { featureId: VERSATILITY, skills: ['athletics'] })
        .result,
    ).toBe('blocked');
    expect(
      session.preview(chooseProficiencies, {
        featureId: VERSATILITY,
        skills: ['athletics', 'athletics'],
      }).reasons,
    ).toEqual(['Pick each option once']);
    // Deception is already a build skill, so picking it again warns.
    expect(
      session.preview(chooseProficiencies, {
        featureId: VERSATILITY,
        skills: ['athletics', 'deception'],
      }).reasons,
    ).toEqual(['Already proficient: deception']);

    session.run(chooseProficiencies, { featureId: VERSATILITY, skills: ['athletics', 'history'] });
    expect(
      pendingChoices(session.state, registry).some((row) => row.kind === 'proficiencies'),
    ).toBe(false);
    expect(proficientSkills(session.state)).toEqual(
      expect.arrayContaining(['athletics', 'history']),
    );
    expect(session.undo()).toBeTruthy();
    expect(session.state.build.proficiencyPicks?.[VERSATILITY]).toBeUndefined();
  });

  it('rejects picks for a feature the character does not have', () => {
    const session = new Session();
    expect(
      session.preview(chooseProficiencies, { featureId: DEFT, expertise: ['stealth'] }).result,
    ).toBe('blocked');
  });

  it('Blessings of Knowledge doubles its picked skills', () => {
    const session = new Session(
      variant((state) => {
        state.build.featureIds = [...state.build.featureIds, KNOWLEDGE];
      }),
    );
    session.run(chooseProficiencies, {
      featureId: KNOWLEDGE,
      languages: ['Dwarvish', 'Giant'],
      skills: ['arcana', 'history'],
    });
    const skills = session.sheet.skills;
    expect(skills.arcana.proficiency).toBe('expertise');
    expect(skills.history.proficiency).toBe('expertise');
  });

  it('Deft Explorer expertise needs a skill the character is proficient in', () => {
    const session = new Session(
      variant((state) => {
        state.build.featureIds = [...state.build.featureIds, DEFT];
      }),
    );
    expect(
      session.preview(chooseProficiencies, {
        featureId: DEFT,
        expertise: ['athletics'],
        languages: ['Dwarvish', 'Giant'],
      }).reasons,
    ).toEqual(['Expertise needs proficiency first: athletics']);
    // Intimidation comes from Skill Versatility, which counts.
    session.run(chooseProficiencies, {
      featureId: DEFT,
      expertise: ['intimidation'],
      languages: ['Dwarvish', 'Giant'],
    });
    expect(session.sheet.skills.intimidation.proficiency).toBe('expertise');
  });

  it('Custom Lineage can pick darkvision', () => {
    const session = new Session(
      variant((state) => {
        state.build.raceId = 'race.custom-lineage';
        delete state.build.subraceId;
      }),
    );
    expect(session.sheet.darkvision).toBeUndefined();
    session.run(chooseProficiencies, { featureId: 'feature.custom-lineage', darkvision: true });
    expect(session.sheet.darkvision).toBe(60);
  });
});
