import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import type { CharacterState } from '../calc/sheet';
import {
  changeSpellSelection,
  setSpellTags,
  type ChangeSpellSelectionPayload,
  type SetSpellTagsPayload,
} from './spell-selection';
import { runCommand } from './runner';
import { freshState, Session } from './test-utils';

const BARD = 'class.bard';
const OLD = 'spell.dissonant-whispers';
const NEW = 'spell.cure-wounds';
const CANTRIP = 'spell.minor-illusion';

function withSpells(spells: CharacterState['build']['spells']): CharacterState {
  return {
    ...freshState,
    build: {
      ...freshState.build,
      spells,
      favorites: [OLD, 'item.rapier'],
      spellTags: { [OLD]: ['control'] },
    },
  };
}

function caster(classId: string, known: string[], prepared?: string[]): CharacterState {
  return {
    ...freshState,
    build: {
      ...freshState.build,
      classes: [{ classId, level: 3 }],
      hpEntries: freshState.build.hpEntries.map((entry) => ({ ...entry, classId })),
      spells: [{ classId, known, ...(prepared === undefined ? {} : { prepared }) }],
    },
  };
}

describe('changeSpellSelection', () => {
  it('adds and removes explicit choices with logs, no input mutation and exact Undo', () => {
    const state = withSpells([{ classId: BARD, known: [CANTRIP] }]);
    const before = structuredClone(state);
    const session = new Session(state);
    expect(
      session.run(changeSpellSelection, {
        classId: BARD,
        list: 'known',
        action: 'add',
        spellId: NEW,
      }),
    ).toBe('Add Cure Wounds (Bard, known)');
    expect(session.state).toEqual({
      ...before,
      build: { ...before.build, spells: [{ classId: BARD, known: [CANTRIP, NEW] }] },
    });
    expect(session.events.at(-1)?.command).toBe('changeSpellSelection');
    expect(state).toEqual(before);
    const added = structuredClone(session.state);
    expect(
      session.run(changeSpellSelection, {
        classId: BARD,
        list: 'known',
        action: 'remove',
        spellId: NEW,
      }),
    ).toBe('Remove Cure Wounds (Bard, known)');
    session.undo();
    expect(session.state).toEqual(added);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('atomically replaces and normalizes only the affected class, preserving unrelated data and ordering', () => {
    const state = withSpells([
      { classId: 'class.cleric', known: ['spell.light'] },
      { classId: BARD, known: [CANTRIP, OLD, OLD] },
      {
        classId: 'class.wizard',
        known: ['spell.magic-missile'],
        prepared: ['spell.magic-missile'],
      },
      {
        classId: BARD,
        known: ['spell.vicious-mockery', OLD, 'spell.faerie-fire'],
        prepared: ['spell.healing-word'],
      },
    ]);
    const before = structuredClone(state);
    const session = new Session(state);
    expect(
      session.run(changeSpellSelection, {
        classId: BARD,
        list: 'known',
        action: 'replace',
        spellId: OLD,
        replacementId: NEW,
      }),
    ).toBe('Replace Dissonant Whispers with Cure Wounds (Bard, known)');
    expect(session.events).toHaveLength(1);
    expect(session.state).toEqual({
      ...before,
      build: {
        ...before.build,
        spells: [
          before.build.spells[0],
          {
            classId: BARD,
            known: [CANTRIP, NEW, 'spell.vicious-mockery', 'spell.faerie-fire'],
            prepared: ['spell.healing-word'],
          },
          before.build.spells[2],
        ],
      },
    });
    expect(state).toEqual(before);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('warns for a newly exceeded base count and allows force or Manual without trimming', () => {
    const payload = { classId: BARD, list: 'known' as const, action: 'add' as const, spellId: NEW };
    const session = new Session();
    expect(session.preview(changeSpellSelection, payload)).toEqual({
      result: 'warn',
      reasons: ['Bard: 7/6 known spells exceeds the base class limit.'],
    });
    session.run(changeSpellSelection, payload, true);
    expect(session.state.build.spells[0]!.known).toContain(NEW);
    expect(session.events.at(-1)?.override).toBe(true);
    session.undo();
    expect(session.state).toEqual(freshState);
    const manual = runCommand(changeSpellSelection, freshState, payload, registry, {
      eventId: 'manual-choice',
      realTime: '2026-11-03T03:00:00.000Z',
      automation: 'manual',
    });
    expect(manual.result).toBe('ok');
    if (manual.result === 'ok') {
      expect(manual.next.build.spells[0]!.known).toContain(NEW);
      expect(manual.event.override).toBeUndefined();
    }
  });

  it('warns for newly exceeded cantrip and prepared counts using engine-derived base limits', () => {
    const cantrips = new Session();
    expect(
      cantrips.preview(changeSpellSelection, {
        classId: BARD,
        list: 'known',
        action: 'add',
        spellId: 'spell.light',
      }),
    ).toEqual({ result: 'warn', reasons: ['Bard: 3/2 cantrips exceeds the base class limit.'] });
    const prepared = new Session(
      caster(
        'class.cleric',
        [],
        ['spell.bless', 'spell.cure-wounds', 'spell.detect-magic', 'spell.healing-word'],
      ),
    );
    expect(
      prepared.preview(changeSpellSelection, {
        classId: 'class.cleric',
        list: 'prepared',
        action: 'add',
        spellId: 'spell.sanctuary',
      }),
    ).toEqual({
      result: 'warn',
      reasons: ['Cleric: 5/4 prepared spells exceeds the base class limit.'],
    });
  });

  it('permits removal despite old violations and warns only when an excessive count increases', () => {
    const state = withSpells([
      { classId: BARD, known: [...freshState.build.spells[0]!.known, NEW, 'spell.fireball'] },
    ]);
    const session = new Session(state);
    expect(
      session.preview(changeSpellSelection, {
        classId: BARD,
        list: 'known',
        action: 'remove',
        spellId: NEW,
      }),
    ).toEqual({ result: 'ok', reasons: [] });
    session.run(changeSpellSelection, {
      classId: BARD,
      list: 'known',
      action: 'remove',
      spellId: NEW,
    });
    expect(session.state.build.spells[0]!.known).toContain('spell.fireball');
    expect(
      session.preview(changeSpellSelection, {
        classId: BARD,
        list: 'known',
        action: 'add',
        spellId: NEW,
      }).reasons,
    ).toContain('Bard: 8/6 known spells exceeds the base class limit.');
  });

  it('warns for new source, class-list, level and list violations without deleting prior choices', () => {
    const state = withSpells([{ classId: BARD, known: [CANTRIP] }]);
    const session = new Session(state);
    expect(
      session.preview(changeSpellSelection, {
        classId: BARD,
        list: 'known',
        action: 'add',
        spellId: 'spell.fireball',
      }).reasons,
    ).toEqual([
      'Fireball is not on the Bard spell list.',
      "Fireball exceeds Bard's level 2 spell limit.",
    ]);
    expect(
      session.preview(changeSpellSelection, {
        classId: BARD,
        list: 'prepared',
        action: 'add',
        spellId: NEW,
      }).reasons,
    ).toContain('Bard normally learns Cure Wounds rather than preparing it.');
    const disabled = new Session({ ...state, campaign: { ...state.campaign, sources: ['HB'] } });
    expect(
      disabled.preview(changeSpellSelection, {
        classId: BARD,
        list: 'known',
        action: 'add',
        spellId: NEW,
      }).reasons,
    ).toContain("Cure Wounds's source is not enabled in this campaign.");
    expect(session.state).toEqual(state);
  });

  it('prepares explicit choices and warns when Wizard book removal leaves a separately prepared spell', () => {
    const state = caster('class.wizard', ['spell.detect-magic']);
    const session = new Session(state);
    session.run(changeSpellSelection, {
      classId: 'class.wizard',
      list: 'prepared',
      action: 'add',
      spellId: 'spell.detect-magic',
    });
    const prepared = structuredClone(session.state);
    const remove = {
      classId: 'class.wizard',
      list: 'known' as const,
      action: 'remove' as const,
      spellId: 'spell.detect-magic',
    };
    expect(session.preview(changeSpellSelection, remove)).toEqual({
      result: 'warn',
      reasons: ['Detect Magic is prepared but is not in your Wizard spellbook.'],
    });
    session.run(changeSpellSelection, remove, true);
    expect(session.state.build.spells).toEqual([
      { classId: 'class.wizard', known: [], prepared: ['spell.detect-magic'] },
    ]);
    session.undo();
    expect(session.state).toEqual(prepared);
    session.undo();
    expect(session.state).toEqual(state);
  });

  it('warns for an invalid new preparation without guessing a selection or removing it automatically', () => {
    const session = new Session(caster('class.cleric', []));
    expect(
      session.preview(changeSpellSelection, {
        classId: 'class.cleric',
        list: 'prepared',
        action: 'add',
        spellId: 'spell.guidance',
      }).reasons,
    ).toContain('Guidance is a cantrip; it is learned rather than prepared.');
    const wizard = new Session(caster('class.wizard', []));
    expect(
      wizard.preview(changeSpellSelection, {
        classId: 'class.wizard',
        list: 'prepared',
        action: 'add',
        spellId: 'spell.detect-magic',
      }).reasons,
    ).toContain('Detect Magic is prepared but is not in your Wizard spellbook.');
  });

  it.each(['class.fighter', 'class.wizard'])(
    'allows actual retained %s removal and drops empty records with exact Undo',
    (classId) => {
      const state = withSpells([
        { classId, known: ['spell.detect-magic', 'spell.detect-magic'] },
        { classId: BARD, known: [CANTRIP] },
      ]);
      const before = structuredClone(state);
      const session = new Session(state);
      session.run(changeSpellSelection, {
        classId,
        list: 'known',
        action: 'remove',
        spellId: 'spell.detect-magic',
      });
      expect(session.state).toEqual({
        ...before,
        build: { ...before.build, spells: [{ classId: BARD, known: [CANTRIP] }] },
      });
      session.undo();
      expect(session.state).toEqual(before);
      for (const payload of [
        { classId, list: 'known', action: 'add', spellId: NEW },
        {
          classId,
          list: 'known',
          action: 'replace',
          spellId: 'spell.detect-magic',
          replacementId: NEW,
        },
      ] as const)
        expect(session.preview(changeSpellSelection, payload).result).toBe('blocked');
    },
  );

  it('blocks additions and replacements for an owned class without supported casting data', () => {
    const session = new Session(caster('class.fighter', ['spell.detect-magic']));
    expect(
      session.preview(changeSpellSelection, {
        classId: 'class.fighter',
        list: 'known',
        action: 'add',
        spellId: NEW,
      }).result,
    ).toBe('blocked');
    session.run(changeSpellSelection, {
      classId: 'class.fighter',
      list: 'known',
      action: 'remove',
      spellId: 'spell.detect-magic',
    });
    expect(session.state.build.spells).toEqual([]);
  });

  it.each([
    null,
    {},
    [],
    { classId: BARD, list: 'known', action: 'replace', spellId: OLD },
    { classId: BARD, list: 'known', action: 'add', spellId: NEW, replacementId: OLD },
    { classId: BARD, list: 'book', action: 'add', spellId: NEW },
    { classId: BARD, list: 'known', action: 'toggle', spellId: NEW },
    { classId: BARD, list: 'known', action: 'add', spellId: 'item.rapier' },
    { classId: BARD, list: 'known', action: 'add', spellId: 'spell.missing' },
    { classId: 'class.missing', list: 'known', action: 'add', spellId: NEW },
    { classId: 'feature.bard.cutting-words', list: 'known', action: 'add', spellId: NEW },
    {
      classId: BARD,
      list: 'known',
      action: 'replace',
      spellId: OLD,
      replacementId: 'spell.missing',
    },
    { classId: BARD, list: 'known', action: 'replace', spellId: NEW, replacementId: OLD },
    { classId: BARD, list: 'known', action: 'remove', spellId: NEW },
    { classId: BARD, list: 'known', action: 'add', spellId: NEW, extra: true },
  ])('blocks invalid choices even when forced or Manual without mutating input (%j)', (payload) => {
    const before = structuredClone(freshState);
    const payloadBefore = structuredClone(payload);
    for (const automation of ['assisted', 'manual'] as const) {
      const result = runCommand(
        changeSpellSelection,
        freshState,
        payload as ChangeSpellSelectionPayload,
        registry,
        {
          eventId: 'invalid-selection',
          realTime: '2026-11-03T03:00:00.000Z',
          force: true,
          automation,
        },
      );
      expect(result.result).toBe('blocked');
      expect(freshState).toEqual(before);
      expect(payload).toEqual(payloadBefore);
    }
  });

  it('blocks wrong-kind registry entries with valid-shaped IDs before applying', () => {
    for (const entries of [
      new Map(registry.entries).set(NEW, registry.get('item', 'item.rapier')),
      new Map(registry.entries).set(BARD, registry.get('spell', NEW)),
    ]) {
      const before = structuredClone(freshState);
      const result = runCommand(
        changeSpellSelection,
        freshState,
        { classId: BARD, list: 'known', action: 'add', spellId: NEW },
        { ...registry, entries },
        {
          eventId: 'wrong-kind',
          realTime: '2026-11-03T03:00:00.000Z',
          force: true,
          automation: 'manual',
        },
      );
      expect(result.result).toBe('blocked');
      expect(freshState).toEqual(before);
    }
  });
});

describe('setSpellTags', () => {
  it('stores ordered character-only tags with the first primary and exact Undo', () => {
    const state = withSpells([{ classId: BARD, known: [CANTRIP] }]);
    const before = structuredClone(state);
    const reference = structuredClone(registry.get('spell', NEW));
    const session = new Session(state);
    expect(session.run(setSpellTags, { spellId: NEW, tags: ['buff', 'healing'] })).toBe(
      'Set spell types: Cure Wounds (buff, healing)',
    );
    expect(session.state).toEqual({
      ...before,
      build: {
        ...before.build,
        spellTags: { ...before.build.spellTags, [NEW]: ['buff', 'healing'] },
      },
    });
    expect(registry.get('spell', NEW)).toEqual(reference);
    expect(session.events.at(-1)?.command).toBe('setSpellTags');
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('accepts an empty Utility override and resets only the requested key', () => {
    const session = new Session(withSpells([{ classId: BARD, known: [CANTRIP] }]));
    session.run(setSpellTags, { spellId: NEW, tags: [] });
    expect(session.state.build.spellTags?.[NEW]).toEqual([]);
    const overridden = structuredClone(session.state);
    expect(session.run(setSpellTags, { spellId: NEW, tags: null })).toBe(
      'Reset spell types: Cure Wounds',
    );
    expect(session.state.build.spellTags).toEqual({ [OLD]: ['control'] });
    session.undo();
    expect(session.state).toEqual(overridden);
  });

  it('restores an absent optional override record exactly on Undo and does not create it on reset', () => {
    const session = new Session(freshState);
    session.run(setSpellTags, { spellId: NEW, tags: ['utility'] });
    session.undo();
    expect(session.state).toEqual(freshState);
    session.run(setSpellTags, { spellId: NEW, tags: null });
    expect(session.state.build.spellTags).toBeUndefined();
  });

  it.each([
    null,
    {},
    { spellId: NEW },
    { spellId: NEW, tags: undefined },
    { spellId: NEW, tags: ['buff', 'buff'] },
    { spellId: NEW, tags: ['other'] },
    { spellId: NEW, tags: 'healing' },
    { spellId: 'item.rapier', tags: [] },
    { spellId: 'spell.missing', tags: null },
    { spellId: NEW, tags: [], extra: true },
  ])('blocks malformed tag choices under force and Manual without mutation (%j)', (payload) => {
    const before = structuredClone(freshState);
    const result = runCommand(setSpellTags, freshState, payload as SetSpellTagsPayload, registry, {
      eventId: 'invalid-types',
      realTime: '2026-11-03T03:00:00.000Z',
      force: true,
      automation: 'manual',
    });
    expect(result.result).toBe('blocked');
    expect(freshState).toEqual(before);
  });
});
