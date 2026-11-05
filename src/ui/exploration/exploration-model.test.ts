import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import { computeSheet, type CharacterState } from '../../engine/calc/sheet';
import { spellCastDetails } from '../../engine/commands';
import { createCharacter } from '../../engine/creation';
import { buildRegistry, type Registry } from '../../engine/registry';
import type { Campaign, SpellDef } from '../../engine/schema';
import { spellbookModel } from '../spells/spellbook-model';
import { explorationModel } from './exploration-model';

const campaign: Campaign = {
  id: 'exploration-test-campaign',
  schemaVersion: 1,
  name: 'Exploration test',
  ruleset: '5e-2014',
  leveling: 'milestone',
  hpMethod: 'average',
  hpLevelFloor: 'none',
  abilityMethod: 'rolled',
  sources: ['PHB', 'HB'],
  optionalRules: {},
};

function character(classId = 'class.sorcerer', level = 6): CharacterState {
  const { build, live } = createCharacter(
    {
      id: 'explorer',
      name: 'Explorer',
      campaign,
      classId,
      level,
      raceId: 'race.half-elf',
      backgroundId: 'background.acolyte',
      abilityBases: { STR: 8, DEX: 14, CON: 12, INT: 16, WIS: 10, CHA: 12 },
      racialChoices: ['DEX', 'CON'],
    },
    registry,
  );
  return { campaign, build, live };
}

function model(state: CharacterState, refs: Registry = registry) {
  return explorationModel(state, computeSheet(state, refs), refs);
}

function replacing(...spells: SpellDef[]): Registry {
  return buildRegistry(
    [
      [...registry.entries.values()].map(
        (entry) => spells.find((spell) => spell.id === entry.id) ?? entry,
      ),
    ],
    [],
    [],
  );
}

