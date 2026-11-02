import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import type { CharacterState } from '../calc/sheet';
import { setSpellFavorite, type SetSpellFavoritePayload } from './favorites';
import { runCommand } from './runner';
import { freshState, Session } from './test-utils';

const SPELL = 'spell.cure-wounds';
const OTHER_SPELL = 'spell.faerie-fire';
const ITEM = 'item.rapier';
const FEATURE = 'feature.bard.cutting-words';

function withFavorites(favorites: string[]): CharacterState {
  return { ...freshState, build: { ...freshState.build, favorites } };
}

describe('setSpellFavorite', () => {
  it('favorites an unselected spell, logs the command and restores the exact state on Undo', () => {
    const initial = withFavorites([ITEM, FEATURE, OTHER_SPELL]);
    const before = structuredClone(initial);
    const session = new Session(initial);
    expect(session.run(setSpellFavorite, { spellId: SPELL, favorite: true })).toBe(
      'Favorite Cure Wounds',
    );
    expect(session.state).toEqual({
      ...before,
      build: { ...before.build, favorites: [ITEM, FEATURE, OTHER_SPELL, SPELL] },
    });
    expect(initial).toEqual(before);
    expect(session.events.at(-1)).toMatchObject({
      command: 'setSpellFavorite',
      text: 'Favorite Cure Wounds',
      characterId: initial.build.id,
    });
    expect(
      session.events
        .at(-1)
        ?.patches.every((patch) => patch.path[0] === 'build' && patch.path[1] === 'favorites'),
    ).toBe(true);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('removes every legacy duplicate of the chosen spell while preserving other favorites and data', () => {
    const initial = withFavorites([ITEM, SPELL, FEATURE, OTHER_SPELL, SPELL, ITEM]);
    const before = structuredClone(initial);
    const session = new Session(initial);
    expect(session.run(setSpellFavorite, { spellId: SPELL, favorite: false })).toBe(
      'Remove favorite Cure Wounds',
    );
    expect(session.state).toEqual({
      ...before,
      build: { ...before.build, favorites: [ITEM, FEATURE, OTHER_SPELL, ITEM] },
    });
    expect(initial).toEqual(before);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('keeps repeated add/remove requests idempotent while logging and undoing each request', () => {
    const initial = withFavorites([FEATURE]);
    const session = new Session(initial);
    session.run(setSpellFavorite, { spellId: SPELL, favorite: true });
    const once = structuredClone(session.state);
    session.run(setSpellFavorite, { spellId: SPELL, favorite: true });
    expect(session.state).toEqual(once);
    expect(session.events).toHaveLength(2);
    expect(session.events.at(-1)?.patches).toEqual([]);
    session.undo();
    expect(session.state).toEqual(once);
    session.undo();
    expect(session.state).toEqual(initial);

    session.run(setSpellFavorite, { spellId: SPELL, favorite: false });
    expect(session.state).toEqual(initial);
    expect(session.events.at(-1)?.text).toBe('Remove favorite Cure Wounds');
    expect(session.events.at(-1)?.patches).toEqual([]);
  });

  it('normalizes only the chosen spell to one existing occurrence when favoriting legacy duplicates', () => {
    const initial = withFavorites([ITEM, SPELL, FEATURE, SPELL, OTHER_SPELL, ITEM]);
    const session = new Session(initial);
    session.run(setSpellFavorite, { spellId: SPELL, favorite: true });
    expect(session.state.build.favorites).toEqual([ITEM, SPELL, FEATURE, OTHER_SPELL, ITEM]);
    session.undo();
    expect(session.state).toEqual(initial);
  });

  it.each([
    null,
    [],
    {},
    { spellId: SPELL },
    { favorite: true },
    { spellId: 1, favorite: true },
    { spellId: 'healing-word', favorite: true },
    { spellId: 'spell.HealingWord', favorite: true },
    { spellId: ITEM, favorite: true },
    { spellId: FEATURE, favorite: false },
    { spellId: SPELL, favorite: 'true' },
    { spellId: SPELL, favorite: 1 },
    { spellId: SPELL, favorite: null },
    { spellId: SPELL, favorite: true, extra: false },
    { spellId: SPELL, favorite: false, live: {} },
    { spellId: 'spell.missing-from-registry', favorite: true },
    { spellId: 'spell.missing-from-registry', favorite: false },
  ])(
    'blocks invalid requests in Assisted/Manual even when forced, without mutation (%j)',
    (payload) => {
      const initial = withFavorites([ITEM, FEATURE, OTHER_SPELL]);
      const before = structuredClone(initial);
      const payloadBefore = structuredClone(payload);
      for (const automation of ['assisted', 'manual'] as const) {
        for (const force of [false, true]) {
          const result = runCommand(
            setSpellFavorite,
            initial,
            payload as SetSpellFavoritePayload,
            registry,
            {
              eventId: 'invalid-favorite',
              realTime: '2026-11-03T03:00:00.000Z',
              automation,
              force,
            },
          );
          expect(result.result).toBe('blocked');
          expect(initial).toEqual(before);
          expect(payload).toEqual(payloadBefore);
        }
      }
    },
  );

  it('blocks a valid-shaped spell ID mapped to another registry kind before applying anything', () => {
    const wrongKindRegistry = {
      ...registry,
      entries: new Map(registry.entries).set(SPELL, registry.get('feature', FEATURE)),
    };
    const initial = withFavorites([SPELL, ITEM]);
    const before = structuredClone(initial);
    for (const favorite of [true, false]) {
      const result = runCommand(
        setSpellFavorite,
        initial,
        { spellId: SPELL, favorite },
        wrongKindRegistry,
        {
          eventId: 'wrong-reference-kind',
          realTime: '2026-11-03T03:00:00.000Z',
          automation: 'manual',
          force: true,
        },
      );
      expect(result).toEqual({
        result: 'blocked',
        reasons: ['Choose a spell from the reference library'],
      });
      expect(initial).toEqual(before);
    }
  });
});
