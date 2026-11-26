import { describe, expect, it } from 'vitest';
import {
  CR_STEPS,
  creatureBaseType,
  matchesMonster,
  monsterEntries,
  searchMonsters,
} from './bestiary';
import { buildRegistry } from './registry';
import type { CreatureDef } from './schema';

/** Made-up stat blocks only: the repo is public and pack contents are private. */
const creature = (id: string, extra: Partial<CreatureDef> = {}): CreatureDef => ({
  kind: 'creature',
  id,
  name: 'Test Beast',
  ruleset: '5e-2014',
  source: 'MM',
  srd: false,
  size: 'medium',
  creatureType: 'beast',
  alignment: 'unaligned',
  ac: 12,
  hp: 9,
  hpFormula: '2d8',
  speed: { walk: 30 },
  abilities: { STR: 10, DEX: 14, CON: 10, INT: 2, WIS: 12, CHA: 5 },
  vulnerabilities: [],
  resistances: [],
  immunities: [],
  conditionImmunities: [],
  senses: { passivePerception: 11 },
  languages: '—',
  cr: 0.25,
  xp: 50,
  proficiencyBonus: 2,
  traits: [],
  actions: [{ name: 'Bite', text: 'A made-up bite.' }],
  reactions: [],
  legendaryActions: [],
  ...extra,
});

const gnasher = creature('creature.test-gnasher', { name: 'Test Gnasher', cr: 2 });
const wyrm = creature('creature.test-wyrm', {
  name: 'Ancient Test Wyrm',
  size: 'gargantuan',
  creatureType: 'dragon',
  cr: 20,
  legendaryActions: [{ name: 'Tail', text: 'A made-up tail.' }],
});
const sage = creature('creature.test-sage', {
  name: 'Test Sage',
  source: 'MPMM',
  books: [
    { source: 'VGM', page: 3 },
    { source: 'MPMM', page: 4 },
  ],
  size: 'medium',
  sizes: ['medium', 'small'],
  creatureType: 'humanoid (any race)',
  npc: true,
  cr: 0.5,
});
const swarm = creature('creature.test-swarm', {
  name: 'Swarm of Test Moths',
  source: 'VGM',
  books: [{ source: 'VGM', page: 9 }],
  creatureType: 'swarm of Tiny monstrosities',
  cr: 0,
});
const registry = buildRegistry([[gnasher, wyrm, sage, swarm]], [], []);
const names = (list: readonly CreatureDef[]) => list.map((c) => c.name);

describe('bestiary', () => {
  it('reads the base type from a type line', () => {
    expect(creatureBaseType('humanoid (goblinoid)')).toBe('humanoid');
    expect(creatureBaseType('swarm of Tiny beasts')).toBe('beast');
    expect(creatureBaseType('swarm.of.tiny monstrosities')).toBe('monstrosity');
    expect(creatureBaseType('Undead')).toBe('undead');
    expect(creatureBaseType('&east')).toBe('other');
  });

  it('lists every creature, or only those in the campaign books', () => {
    expect(monsterEntries(registry)).toHaveLength(4);
    // The Monster Manual is always on; the sage shows through either of its books.
    expect(names(searchMonsters(registry, {}, 'name', { sources: ['PHB'] }))).toEqual([
      'Ancient Test Wyrm',
      'Test Gnasher',
    ]);
    expect(names(searchMonsters(registry, {}, 'name', { sources: ['PHB', 'VGM'] }))).toHaveLength(
      4,
    );
  });

  it('filters by name, challenge, type, size, book, legendary and NPC', () => {
    const run = (filter: Parameters<typeof matchesMonster>[1]) =>
      names(searchMonsters(registry, filter));
    expect(run({ text: 'test  GNASH' })).toEqual(['Test Gnasher']);
    expect(run({ crMin: 0.5, crMax: 2 })).toEqual(['Test Gnasher', 'Test Sage']);
    expect(run({ types: ['monstrosity', 'dragon'] })).toEqual([
      'Ancient Test Wyrm',
      'Swarm of Test Moths',
    ]);
    expect(run({ sizes: ['small'] })).toEqual(['Test Sage']);
    expect(run({ books: ['VGM'] })).toEqual(['Swarm of Test Moths', 'Test Sage']);
    expect(run({ legendary: true })).toEqual(['Ancient Test Wyrm']);
    expect(run({ npc: true })).toEqual(['Test Sage']);
  });

  it('sorts by name or by challenge then name', () => {
    expect(names(searchMonsters(registry, {}, 'cr'))).toEqual([
      'Swarm of Test Moths',
      'Test Sage',
      'Test Gnasher',
      'Ancient Test Wyrm',
    ]);
    expect(CR_STEPS.slice(0, 5)).toEqual([0, 0.125, 0.25, 0.5, 1]);
    expect(CR_STEPS.at(-1)).toBe(30);
  });
});
