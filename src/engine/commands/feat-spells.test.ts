import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { featSpellSources, freeUseKey } from '../calc/feat-spells';
import { pendingChoices } from '../calc/pending-choices';
import { computeSheet, type CharacterState } from '../calc/sheet';
import { chooseFeatSpells } from './feat-spells';
import { resetCharacter } from './reset';
import { completeLongRest, completeShortRest } from './rest';
import { castSpell } from './spells';
import { freshState, Session } from './test-utils';

const FEY = 'feature.feat.fey-touched';
const INITIATE = 'feature.feat.magic-initiate';

/** The Fool with extra feats; Fey Touched raises Charisma. */
function withFeats(...ids: string[]): CharacterState {
  const state = structuredClone(freshState);
  state.build.featureIds = [...state.build.featureIds, ...ids];
  if (ids.includes(FEY))
    state.build.abilityScores.bonuses.push({
      ability: 'CHA',
      value: 1,
      source: 'Feat: Fey Touched',
    });
  return state;
}

const sources = (state: CharacterState) =>
  featSpellSources({ registry, build: state.build, sheet: computeSheet(state, registry) });

describe('feat and racial trait spells', () => {
  it('lists an open pick in To do until the spell is chosen', () => {
    const session = new Session(withFeats(FEY));
    const open = pendingChoices(session.state, registry).find((row) => row.kind === 'feat-spells');
    expect(open).toMatchObject({ featureId: FEY, count: 1 });

    session.run(chooseFeatSpells, { featureId: FEY, spellIds: ['spell.bless'] });
    expect(pendingChoices(session.state, registry).some((row) => row.kind === 'feat-spells')).toBe(
      false,
    );
    const [source] = sources(session.state);
    expect(source).toMatchObject({ ability: 'CHA', open: 0 });
    // CHA 21 (+5) and proficiency +2.
    expect(source?.dc).toBe(15);
    expect(source?.spells.map((row) => row.spellId)).toEqual(['spell.misty-step', 'spell.bless']);
  });

  it('blocks picks outside the feat list', () => {
    const session = new Session(withFeats(FEY));
    expect(
      session.preview(chooseFeatSpells, { featureId: FEY, spellIds: ['spell.cure-wounds'] })
        .reasons,
    ).toEqual(['Cure Wounds is not an option for Fey Touched']);
    expect(
      session.preview(chooseFeatSpells, {
        featureId: INITIATE,
        classId: 'class.wizard',
        spellIds: [],
      }).reasons,
    ).toEqual(['That feat or trait is not on this character']);
  });

  it('Magic Initiate needs a class and takes spells from that class list', () => {
    const session = new Session(withFeats(INITIATE));
    expect(
      session.preview(chooseFeatSpells, {
        featureId: INITIATE,
        spellIds: ['spell.fire-bolt', 'spell.light', 'spell.shield'],
      }).reasons,
    ).toEqual(['Choose a class for Magic Initiate']);
    expect(
      session.preview(chooseFeatSpells, {
        featureId: INITIATE,
        classId: 'class.wizard',
        spellIds: ['spell.fire-bolt', 'spell.light', 'spell.cure-wounds'],
      }).reasons,
    ).toEqual(['Cure Wounds is not an option for Magic Initiate']);
    session.run(chooseFeatSpells, {
      featureId: INITIATE,
      classId: 'class.wizard',
      spellIds: ['spell.fire-bolt', 'spell.light', 'spell.shield'],
    });
    // Wizard spells use Intelligence: INT 12 (+1) and proficiency +2.
    expect(sources(session.state)[0]).toMatchObject({ ability: 'INT', dc: 11, attack: 3 });
  });

  it('spends the free casting once, then blocks it until a long rest', () => {
    const session = new Session(withFeats(FEY));
    session.run(chooseFeatSpells, { featureId: FEY, spellIds: ['spell.bless'] });
    const slotsBefore = session.live.slotsUsed;
    const free = { spellId: 'spell.misty-step', featureId: FEY, free: true };
    expect(session.run(castSpell, free)).toContain('free, Fey Touched');
    expect(session.live.slotsUsed).toEqual(slotsBefore);
    expect(session.live.featSpellsUsed).toEqual({ [freeUseKey(FEY, 'spell.misty-step')]: 1 });
    expect(session.preview(castSpell, free).reasons).toEqual([
      'Free casting of Misty Step is used until your next long rest',
    ]);
    // A slot still works, because Fey Touched allows slot casting.
    expect(
      session.preview(castSpell, { spellId: 'spell.misty-step', featureId: FEY, slotLevel: 2 })
        .result,
    ).toBe('ok');

    session.run(completeShortRest, {});
    expect(session.preview(castSpell, free).result).not.toBe('ok');
    session.run(completeLongRest, null);
    expect(session.live.featSpellsUsed ?? {}).toEqual({});
    expect(session.preview(castSpell, free).result).toBe('ok');
  });

  it('a short rest restores a short-rest free casting, and reset clears every one', () => {
    const state = withFeats('feature.feat.fey-teleportation');
    const session = new Session(state);
    const free = {
      spellId: 'spell.misty-step',
      featureId: 'feature.feat.fey-teleportation',
      free: true,
    };
    session.run(castSpell, free);
    expect(session.preview(castSpell, free).reasons).toEqual([
      'Free casting of Misty Step is used until your next short or long rest',
    ]);
    session.run(completeShortRest, {});
    expect(session.preview(castSpell, free).result).toBe('ok');

    session.run(castSpell, free);
    session.run(resetCharacter, {});
    expect(session.live.featSpellsUsed).toBeUndefined();
  });

  it('racial spells unlock by character level and cast at their listed level', () => {
    const state = structuredClone(freshState);
    state.build.raceId = 'race.tiefling';
    delete state.build.subraceId;
    const ids = sources(state)
      .find((row) => row.featureId === 'feature.infernal-legacy')
      ?.spells.map((row) => row.spellId);
    // Level 3: Thaumaturgy and Hellish Rebuke, not yet Darkness.
    expect(ids).toEqual(['spell.thaumaturgy', 'spell.hellish-rebuke']);
    const session = new Session(state);
    expect(
      session.run(castSpell, {
        spellId: 'spell.hellish-rebuke',
        featureId: 'feature.infernal-legacy',
        free: true,
      }),
    ).toContain('L2');
    expect(
      session.preview(castSpell, {
        spellId: 'spell.hellish-rebuke',
        featureId: 'feature.infernal-legacy',
        slotLevel: 1,
      }).reasons,
    ).toEqual(['Infernal Legacy does not let you cast Hellish Rebuke with a spell slot']);
  });
});

describe('Ritual Caster', () => {
  const RITUAL = 'feature.feat.ritual-caster';

  it('picks two level 1 rituals from the chosen class and casts them only as rituals', () => {
    const session = new Session(withFeats(RITUAL));
    expect(
      session.preview(chooseFeatSpells, {
        featureId: RITUAL,
        classId: 'class.wizard',
        spellIds: ['spell.detect-magic', 'spell.shield'],
      }).reasons,
    ).toEqual(['Shield is not an option for Ritual Caster']);
    session.run(chooseFeatSpells, {
      featureId: RITUAL,
      classId: 'class.wizard',
      spellIds: ['spell.detect-magic', 'spell.find-familiar'],
    });
    const slotsBefore = session.live.slotsUsed;
    const cast = { spellId: 'spell.detect-magic', featureId: RITUAL };
    expect(session.preview(castSpell, { ...cast, ritual: true }).reasons).toEqual([]);
    expect(session.preview(castSpell, { ...cast, slotLevel: 1 }).reasons).toEqual([
      'Ritual Caster casts its spells only as rituals',
    ]);
    session.run(castSpell, { ...cast, ritual: true });
    expect(session.live.slotsUsed).toEqual(slotsBefore);
  });
});
