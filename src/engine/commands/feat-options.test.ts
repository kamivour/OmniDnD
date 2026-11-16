import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { pendingChoices } from '../calc/pending-choices';
import { computeSheet, type CharacterState } from '../calc/sheet';
import { resolveChoices } from './resolve-choices';
import { spellCastDetails } from './spell-options';
import { freshState, Session } from './test-utils';

const INITIATE = 'feature.feat.fighting-initiate';
const STYLE = 'feature.fighter.fighting-style-';
const INVOCATION = 'feature.warlock.eldritch-invocation-';

function character(classId: string, level: number, feat: string): CharacterState {
  const state: CharacterState = structuredClone(freshState);
  state.campaign = { ...state.campaign, sources: ['PHB', 'TCE'] };
  state.build.classes = [{ classId, level }];
  state.build.hpEntries = Array.from({ length: level }, (_, index) => ({
    level: index + 1,
    classId,
    value: index === 0 ? 10 : 6,
    method: index === 0 ? ('max' as const) : ('average' as const),
  }));
  state.build.spells = [{ classId, known: ['spell.fire-bolt', 'spell.ray-of-frost'] }];
  state.build.featureIds = [feat];
  return state;
}

const openFor = (state: CharacterState, prefix: string) =>
  pendingChoices(state, registry)
    .filter((row) => row.kind === 'option' && row.prefix === prefix)
    .reduce((sum, row) => sum + row.count, 0);

describe('feats that grant an option pick', () => {
  it('Fighting Initiate: a bard picks one fighter style', () => {
    const session = new Session(character('class.bard', 4, INITIATE));
    const row = pendingChoices(session.state, registry).find((item) => item.featureId === INITIATE);
    expect(row).toMatchObject({ label: 'Fighting Initiate: pick 1', prefix: STYLE });
    expect(row?.optionIds).toContain(`${STYLE}defense`);
    session.run(resolveChoices, {
      classId: 'class.bard',
      choices: { features: [`${STYLE}defense`] },
    });
    expect(openFor(session.state, STYLE)).toBe(0);
    expect(session.state.build.featureIds).toContain(`${STYLE}defense`);
  });

  it('Fighting Initiate: a fighter gets two different styles, not three', () => {
    const session = new Session(character('class.fighter', 1, INITIATE));
    expect(openFor(session.state, STYLE)).toBe(2);
    expect(
      session.preview(resolveChoices, {
        classId: 'class.fighter',
        choices: { features: [`${STYLE}defense`, `${STYLE}archery`, `${STYLE}dueling`] },
      }).reasons,
    ).toEqual(['Only 2 Fighting Style picks are open']);
    session.run(resolveChoices, {
      classId: 'class.fighter',
      choices: { features: [`${STYLE}defense`, `${STYLE}archery`] },
    });
    expect(openFor(session.state, STYLE)).toBe(0);
  });

  it('Eldritch Adept: one invocation, added to a warlock’s own picks', () => {
    expect(openFor(character('class.bard', 4, 'feature.feat.eldritch-adept'), INVOCATION)).toBe(1);
    expect(openFor(character('class.warlock', 4, 'feature.feat.eldritch-adept'), INVOCATION)).toBe(
      3,
    );
  });

  it('Elemental Adept: picks a damage type that its spells then note', () => {
    const session = new Session(character('class.sorcerer', 4, 'feature.feat.elemental-adept'));
    expect(openFor(session.state, 'feature.feat.elemental-adept-')).toBe(1);
    session.run(resolveChoices, {
      classId: 'class.sorcerer',
      choices: { features: ['feature.feat.elemental-adept-fire'] },
    });
    const state = session.state;
    const sheet = computeSheet(state, registry);
    const damage = (spellId: string) =>
      spellCastDetails(
        { ...state, registry, sheet },
        { spellId, classId: 'class.sorcerer', slotLevel: 0 },
      ).damage;
    expect(damage('spell.fire-bolt')?.adept).toBe('Elemental Adept: Fire');
    expect(damage('spell.ray-of-frost')?.adept).toBeUndefined();
  });

  it('blocks a feat option without the feat', () => {
    const session = new Session(character('class.bard', 4, INITIATE));
    expect(
      session.preview(resolveChoices, {
        classId: 'class.bard',
        choices: { features: ['feature.feat.elemental-adept-cold'] },
      }).reasons,
    ).toEqual(['That feature is not a pick for this class']);
  });
});
