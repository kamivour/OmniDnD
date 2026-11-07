import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { sourceConflicts } from '../calc/campaign-rules';
import { computeSheet, type CharacterState } from '../calc/sheet';
import { setCustomOrigin } from './custom-origin';
import { levelUp } from './level';
import { freshState, Session } from './test-utils';

function ranger(level: number, rules: Record<string, boolean>): CharacterState {
  const state = structuredClone(freshState);
  state.campaign = {
    ...state.campaign,
    sources: ['PHB', 'TCE'],
    hpMethod: 'average',
    optionalRules: rules,
  };
  state.build.classes = [{ classId: 'class.ranger', level }];
  state.build.hpEntries = Array.from({ length: level }, (_, index) => ({
    level: index + 1,
    classId: 'class.ranger',
    value: index === 0 ? 10 : 6,
    method: index === 0 ? ('max' as const) : ('average' as const),
    floor: 'none' as const,
  }));
  state.build.featureIds = [];
  state.build.abilityScores.bonuses = [];
  return state;
}

const names = (state: CharacterState) =>
  computeSheet(state, registry).features.map(({ def }) => def.name);

describe('Tasha optional class features', () => {
  it('adds them by class level and drops what they replace, only when the rule is on', () => {
    const off = names(ranger(3, {}));
    expect(off).toContain('Natural Explorer');
    expect(off).not.toContain('Deft Explorer');
    const on = names(ranger(3, { optionalClassFeatures: true }));
    expect(on).toEqual(
      expect.arrayContaining(['Deft Explorer', 'Favored Foe', 'Primal Awareness']),
    );
    expect(on).not.toContain('Natural Explorer');
    expect(on).not.toContain('Favored Enemy');
    expect(on).not.toContain('Primeval Awareness');
    expect(on).not.toContain('Martial Versatility');
    expect(names(ranger(4, { optionalClassFeatures: true }))).toContain('Martial Versatility');
  });

  it('blocks a Tasha fighting style while the rule is off and allows it when on', () => {
    const payload = {
      classId: 'class.ranger',
      choices: { features: ['feature.tce.fighting-style-druidic-warrior'] },
    };
    expect(new Session(ranger(1, {})).preview(levelUp, payload).reasons).toEqual([
      "Fighting Style: Druidic Warrior needs Tasha's optional class features",
    ]);
    const session = new Session(ranger(1, { optionalClassFeatures: true }));
    session.run(levelUp, payload);
    expect(session.state.build.featureIds).toEqual(['feature.tce.fighting-style-druidic-warrior']);
  });

  it('lists a kept Tasha choice when the rule is later turned off', () => {
    const state = ranger(2, { optionalClassFeatures: true });
    state.build.featureIds = ['feature.tce.fighting-style-druidic-warrior'];
    state.campaign.sources = ['PHB'];
    expect(sourceConflicts(state.campaign, state.build, registry)).toEqual([
      'Fighting Style: Druidic Warrior (TCE)',
    ]);
  });
});

describe('Tasha custom origin', () => {
  const increases = [
    { ability: 'STR' as const, value: 2 as const },
    { ability: 'CON' as const, value: 1 as const },
  ];

  it('replaces racial bonuses, can be redone, and undoes', () => {
    const state = structuredClone(freshState);
    state.campaign.optionalRules = { customOrigin: true };
    const race = registry.get('race', state.build.raceId);
    state.build.abilityScores.bonuses = race.abilityBonuses.map((bonus) => ({
      source: race.id,
      ...bonus,
    }));
    const session = new Session(state);
    session.run(setCustomOrigin, { increases });
    expect(session.state.build.abilityScores.bonuses).toEqual([
      { source: 'Custom origin', ability: 'STR', value: 2 },
      { source: 'Custom origin', ability: 'CON', value: 1 },
    ]);
    session.run(setCustomOrigin, {
      increases: [
        { ability: 'DEX', value: 1 },
        { ability: 'WIS', value: 1 },
        { ability: 'CHA', value: 1 },
      ],
    });
    expect(session.state.build.abilityScores.bonuses.map(({ ability }) => ability)).toEqual([
      'DEX',
      'WIS',
      'CHA',
    ]);
    session.undo();
    session.undo();
    expect(session.state.build.abilityScores.bonuses).toEqual(state.build.abilityScores.bonuses);
  });

  it('needs the rule and a valid spread', () => {
    const off = new Session(structuredClone(freshState));
    expect(off.preview(setCustomOrigin, { increases }).reasons).toEqual([
      "This campaign does not use Tasha's custom origin",
    ]);
    const state = structuredClone(freshState);
    state.campaign.optionalRules = { customOrigin: true };
    const on = new Session(state);
    expect(
      on.preview(setCustomOrigin, {
        increases: [
          { ability: 'STR', value: 2 },
          { ability: 'STR', value: 1 },
        ],
      }).reasons,
    ).toEqual(['Raise two different abilities by +2 and +1, or three different abilities by +1']);
  });

  it('lists custom origin bonuses when the rule is turned off', () => {
    const state = structuredClone(freshState);
    state.build.abilityScores.bonuses = [{ source: 'Custom origin', ability: 'STR', value: 2 }];
    expect(
      sourceConflicts(
        { sources: state.campaign.sources, optionalRules: {} },
        state.build,
        registry,
      ),
    ).toEqual(['Custom origin ability bonuses']);
  });
});
