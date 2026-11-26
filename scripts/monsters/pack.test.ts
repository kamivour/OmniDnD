import { describe, expect, it } from 'vitest';
import type { NamedCreature } from './identify.ts';
import { buildPack, PACK_CANARY, type PackBookInput } from './pack.ts';
import type { ValidatedCreature } from './validate.ts';

/** Made-up stat blocks only: the repo is public and book text stays private. */
const creature = (name: string, extra: Partial<NamedCreature> = {}): NamedCreature => ({
  name,
  page: 20,
  printed: 10,
  size: 'medium',
  creatureType: 'monstrosity',
  alignment: 'unaligned',
  ac: 13,
  hp: 22,
  hpFormula: '4d8 + 4',
  speed: { walk: 30 },
  abilities: { STR: 14, DEX: 12, CON: 12, INT: 3, WIS: 10, CHA: 6 },
  saves: {},
  skills: {},
  vulnerabilities: [],
  resistances: [],
  immunities: [],
  conditionImmunities: [],
  senses: {},
  languages: '',
  cr: 1,
  intros: {},
  issues: [],
  traits: [{ name: 'Made Up', text: 'A made-up trait.' }],
  actions: [
    {
      name: 'Claw',
      text: 'A made-up claw.',
      attackBonus: 4,
      damage: [
        { dice: '1d6 + 2', type: 'slashing' },
        { dice: 'lots', type: 'fire' },
      ],
    },
    { name: 'Empty', text: '  ' },
  ],
  bonusActions: [],
  reactions: [],
  legendaryActions: [],
  mythicActions: [],
  lairActions: [],
  ...extra,
});

const record = (c: NamedCreature, blocking: string[] = []): ValidatedCreature => ({
  creature: c,
  findings: blocking.map((message) => ({ code: 'x', severity: 'blocking', message })),
});

const book = (
  name: PackBookInput['book'],
  records: ValidatedCreature[],
  lore: PackBookInput['lore'] = [],
): PackBookInput => ({ book: name, offset: 10, records, lore });

const build = (books: PackBookInput[], aliases?: Record<string, string>) =>
  buildPack({
    books,
    srd: [{ id: 'creature.test-wolf', name: 'Test Wolf' }],
    ...(aliases && { aliases }),
    extractedAt: '2026-11-26',
  });

describe('buildPack', () => {
  it('turns a parsed block into a clean creature with derived numbers', () => {
    const { pack, manifest } = build([book('VGM', [record(creature('Test Gnasher'))])]);
    expect(pack.canary).toBe(PACK_CANARY);
    const [made] = pack.creatures;
    expect(made).toMatchObject({
      id: 'creature.test-gnasher',
      source: 'VGM',
      srd: false,
      hpFormula: '4d8+4',
      xp: 200,
      proficiencyBonus: 2,
      languages: '—',
      senses: { passivePerception: 10 },
      books: [{ source: 'VGM', page: 10 }],
    });
    expect(made!.actions).toEqual([
      {
        name: 'Claw',
        text: 'A made-up claw.',
        attackBonus: 4,
        damage: [{ dice: '1d6+2', type: 'slashing' }],
      },
    ]);
    expect(made!.bonusActions).toBeUndefined();
    expect(manifest.books.VGM).toMatchObject({ blocks: 1, used: 1 });
  });

  it('merges reprints, takes the newest stats and lists every book', () => {
    const { pack } = build([
      book(
        'MPMM',
        [record(creature('Test Gnasher', { ac: 15, printed: 40, family: 0 }))],
        [{ title: 'TEST GNASHERS', page: 49, sections: [{ text: 'Shared lore.' }] }],
      ),
      book(
        'VGM',
        [record(creature('Test Gnasher', { ac: 13, family: 0 }))],
        [{ page: 19, sections: [{ text: 'Shared lore.' }, { text: 'Older lore only.' }] }],
      ),
    ]);
    expect(pack.creatures).toHaveLength(1);
    expect(pack.creatures[0]).toMatchObject({
      source: 'MPMM',
      ac: 15,
      books: [
        { source: 'VGM', page: 10 },
        { source: 'MPMM', page: 40 },
      ],
    });
    // The newer book's repeat of a paragraph is dropped, so only the older family is kept.
    expect(pack.creatures[0]!.loreIds).toEqual(['lore.vgm.0']);
    expect(pack.lore).toEqual([
      {
        id: 'lore.vgm.0',
        source: 'VGM',
        page: 9,
        sections: [{ text: 'Shared lore.' }, { text: 'Older lore only.' }],
      },
    ]);
  });

  it('falls back to an older printing when the newest one cannot be read, and flags it', () => {
    const { pack, manifest } = build([
      book('MTF', [record(creature('Test Gnasher'))]),
      book('MPMM', [record(creature('Test Gnasher', { creatureType: undefined }))]),
    ]);
    expect(pack.creatures[0]!.source).toBe('MTF');
    expect(pack.creatures[0]!.review?.[0]).toContain('MPMM copy could not be read');
    expect(manifest.fallbacks).toEqual(['Test Gnasher']);
  });

  it('leaves out blocks no copy can fill and keeps blocking notes on the rest', () => {
    const { pack, manifest } = build([
      book('MM', [
        record(creature('Test Broken', { cr: undefined })),
        record(creature('Test Doubtful'), ['Armor Class looks wrong.']),
        record(creature(undefined as unknown as string, { name: undefined })),
      ]),
    ]);
    expect(pack.creatures.map((c) => c.name)).toEqual(['Test Doubtful']);
    expect(pack.creatures[0]!.review).toEqual(['Armor Class looks wrong.']);
    expect(manifest.excluded).toMatchObject([{ name: 'Test Broken', books: ['MM'] }]);
    expect(manifest.books.MM).toMatchObject({ blocks: 3, unnamed: 1, used: 1 });
  });

  it('tags bundled SRD creatures instead of copying their stats, and applies renames', () => {
    const { pack } = build(
      [
        book(
          'MM',
          [record(creature('Test Wolf', { family: 0 }))],
          [{ page: 15, sections: [{ text: 'Wolf lore.' }] }],
        ),
        book('VGM', [record(creature('Old Gnasher'))]),
        book('MPMM', [record(creature('New Gnasher', { printed: 30 }))]),
      ],
      { 'Old Gnasher': 'New Gnasher' },
    );
    expect(pack.supplements).toEqual([
      { id: 'creature.test-wolf', books: [{ source: 'MM', page: 10 }], loreIds: ['lore.mm.0'] },
    ]);
    expect(pack.creatures.map((c) => [c.name, c.books?.length])).toEqual([['New Gnasher', 2]]);
  });

  it('marks generic NPC blocks and keeps a stable version for the same input', () => {
    const input = [
      book('VGM', [record(creature('Test Mage', { creatureType: 'humanoid (any race)' }))]),
    ];
    const first = build(input);
    expect(first.pack.creatures[0]!.npc).toBe(true);
    expect(build(input).pack.version).toBe(first.pack.version);
  });
});
