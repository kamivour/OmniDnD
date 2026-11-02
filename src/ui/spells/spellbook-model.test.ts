import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import { computeSheet, type CharacterState } from '../../engine/calc/sheet';
import { validateManagementData } from '../../engine/commands/management';
import { createCharacter } from '../../engine/creation';
import { buildRegistry, type Registry } from '../../engine/registry';
import type { Campaign, SpellDef } from '../../engine/schema';
import { spellbookModel } from './spellbook-model';

const campaign: Campaign = {
  id: 'spellbook-test-campaign',
  schemaVersion: 1,
  name: 'Spellbook test',
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
      id: 'other-caster',
      name: 'Other caster',
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
  return spellbookModel(state, computeSheet(state, refs), refs);
}

function replacing(...spells: SpellDef[]): Registry {
  return buildRegistry(
    [[...registry.entries.values()].map((entry) => spells.find((s) => s.id === entry.id) ?? entry)],
    [],
    [],
  );
}

describe('spellbookModel', () => {
  it('shows every seed spell with live slot usage and engine casting limits', () => {
    const book = model(seedFile);
    expect(book.entries).toHaveLength(8);
    expect(book.levels).toEqual([0, 1, 2]);
    expect(book.slots).toEqual([
      { level: 1, max: 4, used: 4 },
      { level: 2, max: 2, used: 0 },
    ]);
    expect(book.classes).toEqual([
      {
        classId: 'class.bard',
        name: 'Bard',
        dc: 15,
        attack: 7,
        cantrips: 2,
        cantripLimit: 2,
        known: 6,
        knownLimit: 6,
        mode: 'known',
        prepared: 0,
      },
    ]);
    for (const { spell, classId, dc, attack } of book.entries) {
      const def = registry.get('spell', spell.id);
      expect({ classId, dc, attack }).toEqual({ classId: 'class.bard', dc: 15, attack: 7 });
      expect(spell).toMatchObject({
        name: def.name,
        level: def.level,
        range: def.range,
        duration: def.duration.text,
        concentration: def.duration.concentration,
        ritual: def.ritual,
        source: def.source,
        url: def.url,
      });
      expect(spell.lines[0]).toBe(def.summary?.effect);
    }
    expect(
      book.entries.find(({ spell }) => spell.id === 'spell.healing-word')?.spell.lines,
    ).toEqual([
      'A creature you can see within range regains 1d4 + your spellcasting modifier HP. No effect on undead or constructs.',
      'Upcast: +1d4 per slot level above 1.',
    ]);
  });

  it('uses a different character’s selections, stats, slot pool and class-table limits', () => {
    const state = character();
    state.build.spells = [
      {
        classId: 'class.sorcerer',
        known: ['spell.fire-bolt', 'spell.ray-of-frost', 'spell.fireball', 'spell.shield'],
      },
    ];
    state.live.slotsUsed[3] = 1;
    const book = model(state);
    expect(book.entries.map(({ spell }) => spell.name)).toEqual([
      'Fire Bolt',
      'Ray of Frost',
      'Shield',
      'Fireball',
    ]);
    expect(book.classes).toEqual([
      {
        classId: 'class.sorcerer',
        name: 'Sorcerer',
        dc: 13,
        attack: 5,
        cantrips: 2,
        cantripLimit: 5,
        known: 2,
        knownLimit: 7,
        mode: 'known',
        prepared: 0,
      },
    ]);
    expect(book.slots).toEqual([
      { level: 1, max: 4, used: 0 },
      { level: 2, max: 3, used: 0 },
      { level: 3, max: 3, used: 1 },
    ]);
    expect(book.levels).toEqual([0, 1, 2, 3]);
    expect(book.entries.find(({ spell }) => spell.name === 'Shield')?.spell.cost).toBe('R');
  });

  it('preserves SRD melee and ranged spell attacks with the selected caster’s live bonus', () => {
    const state = character();
    state.build.spells = [
      {
        classId: 'class.sorcerer',
        known: ['spell.fire-bolt', 'spell.shocking-grasp', 'spell.fireball'],
      },
    ];
    const book = model(state);
    for (const [id, attack] of [
      ['spell.fire-bolt', 'ranged'],
      ['spell.shocking-grasp', 'melee'],
    ] as const) {
      expect(registry.get('spell', id).attack).toBe(attack);
      const entry = book.entries.find(({ spell }) => spell.id === id);
      expect(entry).toMatchObject({ attack: 5, spell: { attack } });
      expect(entry?.spell).not.toHaveProperty('save');
    }
    const saveSpell = book.entries.find(({ spell }) => spell.id === 'spell.fireball')?.spell;
    expect(saveSpell).toMatchObject({ save: 'DEX' });
    expect(saveSpell).not.toHaveProperty('attack');
  });

  it('retains slot-only groups for an empty book and has no groups for a noncaster', () => {
    const blank = model(character());
    expect(blank.entries).toEqual([]);
    expect(blank.levels).toEqual([1, 2, 3]);
    expect(blank.classes[0]).toMatchObject({ cantrips: 0, known: 0 });
    expect(model(character('class.fighter')).levels).toEqual([]);
    expect(model(character('class.fighter')).classes).toEqual([]);
  });

  it.each(['class.fighter', 'class.wizard'])(
    'keeps loaded %s spell associations without inventing casting stats',
    (classId) => {
      const state = character('class.fighter');
      state.build.spells = [
        {
          classId,
          known: ['spell.fire-bolt', 'spell.shield'],
          prepared: ['spell.shield'],
        },
        { classId, known: ['spell.fire-bolt'] },
      ];
      expect(() =>
        validateManagementData(
          {
            campaigns: { [state.campaign.id]: state.campaign },
            characters: { [state.build.id]: { build: state.build, live: state.live, events: [] } },
          },
          registry,
        ),
      ).not.toThrow();
      const sheet = computeSheet(state, registry);
      expect(sheet.spellcasting).toEqual([]);
      const book = spellbookModel(state, sheet, registry);
      expect(book.unsupportedClassIds).toEqual([classId]);
      expect(book.entries.map(({ spell }) => spell.id)).toEqual([
        'spell.fire-bolt',
        'spell.shield',
      ]);
      expect(book.entries[0]?.spell.attack).toBe('ranged');
      for (const entry of book.entries) {
        expect(entry.classId).toBe(classId);
        expect(entry).not.toHaveProperty('dc');
        expect(entry).not.toHaveProperty('attack');
      }
      expect(book.levels).toEqual([0, 1]);
      expect(book.slots).toEqual([]);
      expect(book.classes).toEqual([]);
    },
  );

  it('does not mutate character state, the derived sheet or registry entries', () => {
    const state = character();
    state.build.spells = [{ classId: 'class.sorcerer', known: ['spell.fire-bolt'] }];
    state.build.spellTags = { 'spell.fire-bolt': ['control', 'damage'] };
    const sheet = computeSheet(state, registry);
    const beforeState = structuredClone(state);
    const beforeSheet = structuredClone(sheet);
    const beforeEntries = structuredClone([...registry.entries]);
    const book = spellbookModel(state, sheet, registry);
    expect(state).toEqual(beforeState);
    expect(sheet).toEqual(beforeSheet);
    expect([...registry.entries]).toEqual(beforeEntries);
    expect(book.unsupportedClassIds).toEqual([]);

    // Display arrays also belong to the adapter, rather than its source records.
    expect(book.entries[0]?.spell.attack).toBe('ranged');
    book.entries[0]!.spell.attack = 'melee';
    book.entries[0]!.spell.tags.push('utility');
    book.entries[0]!.spell.lines.push('Display-only line.');
    expect(state).toEqual(beforeState);
    expect([...registry.entries]).toEqual(beforeEntries);
  });

  it('includes selected spell levels through 9 and sorts them with the slot levels', () => {
    const state = character('class.wizard', 1);
    state.build.spells = [{ classId: 'class.wizard', known: ['spell.wish', 'spell.acid-splash'] }];
    const book = model(state);
    expect(book.levels).toEqual([0, 1, 9]);
    expect(book.slots).toEqual([{ level: 1, max: 2, used: 0 }]);
    expect(book.classes[0]).not.toHaveProperty('knownLimit');
  });

  it('keeps spellbook and prepared counts separate without hiding retained prepared entries', () => {
    const state = character('class.wizard', 3);
    state.build.spells = [
      {
        classId: 'class.wizard',
        known: ['spell.mage-hand', 'spell.shield'],
        prepared: ['spell.shield', 'spell.detect-magic'],
      },
    ];
    const book = model(state);
    expect(book.classes[0]).toMatchObject({
      mode: 'spellbook',
      cantrips: 1,
      known: 1,
      prepared: 2,
    });
    expect(book.classes[0]).not.toHaveProperty('knownLimit');
    expect(book.entries.map(({ spell }) => spell.id)).toEqual([
      'spell.mage-hand',
      'spell.detect-magic',
      'spell.shield',
    ]);
  });

  it('deduplicates known and prepared selections within each class and keeps class-specific casting stats', () => {
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
        known: ['spell.mage-hand', 'spell.shield', 'spell.shield'],
        prepared: ['spell.shield', 'spell.detect-magic'],
      },
      { classId: 'class.wizard', known: ['spell.detect-magic'] },
      {
        classId: 'class.sorcerer',
        known: ['spell.mage-hand'],
        prepared: ['spell.mage-hand'],
      },
    ];
    const book = model(state);
    expect(book.entries).toHaveLength(4);
    expect(
      book.entries
        .filter(({ spell }) => spell.id === 'spell.mage-hand')
        .map(({ classId, dc, attack }) => ({ classId, dc, attack })),
    ).toEqual([
      { classId: 'class.sorcerer', dc: 13, attack: 5 },
      { classId: 'class.wizard', dc: 14, attack: 6 },
    ]);
    expect(book.classes.find(({ classId }) => classId === 'class.wizard')).toMatchObject({
      cantrips: 1,
      known: 2,
    });
    expect(book.classes.find(({ classId }) => classId === 'class.sorcerer')).toMatchObject({
      cantrips: 1,
      known: 0,
    });
  });

  it('respects type overrides, including an explicit empty override as Utility', () => {
    const state = character();
    state.build.spells = [
      {
        classId: 'class.sorcerer',
        known: ['spell.fire-bolt', 'spell.fireball', 'spell.mage-hand'],
      },
    ];
    state.build.spellTags = {
      'spell.fire-bolt': [],
      'spell.fireball': ['control', 'damage'],
    };
    const book = model(state);
    expect(book.entries.find(({ spell }) => spell.id === 'spell.fire-bolt')?.spell).toMatchObject({
      type: 'utility',
      tags: ['utility'],
    });
    expect(book.entries.find(({ spell }) => spell.id === 'spell.fireball')?.spell).toMatchObject({
      type: 'control',
      tags: ['control', 'damage'],
    });
    expect(book.entries.find(({ spell }) => spell.id === 'spell.mage-hand')?.spell).toMatchObject({
      type: 'utility',
      tags: ['utility'],
    });
    expect(registry.get('spell', 'spell.fire-bolt').tags).toEqual(['damage']);
    expect(state.build.spellTags['spell.fire-bolt']).toEqual([]);
  });

  it('prefers own summaries and retains every summary outcome, upcast and scaling field', () => {
    const state = character();
    state.build.spells = [{ classId: 'class.sorcerer', known: ['spell.fire-bolt'] }];
    const refs = replacing({
      ...registry.get('spell', 'spell.fire-bolt'),
      summary: {
        effect: 'A test spell effect.',
        fail: 'A failed save outcome.',
        success: 'A successful save outcome.',
        hit: 'A hit outcome.',
        upcast: 'An extra die per higher slot.',
        scaling: 'More dice at later character levels.',
      },
    });
    expect(model(state, refs).entries[0]?.spell.lines).toEqual([
      'A test spell effect.',
      'Fail: A failed save outcome.',
      'Success: A successful save outcome.',
      'Hit: A hit outcome.',
      'Upcast: An extra die per higher slot.',
      'Scaling: More dice at later character levels.',
    ]);
  });

  it('preserves long casting times, materials, source, duration and the entry’s external link', () => {
    const state = character('class.wizard', 13);
    state.build.spells = [
      { classId: 'class.wizard', known: ['spell.identify', 'spell.simulacrum'] },
    ];
    const identify = registry.get('spell', 'spell.identify');
    const refs = replacing({ ...identify, source: 'HB', url: 'https://example.com/identify' });
    const book = model(state, refs);
    expect(book.entries.find(({ spell }) => spell.id === identify.id)?.spell).toMatchObject({
      cost: '1 min',
      school: 'Divination',
      components: `V, S, M (${identify.components.m})`,
      source: 'HB',
      ritual: true,
      duration: identify.duration.text,
      url: 'https://example.com/identify',
    });
    expect(book.entries.find(({ spell }) => spell.id === 'spell.simulacrum')?.spell.cost).toBe(
      '12 h',
    );
  });

  it('uses SRD paragraphs when no summary exists and a 2014 destination when no URL exists', () => {
    const state = character();
    state.build.spells = [{ classId: 'class.sorcerer', known: ['spell.fire-bolt'] }];
    const def = registry.get('spell', 'spell.fire-bolt');
    const spell = model(state).entries[0]?.spell;
    expect(def.summary).toBeUndefined();
    expect(def.url).toBeUndefined();
    expect(spell?.lines).toEqual(def.fullText?.split(/\n\s*\n/));
    expect(spell?.url).toBe('https://www.dndbeyond.com/sources/dnd/basic-rules-2014');
  });
});
