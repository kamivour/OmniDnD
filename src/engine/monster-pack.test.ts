import { describe, expect, it } from 'vitest';
import { buildRegistry, characterRegistry, withMonsterPack } from './registry';
import { MonsterPackSchema, type CreatureDef, type MonsterPack } from './schema';

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
  actions: [{ name: 'Bite', text: 'A made-up bite.', attackBonus: 4 }],
  reactions: [],
  legendaryActions: [],
  ...extra,
});

const pack = (overrides: Partial<MonsterPack> = {}): MonsterPack => ({
  format: 1,
  version: 'test',
  extractedAt: '2026-11-26',
  canary: 'test-canary',
  creatures: [
    creature('creature.test-new', {
      source: 'MPMM',
      books: [
        { source: 'VGM', page: 3 },
        { source: 'MPMM', page: 4 },
      ],
      loreIds: ['lore.vgm.1'],
      bonusActions: [{ name: 'Dash', text: 'A made-up dash.' }],
    }),
  ],
  lore: [
    {
      id: 'lore.vgm.1',
      source: 'VGM',
      page: 2,
      title: 'Test family',
      sections: [{ text: 'Made-up lore.' }],
    },
  ],
  supplements: [{ id: 'creature.test-bundled', books: [{ source: 'MM', page: 7 }] }],
  ...overrides,
});

const base = () =>
  buildRegistry([[creature('creature.test-bundled', { srd: true, source: 'MM' })]], [], []);

describe('MonsterPackSchema', () => {
  it('accepts a well-formed pack', () => {
    expect(MonsterPackSchema.safeParse(pack()).success).toBe(true);
  });

  it('rejects SRD flags, missing books, unknown lore and duplicate ids', () => {
    const bad = pack({
      creatures: [
        creature('creature.a', { srd: true, books: [{ source: 'MM', page: 1 }] }),
        creature('creature.b'),
        creature('creature.c', { books: [{ source: 'MM', page: 1 }], loreIds: ['lore.none'] }),
        creature('creature.c', { books: [{ source: 'MM', page: 2 }] }),
      ],
    });
    const result = MonsterPackSchema.safeParse(bad);
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((issue) => issue.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        'Pack creatures are not SRD',
        'Pack creatures list their books',
        'Unknown lore lore.none',
        'Duplicate id creature.c',
      ]),
    );
  });

  it('rejects another format version', () => {
    expect(MonsterPackSchema.safeParse({ ...pack(), format: 2 }).success).toBe(false);
  });
});

describe('withMonsterPack', () => {
  it('adds pack creatures and tags bundled ones without changing their stats', () => {
    const { registry, skipped } = withMonsterPack(base(), pack());
    expect(skipped).toEqual([]);
    expect(registry.get('creature', 'creature.test-new').bonusActions).toHaveLength(1);
    const bundled = registry.get('creature', 'creature.test-bundled');
    expect(bundled.srd).toBe(true);
    expect(bundled.books).toEqual([{ source: 'MM', page: 7 }]);
    expect(bundled.hp).toBe(9);
  });

  it('skips ids that are taken and supplements for unknown creatures', () => {
    const { registry, skipped } = withMonsterPack(
      base(),
      pack({
        creatures: [creature('creature.test-bundled', { books: [{ source: 'MM', page: 1 }] })],
        supplements: [{ id: 'creature.missing', books: [{ source: 'MM', page: 1 }] }],
      }),
    );
    expect(skipped).toEqual(['creature.missing', 'creature.test-bundled']);
    expect(registry.get('creature', 'creature.test-bundled').srd).toBe(true);
  });

  it('leaves the base registry alone and gives characters a fresh view', () => {
    const start = base();
    const { registry } = withMonsterPack(start, pack());
    expect(start.entries.has('creature.test-new')).toBe(false);
    const scoped = characterRegistry(registry, { customItems: [] });
    expect(scoped.entries.has('creature.test-new')).toBe(true);
  });
});
