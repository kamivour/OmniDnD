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
  it('blocks replacing a proficiency used by retained expertise, then permits changing both picks in order', () => {
    const state = variant((draft) => {
      draft.build.proficiencies.skills = [];
      draft.build.proficiencies.expertise = [];
      draft.build.proficiencyPicks = {};
      draft.build.featureIds = ['feature.feat.skill-expert'];
    });
    const session = new Session(state);
    session.run(chooseProficiencies, {
      featureId: VERSATILITY,
      skills: ['athletics', 'animal-handling'],
    });
    session.run(chooseProficiencies, {
      featureId: 'feature.feat.skill-expert',
      expertise: ['athletics'],
    });
    const before = structuredClone(session.state);
    const events = structuredClone(session.events);
    const replacement = { featureId: VERSATILITY, skills: ['arcana', 'animal-handling'] as const };
    expect(
      session.preview(chooseProficiencies, { ...replacement, skills: [...replacement.skills] }),
    ).toEqual({
      result: 'blocked',
      reasons: ['Expertise in athletics needs this proficiency. Change that expertise pick first.'],
    });
    expect(
      session.try(chooseProficiencies, { ...replacement, skills: [...replacement.skills] }, true)
        .result,
    ).toBe('blocked');
    expect(session.state).toEqual(before);
    expect(session.events).toEqual(events);
    session.run(chooseProficiencies, {
      featureId: 'feature.feat.skill-expert',
      expertise: ['animal-handling'],
    });
    session.run(chooseProficiencies, { ...replacement, skills: [...replacement.skills] });
    expect(session.sheet.skills.athletics.proficiency).toBe('none');
    expect(session.sheet.skills['animal-handling'].proficiency).toBe('expertise');
    session.state = JSON.parse(JSON.stringify(session.state));
    session.events = JSON.parse(JSON.stringify(session.events));
    session.undo();
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('allows replacing a pick when another source still provides the expertise prerequisite', () => {
    const state = variant((draft) => {
      draft.build.proficiencies.skills = ['athletics'];
      draft.build.proficiencies.expertise = ['athletics'];
      draft.build.proficiencyPicks = {
        [VERSATILITY]: { skills: ['athletics', 'animal-handling'] },
      };
    });
    const session = new Session(state);
    session.run(chooseProficiencies, {
      featureId: VERSATILITY,
      skills: ['arcana', 'animal-handling'],
    });
    expect(session.sheet.skills.athletics.proficiency).toBe('expertise');
  });

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

  it('Prodigy picks a skill, a tool, a language and an expertise', () => {
    const state = variant((draft) => {
      draft.build.featureIds = [...draft.build.featureIds, 'feature.feat.prodigy'];
    });
    expect(
      pendingChoices(state, registry).find((row) => row.featureId === 'feature.feat.prodigy')
        ?.count,
    ).toBe(4);
    const session = new Session(state);
    session.run(chooseProficiencies, {
      featureId: 'feature.feat.prodigy',
      skills: ['arcana'],
      tools: ['item.thieves-tools'],
      languages: ['Giant'],
      expertise: ['arcana'],
    });
    expect(session.sheet.skills.arcana.proficiency).toBe('expertise');
    expect(session.sheet.proficiencies.languages).toContain('Giant');
  });

  it('Skill Expert adds one expertise pick', () => {
    const state = variant((draft) => {
      draft.build.featureIds = [...draft.build.featureIds, 'feature.feat.skill-expert'];
    });
    const session = new Session(state);
    session.run(chooseProficiencies, {
      featureId: 'feature.feat.skill-expert',
      expertise: ['intimidation'],
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
