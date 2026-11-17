import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { pendingChoices } from '../../engine/calc/pending-choices';
import { chooseFeatSpells } from '../../engine/commands/feat-spells';
import { chooseProficiencies } from '../../engine/commands/proficiency-picks';
import { freshState, Session } from '../../engine/commands/test-utils';
import { savedChoices } from './saved-choices';

const FEY = 'feature.feat.fey-touched';
const VERSATILITY = 'feature.skill-versatility';

describe('saved choices', () => {
  it('lists saved picks and lets them be chosen again', () => {
    const state = structuredClone(freshState);
    state.build.featureIds = [...state.build.featureIds, FEY];
    // The +1 it gives sets the casting ability, so only the spell is left to pick.
    state.build.abilityScores.bonuses.push({
      ability: 'CHA',
      value: 1,
      source: 'Feat: Fey Touched',
    });
    const session = new Session(state);
    const list = () =>
      savedChoices(session.state, registry, pendingChoices(session.state, registry));
    const row = (featureId: string) => list().find((entry) => entry.featureId === featureId);

    // An open pick stays in To do, not in Saved choices.
    expect(row(FEY)).toBeUndefined();
    expect(row(VERSATILITY)?.summary).toBe('Intimidation, Investigation');

    session.run(chooseFeatSpells, { featureId: FEY, spellIds: ['spell.bless'] });
    session.run(chooseFeatSpells, { featureId: FEY, spellIds: ['spell.command'] });
    expect(session.state.build.featSpells?.[FEY]?.spellIds).toEqual(['spell.command']);
    expect(row(FEY)?.summary).toBe('Command');

    // run() throws on a warning, so re-saving next to the feature's own old pick is clean.
    session.run(chooseProficiencies, {
      featureId: VERSATILITY,
      skills: ['intimidation', 'history'],
    });
    expect(row(VERSATILITY)?.summary).toBe('Intimidation, History');
  });

  it('drops picks for features the character no longer has', () => {
    const state = structuredClone(freshState);
    state.build.featSpells = { [FEY]: { spellIds: ['spell.bless'] } };
    const ids = savedChoices(state, registry, []).map((row) => row.id);
    expect(ids).not.toContain(`feat-spells:${FEY}`);
    expect(ids).toContain(`proficiencies:${VERSATILITY}`);
  });
});
