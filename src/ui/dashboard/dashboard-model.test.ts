import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import { computeSheet, type CharacterState } from '../../engine/calc/sheet';
import { createCharacter } from '../../engine/creation';
import { buildRegistry, type Registry } from '../../engine/registry';
import type { FeatureDef } from '../../engine/schema';
import {
  dashboardFavoriteChoices,
  dashboardQuickAccess,
  dashboardResources,
} from './dashboard-model';

function state(): CharacterState {
  return structuredClone(seedFile);
}

function resources(character: CharacterState, refs: Registry = registry) {
  return dashboardResources(character, computeSheet(character, refs), refs);
}

function quickAccess(character: CharacterState, refs: Registry = registry) {
  return dashboardQuickAccess(character, computeSheet(character, refs), refs);
}

function choices(character: CharacterState, refs: Registry = registry) {
  return dashboardFavoriteChoices(character, computeSheet(character, refs), refs);
}

function blank(): CharacterState {
  const campaign = { ...seedFile.campaign, hpMethod: 'average' as const };
  const { build, live } = createCharacter(
    {
      id: 'blank-dashboard-character',
      name: 'Blank character',
      campaign,
      classId: 'class.fighter',
      level: 1,
      raceId: 'race.half-elf',
      backgroundId: 'background.acolyte',
      abilityBases: { STR: 15, DEX: 12, CON: 14, INT: 10, WIS: 13, CHA: 8 },
      racialChoices: ['DEX', 'CON'],
    },
    registry,
  );
  return { campaign, build, live };
}

function extraFeatures(...features: FeatureDef[]): Registry {
  return buildRegistry([[...registry.entries.values(), ...features]], [], []);
}

describe('dashboardResources', () => {
  it('derives the three seed resource groups without duplicating shared uses', () => {
    const groups = resources(state());
    expect(groups.map(({ title }) => title)).toEqual([
      'Spell slots',
      'Features & traits',
      'Hit Dice',
    ]);
    expect(groups[0]?.items).toMatchObject([
      {
        kind: 'slot',
        key: 'slot:1',
        level: 1,
        label: 'Level 1',
        name: 'Level 1 spell slots',
        max: 4,
        used: 4,
        tone: 'magic',
      },
      { kind: 'slot', level: 2, max: 2, used: 0 },
    ]);
    expect(groups[1]?.items).toMatchObject([
      {
        kind: 'feature',
        key: 'feature:feature.bard.bardic-inspiration',
        featureId: 'feature.bard.bardic-inspiration',
        label: 'Bardic Inspiration (d6)',
        name: 'Bardic Inspiration',
        max: 5,
        used: 2,
        tone: 'accent',
      },
    ]);
    expect(groups[1]?.items[0]?.lines).toContain('Uses return after a long rest.');
    expect(groups[2]?.items).toMatchObject([
      {
        kind: 'hit-die',
        key: 'hit-die:d8',
        die: 'd8',
        label: 'd8 Hit Dice',
        name: 'd8 Hit Dice',
        max: 3,
        used: 0,
      },
    ]);
    expect(groups.flatMap(({ items }) => items).every(({ lines }) => lines.length > 1)).toBe(true);
  });

  it('shows actual slot pools despite empty spell selections, including Pact Magic', () => {
    const character = state();
    character.build.spells = [];
    character.build.classes.push({ classId: 'class.warlock', level: 3 });
    character.live.slotsUsed[1] = 9;
    character.live.slotsUsed[9] = 6;
    character.live.pactSlotsUsed = 4;
    const slots = resources(character)[0]?.items;
    expect(slots).toMatchObject([
      { kind: 'slot', level: 1, max: 4, used: 9 },
      { kind: 'slot', level: 2, max: 2, used: 0 },
      {
        kind: 'slot',
        key: 'slot:pact',
        level: 'pact',
        name: 'Pact Magic slots',
        max: 2,
        used: 4,
      },
    ]);
    expect(slots?.[2]?.lines).toContain('These slots cast spells at level 2.');
    expect(slots?.[2]?.lines).toContain('Pact Magic slots return after a short or long rest.');
  });

  it('groups same-die multiclass Hit Dice and preserves raw overspent pools', () => {
    const character = state();
    character.build.classes.push(
      { classId: 'class.cleric', level: 2 },
      { classId: 'class.wizard', level: 1 },
    );
    character.live.hitDiceSpent = { d8: 9, d6: 3, d12: 4 };
    character.live.featureUsesSpent['feature.bard.bardic-inspiration'] = 8;
    const groups = resources(character);
    expect(groups[1]?.items[0]).toMatchObject({ max: 5, used: 8 });
    expect(groups[2]?.items).toMatchObject([
      { die: 'd8', max: 5, used: 9 },
      { die: 'd6', max: 1, used: 3 },
    ]);
    expect(groups[2]?.items[0]?.lines).toContain('0 of 5 left.');
  });

  it('includes owned noncombat pools with derived dice/recharge and an honest zero maximum', () => {
    const character = state();
    const resource: FeatureDef = {
      ...registry.get('feature', 'feature.bard.bardic-inspiration'),
      id: 'feature.test.special-pool',
      name: 'Special pool',
      activation: 'special',
      uses: { max: 0, recharge: 'dawn' },
    };
    delete resource.die;
    character.build.featureIds.push(resource.id);
    character.live.featureUsesSpent[resource.id] = 2;
    const refs = extraFeatures(resource);
    const items = resources(character, refs)[1]?.items;
    expect(items?.[1]).toMatchObject({ label: 'Special pool', max: 0, used: 2 });
    expect(items?.[1]?.lines).toContain('Uses return at dawn.');
    character.build.classes[0]!.level = 5;
    const inspiration = resources(character, refs)[1]?.items[0];
    expect(inspiration?.label).toBe('Bardic Inspiration (d8)');
    expect(inspiration?.lines).toContain('Uses return after a short or long rest.');
  });

  it('derives a blank fighter’s Second Wind and Hit Dice without fixture resources', () => {
    const character = blank();
    const groups = resources(character);
    expect(groups[0]?.items).toEqual([]);
    expect(groups[1]?.items).toMatchObject([{ label: 'Second Wind', max: 1, used: 0 }]);
    expect(groups[2]?.items).toMatchObject([{ die: 'd10', max: 1, used: 0 }]);
    expect(quickAccess(character)).toEqual([]);
  });
});

