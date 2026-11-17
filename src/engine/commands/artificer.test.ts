import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { computeSheet, type CharacterState } from '../calc/sheet';
import { spellSelectionDetails } from '../calc/spell-selections';
import { spellSlots } from '../calc/slots';
import { levelUp } from './level';
import { freshState, Session } from './test-utils';
import { pendingChoices } from '../calc/pending-choices';
import { resolveChoices } from './resolve-choices';

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
  it('offers only level-eligible infusions and keeps the known limit separate from active items', () => {
    const state = artificer(2);
    const row = pendingChoices(state, registry).find(
      (item) => item.prefix === 'feature.artificer.infusion-',
    )!;
    expect(row.count).toBe(4);
    expect(row.optionIds).toContain('feature.artificer.infusion-enhanced-weapon');
    expect(row.optionIds).not.toContain('feature.artificer.infusion-radiant-weapon');
    expect(row.optionIds).not.toContain('feature.artificer.infusion-arcane-propulsion-armor');
    const session = new Session(state);
    expect(
      session.try(
        resolveChoices,
        {
          classId: 'class.artificer',
          choices: { features: ['feature.artificer.infusion-radiant-weapon'] },
        },
        true,
      ).result,
    ).toBe('blocked');
  });
  it('blocks too many known infusions through level-up as well as To do', () => {
    const session = new Session(artificer(2));
    const choices = {
      features: [
        'enhanced-weapon',
        'enhanced-defense',
        'enhanced-arcane-focus',
        'mind-sharpener',
        'returning-weapon',
      ].map((name) => `feature.artificer.infusion-${name}`),
    };
    expect(session.try(levelUp, { classId: 'class.artificer', choices }, true).result).toBe(
      'blocked',
    );
  });
  it.each([
    [1, 0],
    [2, 4],
    [6, 6],
    [10, 8],
    [14, 10],
    [18, 12],
  ])('offers the correct known count at Artificer %s', (level, count) => {
    const row = pendingChoices(artificer(level!), registry).find(
      (item) => item.prefix === 'feature.artificer.infusion-',
    );
    expect(row?.count ?? 0).toBe(count);
  });
  it('uses Artificer levels for eligibility rather than the multiclass total', () => {
    const state = artificer(2);
    state.build.classes.push({ classId: 'class.wizard', level: 4 });
    state.build.hpEntries.push(
      ...Array.from({ length: 4 }, (_, i) => ({
        level: i + 3,
        classId: 'class.wizard',
        method: 'average' as const,
        value: 4,
        floor: 'none' as const,
      })),
    );
    const row = pendingChoices(state, registry).find(
      (item) => item.prefix === 'feature.artificer.infusion-',
    )!;
    expect(row.count).toBe(4);
    expect(row.optionIds).not.toContain('feature.artificer.infusion-radiant-weapon');
  });
  it('uses the current class level when settling an earlier improvement and infusion together', () => {
    const session = new Session(artificer(6));
    expect(
      session.try(resolveChoices, {
        classId: 'class.artificer',
        choices: {
          asi: { kind: 'abilities', increases: [{ ability: 'STR', value: 2 }] },
          features: ['feature.artificer.infusion-radiant-weapon'],
        },
      }).result,
    ).toBe('ok');
  });
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
