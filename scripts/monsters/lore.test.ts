import { describe, expect, it } from 'vitest';
import { Vocab } from './clean.ts';
import { buildLore, isStatFragment, mendCapsTitle, stripInlineJunk, tidyTitle } from './lore.ts';
import type { FlowLine, LoreFamily } from './segment.ts';

/** Made-up lore: every word the prose and titles below lean on, nothing more. */
const PROSE = [
  'The glimmerkin hide among the reeds and sing to lost travelers until the moon sets over the quiet marsh.',
  'Each spring they weave lanterns from reeds and leave them glowing at the edge of the old hall.',
];

function makeVocab(): Vocab {
  const vocab = new Vocab();
  for (const text of [
    ...PROSE,
    'actions for type, glowing hall, a hag and her bargain, a shrine of stone, a lair of the wyvern',
    'a talisman, the dragon, the marsh remembers all',
    'claw melee weapon attack to hit reach ft one target',
  ]) {
    vocab.addTrusted(text);
  }
  vocab.addBook('ofzorva ofzorva ofzorva');
  return vocab;
}

const line = (t: string, h = 10): FlowLine => ({
  t,
  x: 0,
  y: 0,
  h,
  c: 0,
  page: 4,
  lore: true,
  big: false,
});

describe('lore line checks', () => {
  it('spots stat block lines that leaked into the lore', () => {
    expect(isStatFragment('Armor Class 15 (natural armor)')).toBe(true);
    expect(isStatFragment('Hit Points 22 (4d8 + 4)')).toBe(true);
    expect(isStatFragment('STR DEX CON INT WIS CHA')).toBe(true);
    expect(isStatFragment('Medium fey, chaotic neutral')).toBe(true);
    expect(isStatFragment('Languages. Their tongue is old and slow.')).toBe(false);
    expect(isStatFragment('The glimmerkin hide among the reeds.')).toBe(false);
  });

  it('drops rule and leader marks but keeps dashes and ellipses', () => {
    expect(stripInlineJunk('they sing ~~~~- softly ••• tonight')).toBe('they sing softly tonight');
    expect(stripInlineJunk('they wait — and ... watch')).toBe('they wait — and ... watch');
  });

  it('tidies digits, dots and marks in capitals titles', () => {
    expect(tidyTitle('K0B0LD1S DEN')).toBe("KOBOLD'S DEN");
    expect(tidyTitle('BOG·HAG')).toBe('BOG-HAG');
    expect(tidyTitle('VARIANT! BOG FAMILIAR')).toBe('VARIANT: BOG FAMILIAR');
    expect(tidyTitle("~ WIGHT 'S CALL .")).toBe("WIGHT'S CALL");
  });
});

describe('mendCapsTitle', () => {
  const vocab = makeVocab();

  it('joins split words and keeps possessives', () => {
    expect(mendCapsTitle('ACT IONS FOR T Y PE', vocab)).toBe('ACTIONS FOR TYPE');
    expect(mendCapsTitle("HAG's BARGAIN", vocab)).toBe("HAG'S BARGAIN");
  });

  it('reads a small l among capitals as I, unless the l spells a word', () => {
    expect(mendCapsTitle('GLOWlNG HAlL', vocab)).toBe('GLOWING HALL');
  });

  it('mends a lone misread letter but keeps plurals and book-only glued words apart', () => {
    expect(mendCapsTitle('THE DkAGON', vocab)).toBe('THE DRAGON');
    expect(mendCapsTitle('TALISMANS', vocab)).toBe('TALISMANS');
    expect(mendCapsTitle('SHRINE OF ZORVA', vocab)).toBe('SHRINE OF ZORVA');
  });

  it('leaves titles that are not in capitals alone', () => {
    expect(mendCapsTitle('Glowlng Hall', vocab)).toBe('Glowlng Hall');
  });
});

describe('buildLore', () => {
  const vocab = makeVocab();
  const family = (sections: LoreFamily['sections'], title = 'GLIMMERKIN'): LoreFamily => ({
    title,
    page: 4,
    sections,
  });
  const prose = () => [line(PROSE[0]!), line(PROSE[1]!)];

  it('drops margin quotes, stat lines and stat-only or garbled sections', () => {
    const [lore] = buildLore(
      [
        family([
          { lines: [line(PROSE[0]!), line('THE MARSH REMEMBERS ALL', 7), line('Armor Class 13')] },
          { title: 'Hit Points 9 (2d8)', lines: prose() },
          { title: 'MARSH', lines: [line('ir ~ ow C Ross T')] },
          { lines: [line('Claw. Melee Weapon Attack: +4 to hit, reach 5 ft., one target.')] },
        ]),
      ],
      vocab,
      ['Glimmerkin'],
    );
    expect(lore!.sections).toEqual([{ text: PROSE[0] }]);
  });

  it('drops signature, page-header and credit titles but keeps their text', () => {
    const [lore] = buildLore(
      [
        family([
          { title: '— Old Wren', lines: prose() },
          { title: '214 CREATURES', lines: prose() },
          { title: 'BRISKOV', lines: prose() },
        ]),
      ],
      vocab,
      ['Glimmerkin'],
    );
    expect(lore!.sections.map((section) => section.title)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(lore!.sections).toHaveLength(3);
  });

  it("keeps a creature's name as a title and repairs a damaged name at a title's end", () => {
    const [lore] = buildLore(
      [
        family([
          { title: 'WISPLING', lines: prose() },
          { title: 'LAIR OF THE GLIMNERKIN', lines: prose() },
        ]),
      ],
      vocab,
      ['Glimmerkin', 'Wispling'],
    );
    expect(lore!.sections.map((section) => section.title)).toEqual([
      'WISPLING',
      'LAIR OF THE GLIMMERKIN',
    ]);
  });

  it('keeps one entry for each family, even one left with no sections', () => {
    const lore = buildLore(
      [
        family([{ lines: prose() }]),
        family([{ lines: [line('Armor Class 12')] }], 'MARSH WISPS'),
        { page: 4, sections: [{ lines: prose() }] },
      ],
      vocab,
    );
    expect(lore).toHaveLength(3);
    expect(lore[1]).toEqual({ title: 'MARSH WISPS', page: 4, sections: [] });
    expect(lore[2]).toEqual({ page: 4, sections: [{ text: PROSE.join(' ') }] });
  });
});
