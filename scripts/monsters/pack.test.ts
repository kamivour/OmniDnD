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
        [
          {
            title: 'Test Gnashers',
            page: 19,
            sections: [{ text: 'Shared lore.' }, { text: 'Older lore only.' }],
          },
        ],
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
        title: 'Test Gnashers',
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

  it('flags lost text and odd spell save DCs, but not other math checks', () => {
    const review = (code: string, message: string) => ({
      code,
      severity: 'review' as const,
      message,
    });
    const { pack, manifest } = build([
      book('MM', [
        {
          creature: creature('Test Gnasher'),
          findings: [
            review('parse:0', 'ACTIONS heading missing'),
            review('parse:1', 'text before the first entry: "can see in the dark"'),
            review('parse:2', 'skill not read: "Stealth +4 Perc"'),
            review('actions:0:Claw:attack', 'Claw: attack bonus was not read.'),
            review(
              'traits:1:Spellcasting:spell-dc',
              'traits:1:Spellcasting:spell-dc: read 12, expected 13.',
            ),
            review('skill:stealth', 'skill:stealth: read 6, expected 4 or 6.'),
            review('parse:3', 'no heading; name taken from the index by page'),
          ],
        },
      ]),
    ]);
    expect(pack.creatures[0]!.review).toEqual([
      'The Actions heading was not found, so some actions may be listed as traits.',
      'A trait lost its name or first words: "can see in the dark".',
      'Part of the skill line was not read: "Stealth +4 Perc".',
      'Claw: the attack bonus was not read.',
      "Spellcasting: the spell save DC reads 12, but the block's numbers give 13.",
    ]);
    expect(manifest.flagged).toBe(1);
  });

  it('tags bundled SRD creatures instead of copying their stats, and applies renames', () => {
    const { pack } = build(
      [
        book(
          'MM',
          [
            record(creature('Test Wolf', { family: 0 })),
            record(creature('Test Gnawer', { printed: 12, family: 1 })),
          ],
          [
            { title: 'Test Wolf', page: 15, sections: [{ text: 'Wolf lore.' }] },
            // Lore whose heading OCR lost belongs to no one.
            { page: 17, sections: [{ text: 'Lore of something else.' }] },
          ],
        ),
        book('VGM', [record(creature('Old Gnasher'))]),
        book('MPMM', [record(creature('New Gnasher', { printed: 30 }))]),
      ],
      { 'Old Gnasher': 'New Gnasher' },
    );
    expect(pack.supplements).toEqual([
      { id: 'creature.test-wolf', books: [{ source: 'MM', page: 10 }], loreIds: ['lore.mm.0'] },
    ]);
    expect(pack.creatures.map((c) => [c.name, c.books?.length, c.loreIds])).toEqual([
      ['New Gnasher', 2, undefined],
      ['Test Gnawer', 1, undefined],
    ]);
  });

  it('gives SRD forms and variants their parent block page and lore, with no duplicate', () => {
    const { pack } = buildPack({
      books: [
        book(
          'MM',
          [
            record(creature('Werebadger', { family: 0 })),
            record(creature('Test Wolf', { printed: 11 })),
            record(creature('Swarm of Insects', { printed: 12 })),
          ],
          [{ title: 'Werebadger', page: 15, sections: [{ text: 'Badger lore.' }] }],
        ),
      ],
      srd: [
        { id: 'creature.werebadger-badger', name: 'Werebadger, Badger Form' },
        { id: 'creature.werebadger-human', name: 'Werebadger, Human Form' },
        { id: 'creature.test-wolf', name: 'Test Wolf' },
        { id: 'creature.test-wolf-rabid', name: 'Test Wolf (Rabid)' },
        { id: 'creature.swarm-of-insects', name: 'Swarm of Insects' },
        { id: 'creature.swarm-of-wasps', name: 'Swarm of Wasps' },
      ],
      extractedAt: '2026-11-26',
    });
    expect(pack.creatures).toEqual([]);
    expect(pack.supplements.map((s) => [s.id, s.books?.[0]?.page, s.loreIds])).toEqual([
      ['creature.swarm-of-insects', 12, undefined],
      ['creature.swarm-of-wasps', 12, undefined],
      ['creature.test-wolf', 11, undefined],
      ['creature.test-wolf-rabid', 11, undefined],
      ['creature.werebadger-badger', 10, ['lore.mm.0']],
      ['creature.werebadger-human', 10, ['lore.mm.0']],
    ]);
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