describe('explorationModel', () => {
  it('includes secondary Utility tags without changing the primary type, order or spell details', () => {
    const state = character();
    state.build.spells = [
      {
        classId: 'class.sorcerer',
        known: ['spell.fireball', 'spell.mage-hand', 'spell.fire-bolt', 'spell.healing-word'],
      },
    ];
    const refs = replacing({
      ...registry.get('spell', 'spell.fire-bolt'),
      tags: ['damage', 'utility'],
      summary: { effect: 'A test utility use.', scaling: 'A test scaling note.' },
      url: 'https://example.com/utility-spell',
    });
    const result = model(state, refs);
    expect(result.entries.map(({ spell }) => spell.id)).toEqual([
      'spell.fire-bolt',
      'spell.mage-hand',
    ]);
    expect(result.entries[0]).toMatchObject({
      classId: 'class.sorcerer',
      dc: 13,
      attack: 5,
      spell: {
        type: 'damage',
        tags: ['damage', 'utility'],
        attack: 'ranged',
        lines: ['A test utility use.', 'Scaling: A test scaling note.'],
        url: 'https://example.com/utility-spell',
      },
    });
    expect(result.levels).toEqual([0, 1, 2, 3]);
  });

  it('uses character tag overrides, including an empty override normalized to Utility', () => {
    const state = character();
    state.build.spells = [
      {
        classId: 'class.sorcerer',
        known: ['spell.mage-hand', 'spell.fire-bolt', 'spell.shield'],
      },
    ];
    state.build.spellTags = {
      'spell.mage-hand': ['buff'],
      'spell.fire-bolt': [],
      'spell.shield': ['buff', 'utility'],
    };
    const result = model(state);
    expect(result.entries.map(({ spell }) => spell.id)).toEqual([
      'spell.fire-bolt',
      'spell.shield',
    ]);
    expect(result.entries[0]?.spell).toMatchObject({ type: 'utility', tags: ['utility'] });
    expect(result.entries[1]?.spell).toMatchObject({ type: 'buff', tags: ['buff', 'utility'] });
    expect(state.build.spellTags['spell.fire-bolt']).toEqual([]);
    expect(registry.get('spell', 'spell.mage-hand').tags).toEqual([]);
  });

  it('shows a ritual with other tags without granting a class ritual casting', () => {
    const state = character();
    state.build.spells = [{ classId: 'class.sorcerer', known: ['spell.identify'] }];
    const refs = replacing({ ...registry.get('spell', 'spell.identify'), tags: ['buff'] });
    const sheet = computeSheet(state, refs);
    const context = { ...state, sheet, registry: refs };
    const before = spellCastDetails(context, {
      spellId: 'spell.identify',
      classId: 'class.sorcerer',
    });
    const result = explorationModel(state, sheet, refs);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.spell).toMatchObject({
      id: 'spell.identify',
      type: 'buff',
      tags: ['buff'],
      ritual: true,
      cost: '1 min',
    });
    expect(before.ritualEligible).toBe(false);
    expect(before.ritualReason).toBe('Sorcerer does not grant ritual casting');
    expect(
      spellCastDetails(context, { spellId: 'spell.identify', classId: 'class.sorcerer' }),
    ).toEqual(before);
  });

  it('retains known and prepared selections once per class with each class casting modifier', () => {
    const state = character();
    state.build.classes = [
      { classId: 'class.sorcerer', level: 3 },
      { classId: 'class.wizard', level: 3 },
    ];
    state.build.hpEntries = state.build.hpEntries.map((entry, index) => ({
      ...entry,
      classId: index < 3 ? 'class.sorcerer' : 'class.wizard',
    }));
    state.build.spells = [
      {
        classId: 'class.wizard',
        known: ['spell.mage-hand', 'spell.mage-hand', 'spell.fire-bolt'],
        prepared: ['spell.mage-hand', 'spell.detect-magic'],
      },
      { classId: 'class.wizard', known: ['spell.detect-magic'] },
      { classId: 'class.sorcerer', known: ['spell.mage-hand'], prepared: ['spell.mage-hand'] },
    ];
    const result = model(state);
    expect(
      result.entries.map(({ spell, classId, dc, attack }) => [spell.id, classId, dc, attack]),
    ).toEqual([
      ['spell.mage-hand', 'class.sorcerer', 13, 5],
      ['spell.mage-hand', 'class.wizard', 14, 6],
      ['spell.detect-magic', 'class.wizard', 14, 6],
    ]);
    expect(result.classes.find(({ classId }) => classId === 'class.wizard')).toMatchObject({
      mode: 'spellbook',
      cantrips: 2,
      known: 1,
      prepared: 1,
    });
    expect(result.classes.find(({ classId }) => classId === 'class.sorcerer')).toMatchObject({
      mode: 'known',
      cantrips: 1,
      known: 0,
    });
  });

  it('keeps shared spent pools, effective casting values and unfiltered metadata intact', () => {
    const state = structuredClone(seedFile);
    state.build.overrides.push(
      { path: '/slots/max/1', value: 6, note: 'Extra slots' },
      { path: '/spellcasting/class.bard/saveDc', value: 19, note: 'Approved DC' },
      { path: '/spellcasting/class.bard/attack', value: 11, note: 'Approved attack' },
    );
    state.live.slotsUsed[1] = 5;
    state.live.slotsUsed[2] = 1;
    const sheet = computeSheet(state, registry);
    const book = spellbookModel(state, sheet, registry);
    const beforeState = structuredClone(state);
    const beforeSheet = structuredClone(sheet);
    const beforeRegistry = structuredClone([...registry.entries]);
    const result = explorationModel(state, sheet, registry);
    expect(result.slots).toEqual([
      { level: 1, max: 6, used: 5 },
      { level: 2, max: 2, used: 1 },
    ]);
    expect(result.entries.length).toBeGreaterThan(0);
    expect(result.entries.length).toBeLessThan(book.entries.length);
    for (const entry of result.entries) {
      expect(entry).toEqual(
        book.entries.find(
          ({ spell, classId }) => spell.id === entry.spell.id && classId === entry.classId,
        ),
      );
      expect(entry).toMatchObject({ dc: 19, attack: 11 });
      expect(entry.spell.dcOverride?.note).toBe('Approved DC');
      expect(entry.spell.attackOverride?.note).toBe('Approved attack');
    }
    expect({ ...result, entries: [] }).toEqual({ ...book, entries: [] });
    expect(state).toEqual(beforeState);
    expect(sheet).toEqual(beforeSheet);
    expect([...registry.entries]).toEqual(beforeRegistry);
  });

  it('handles a martial character and an empty caster without inventing spells or resources', () => {
    const martial = model(character('class.fighter'));
    expect(martial).toEqual({
      entries: [],
      slots: [],
      levels: [],
      classes: [],
      unsupportedClassIds: [],
    });
    const caster = model(character());
    expect(caster.entries).toEqual([]);
    expect(caster.levels).toEqual([1, 2, 3]);
    expect(caster.slots).toEqual([
      { level: 1, max: 4, used: 0 },
      { level: 2, max: 3, used: 0 },
      { level: 3, max: 3, used: 0 },
    ]);
    expect(caster.classes[0]).toMatchObject({ cantrips: 0, known: 0, dc: 13, attack: 5 });
  });
});
