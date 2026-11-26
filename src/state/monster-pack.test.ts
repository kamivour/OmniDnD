import { describe, expect, it } from 'vitest';
import * as data from '../data/registry';
import { MONSTER_PACK_FORMAT, type MonsterPack } from '../engine/schema';
import { checkPack, readPackFile } from './monster-pack';

/** A made-up pack: the repo is public and real pack text stays private. */
const pack: MonsterPack = {
  format: MONSTER_PACK_FORMAT,
  version: 'test',
  extractedAt: '2026-11-26',
  canary: 'test-canary',
  creatures: [
    {
      kind: 'creature',
      id: 'creature.test-gnasher',
      name: 'Test Gnasher',
      ruleset: '5e-2014',
      source: 'VGM',
      srd: false,
      size: 'medium',
      creatureType: 'monstrosity',
      alignment: 'unaligned',
      ac: 13,
      hp: 22,
      hpFormula: '4d8+4',
      speed: { walk: 30 },
      abilities: { STR: 14, DEX: 12, CON: 12, INT: 3, WIS: 10, CHA: 6 },
      vulnerabilities: [],
      resistances: [],
      immunities: [],
      conditionImmunities: [],
      senses: { passivePerception: 10 },
      languages: '—',
      cr: 1,
      xp: 200,
      proficiencyBonus: 2,
      traits: [],
      actions: [{ name: 'Bite', text: 'A made-up bite.' }],
      reactions: [],
      legendaryActions: [],
      books: [{ source: 'VGM', page: 10 }],
    },
  ],
  lore: [],
  supplements: [],
};

describe('monster pack files', () => {
  it('accepts a valid pack', () => {
    expect(readPackFile(JSON.stringify(pack))).toEqual({ pack });
  });

  it('explains files that are not a pack, or not this format', () => {
    expect(readPackFile('not json')).toEqual({ error: expect.stringContaining('not a monster') });
    expect(checkPack({ characters: [] })).toEqual({ error: expect.stringContaining('not a') });
    expect(checkPack({ ...pack, format: 2 })).toEqual({
      error: expect.stringContaining('different app version'),
    });
    // A pack from a version before the canary still gets the version message.
    const older: Record<string, unknown> = { ...pack };
    delete older.canary;
    expect(checkPack({ ...older, format: 0 })).toEqual({
      error: expect.stringContaining('different app version'),
    });
    expect(checkPack(older)).toEqual({ error: expect.stringContaining('not a monster') });
    const broken = { ...pack, creatures: [{ ...pack.creatures[0], hp: 0 }] };
    expect(checkPack(broken)).toEqual({ error: expect.stringContaining('creatures.0.hp') });
  });

  it('swaps the live registry and restores the bundled data', () => {
    expect(data.registry.entries.has('creature.test-gnasher')).toBe(false);
    data.setMonsterPack(pack);
    expect(data.registry.get('creature', 'creature.test-gnasher').name).toBe('Test Gnasher');
    expect(data.bundledRegistry.entries.has('creature.test-gnasher')).toBe(false);
    data.setMonsterPack(undefined);
    expect(data.registry).toBe(data.bundledRegistry);
  });
});