describe('dashboardQuickAccess', () => {
  it('leaves the seed empty until the player chooses favorites', () => {
    expect(quickAccess(state())).toEqual([]);
  });

  it('deduplicates references in favorite order while retaining each selected spell class', () => {
    const character = state();
    character.build.spells.push({
      classId: 'class.wizard',
      known: ['spell.minor-illusion', 'spell.minor-illusion'],
      prepared: ['spell.minor-illusion'],
    });
    character.build.favorites = [
      'item.rapier',
      'spell.minor-illusion',
      'feature.bard.cutting-words',
      'spell.minor-illusion',
      'item.rapier',
      'race.half-elf',
    ];
    expect(quickAccess(character)).toEqual([
      {
        kind: 'weapon',
        key: 'item:rapier-1',
        id: 'item.rapier',
        name: 'Rapier',
        instanceId: 'rapier-1',
      },
      {
        kind: 'spell',
        key: 'spell:class.bard:spell.minor-illusion',
        id: 'spell.minor-illusion',
        name: 'Minor Illusion (Bard)',
        classId: 'class.bard',
      },
      {
        kind: 'spell',
        key: 'spell:class.wizard:spell.minor-illusion',
        id: 'spell.minor-illusion',
        name: 'Minor Illusion (Wizard)',
        classId: 'class.wizard',
      },
      {
        kind: 'feature',
        key: 'feature:feature.bard.cutting-words',
        id: 'feature.bard.cutting-words',
        name: 'Cutting Words',
        featureId: 'feature.bard.cutting-words',
        actionable: true,
      },
    ]);
  });

  it('retains owned passive/free/special features and marks only combat activations actionable', () => {
    const character = state();
    const free: FeatureDef = {
      ...registry.get('feature', 'feature.false-identity'),
      id: 'feature.test.free',
      name: 'Free feature',
      activation: 'free',
    };
    character.build.featureIds.push(free.id);
    character.build.favorites = [
      'feature.bard.bardic-inspiration',
      'feature.darkvision',
      'feature.bard.song-of-rest',
      free.id,
    ];
    const entries = quickAccess(character, extraFeatures(free));
    expect(entries.map((entry) => entry.kind === 'feature' && entry.actionable)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(entries.map(({ id }) => id)).toEqual(character.build.favorites);
  });

  it('expands duplicate positive-quantity items into stable instances and honors equipped weapons', () => {
    const character = state();
    character.build.items.push({ itemId: 'item.dagger', instanceId: 'dagger-2' });
    character.live.items['dagger-2'] = { qty: 2, equipped: false, attuned: false };
    character.build.items.push({ itemId: 'item.dagger', instanceId: 'dagger-empty' });
    character.live.items['dagger-empty'] = { qty: 0, equipped: true, attuned: false };
    character.build.favorites = ['item.dagger', 'item.flute'];
    const entries = quickAccess(character);
    expect(entries).toMatchObject([
      {
        kind: 'weapon',
        key: 'item:dagger-1',
        name: 'Dagger (dagger-1)',
        instanceId: 'dagger-1',
      },
      {
        kind: 'item',
        key: 'item:dagger-2',
        name: 'Dagger (dagger-2)',
        instanceId: 'dagger-2',
      },
      { kind: 'item', name: 'Flute', instanceId: 'flute-1' },
    ]);
    character.live.items['dagger-2']!.equipped = true;
    expect(quickAccess(character)[1]).toMatchObject({ kind: 'weapon', key: 'item:dagger-2' });
  });

  it('shows retained unselected, unowned, empty-quantity and missing references as unavailable', () => {
    const character = state();
    character.build.favorites = [
      'spell.shield',
      'feature.bard.countercharm',
      'item.lute',
      'item.rapier',
      'item.dagger',
      'spell.missing',
    ];
    character.live.items['rapier-1']!.qty = 0;
    delete character.live.items['dagger-1'];
    const entries = quickAccess(character);
    expect(entries.map(({ kind }) => kind)).toEqual(Array(6).fill('unavailable'));
    expect(entries).toMatchObject([
      { id: 'spell.shield', reason: 'This spell is not selected' },
      { id: 'feature.bard.countercharm', reason: 'You do not have this feature' },
      { id: 'item.lute', reason: 'You do not own this item' },
      { id: 'item.rapier', reason: 'No owned quantity available' },
      { id: 'item.dagger', reason: 'No owned quantity available' },
      { id: 'spell.missing', name: 'spell.missing', reason: 'This reference is unavailable' },
    ]);
    expect(entries.every((entry) => !('classId' in entry) && !('dc' in entry))).toBe(true);
  });
});

describe('dashboardFavoriteChoices', () => {
  it('offers deduplicated selected spells, all owned features and build items plus retained cleanup', () => {
    const character = state();
    character.build.spells.push({ classId: 'class.wizard', known: ['spell.minor-illusion'] });
    character.build.items.push({ itemId: 'item.flute', instanceId: 'empty-flute' });
    character.live.items['rapier-1']!.qty = 0;
    character.build.favorites = [
      'spell.shield',
      'feature.bard.countercharm',
      'item.lute',
      'spell.missing',
      'race.half-elf',
      'spell.shield',
    ];
    const available = choices(character);
    const ids = available.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('spell.minor-illusion');
    expect(ids).toContain('feature.darkvision');
    expect(ids).toContain('feature.bard.song-of-rest');
    expect(ids).toContain('item.flute');
    expect(ids).not.toContain('race.half-elf');
    expect(available).toContainEqual({ id: 'spell.shield', name: 'Shield', note: 'Not selected' });
    expect(available).toContainEqual({
      id: 'feature.bard.countercharm',
      name: 'Countercharm',
      note: 'Not owned',
    });
    expect(available).toContainEqual({ id: 'item.lute', name: 'Lute', note: 'Not owned' });
    expect(available).toContainEqual({
      id: 'item.rapier',
      name: 'Rapier',
      note: 'No quantity available',
    });
    expect(available).toContainEqual({
      id: 'spell.missing',
      name: 'spell.missing',
      note: 'Unavailable reference',
    });
  });

  it('does not manufacture spell or equipment choices for a blank character', () => {
    const available = choices(blank());
    expect(available.length).toBeGreaterThan(0);
    expect(available.every(({ id }) => id.startsWith('feature.'))).toBe(true);
  });

  it('does not mutate character state, derived sheet or reference definitions', () => {
    const character = state();
    character.build.favorites = ['item.rapier', 'spell.minor-illusion', 'race.half-elf'];
    const sheet = computeSheet(character, registry);
    const before = structuredClone({ character, sheet, entries: [...registry.entries] });
    const rows = dashboardResources(character, sheet, registry);
    dashboardQuickAccess(character, sheet, registry);
    const available = dashboardFavoriteChoices(character, sheet, registry);
    rows[1]!.items[0]!.lines.push('Display-only addition');
    available[0]!.name = 'Display-only name';
    expect({ character, sheet, entries: [...registry.entries] }).toEqual(before);
  });
});
