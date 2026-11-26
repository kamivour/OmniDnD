import { describe, expect, it } from 'vitest';
import { Vocab } from './clean.ts';
import {
  assignFamilies,
  cleanName,
  nameBlocks,
  selfName,
  titleCase,
  type NamedCreature,
} from './identify.ts';
import type { ParsedCreature } from './parse.ts';
import type { LoreFamily } from './segment.ts';

/** A made-up parsed block with empty lists; tests fill what they need. */
function creature(extra: Partial<ParsedCreature> = {}): ParsedCreature {
  return {
    page: 10,
    speed: {},
    abilities: {},
    saves: {},
    skills: {},
    vulnerabilities: [],
    resistances: [],
    immunities: [],
    conditionImmunities: [],
    senses: {},
    traits: [],
    actions: [],
    bonusActions: [],
    reactions: [],
    legendaryActions: [],
    mythicActions: [],
    lairActions: [],
    intros: {},
    issues: [],
    ...extra,
  };
}

function makeVocab(): Vocab {
  const vocab = new Vocab();
  vocab.addTrusted('the eye of a spectator; the creature can bite and the target falls');
  return vocab;
}

describe('titleCase', () => {
  it('capitalizes each word, keeping small words lower inside a name', () => {
    expect(titleCase('ADULT BLACK DRAGON')).toBe('Adult Black Dragon');
    expect(titleCase('EYE OF THE DEEP')).toBe('Eye of the Deep');
    expect(titleCase('GIANT (FIRE)')).toBe('Giant (Fire)');
    expect(titleCase('THE MIRE TOAD')).toBe('The Mire Toad');
  });
});

describe('cleanName', () => {
  const vocab = makeVocab();

  it('joins a split name when the whole is a known word', () => {
    expect(cleanName('S pec tator', vocab)).toBe('Spectator');
  });

  it('closes a spaced hyphen and splits glued words', () => {
    expect(cleanName('Mud -hopper', vocab)).toBe('Mud-hopper');
    expect(cleanName('Eye ofGruumsh', vocab)).toBe('Eye of Gruumsh');
  });

  it('drops a stray single letter and fixes a one-letter slip', () => {
    expect(cleanName('Spectator l', vocab)).toBe('Spectator');
    expect(cleanName('Spectatar', vocab)).toBe('Spectator');
  });

  it('never turns a name into the plural the text uses', () => {
    const local = makeVocab();
    local.addBook('toad collectors toad collectors toad collectors');
    expect(cleanName('Toad Collector', local)).toBe('Toad Collector');
  });

  it('puts back a letter split off the end of a word', () => {
    const local = makeVocab();
    local.addTrusted('a mire toad and a bog hound');
    expect(cleanName('Mir e-toad Elder', local)).toBe('Mire-toad Elder');
    expect(cleanName('Bog-houn d', local)).toBe('Bog-hound');
  });

  it('never glues a small word to the capital after it, even when OCR often does', () => {
    const local = makeVocab();
    local.addBook('ofzorg ofzorg ofzorg');
    expect(cleanName('Priest ofZorg', local)).toBe('Priest of Zorg');
    expect(cleanName('Priest of Zorg', local)).toBe('Priest of Zorg');
  });

  it('starts each word but a small one with a capital', () => {
    expect(cleanName('Eye of the spectator', vocab)).toBe('Eye of the Spectator');
    expect(cleanName('Yuan-ti spectator', vocab)).toBe('Yuan-ti Spectator');
  });
});

describe('selfName', () => {
  it('finds the word a block uses for itself', () => {
    const block = creature({
      traits: [
        { name: 'Keen Nose', text: 'The jackalwere smells prey. The creature can track it.' },
      ],
      actions: [{ name: 'Bite', text: "The jackalwere's bite drags the target down." }],
    });
    expect(selfName(block, makeVocab())).toBe('Jackalwere');
  });
});

describe('nameBlocks', () => {
  const vocab = makeVocab();

  it('names headed blocks from the index, and slips from known stats', () => {
    const [toad, hound] = nameBlocks(
      [
        creature({ heading: 'MIRE TOAD', printed: 41 }),
        creature({ heading: 'BOG HOUNO', printed: 52, hp: 11 }),
      ],
      [{ name: 'Mire Toad', page: 41 }],
      [{ name: 'Bog Hound', hp: 11 }],
      vocab,
    );
    expect(toad!.name).toBe('Mire Toad');
    expect(toad!.issues).toEqual([]);
    expect(hound!.name).toBe('Bog Hound');
    expect(hound!.issues).toEqual(['heading "BOG HOUNO" is not in the book\'s index']);
  });

  it('keeps the index capitals but takes the heading when the index lost a space', () => {
    const [toad, swarm, hound, collector] = nameBlocks(
      [
        creature({ heading: 'MIRE-TOAD', printed: 41 }),
        creature({ heading: 'SWARM OF MIRE TOADS', printed: 42 }),
        creature({ heading: 'BOG HOUND •, ~', printed: 43 }),
        creature({ heading: 'TOAD COLLECT OR', printed: 44 }),
      ],
      [
        { name: 'Mire-toad', page: 41 },
        { name: 'Swarm ofmire toads', page: 42 },
        { name: 'Bog hound', page: 43 },
        { name: 'Toad Collector', page: 44 },
      ],
      [],
      vocab,
    );
    expect(toad!.name).toBe('Mire-toad');
    expect(swarm!.name).toBe('Swarm of Mire Toads');
    expect(hound!.name).toBe('Bog Hound');
    expect(collector!.name).toBe('Toad Collector');
  });

  it('names a block with no heading by page, then by known stats, then by its own text', () => {
    const named = nameBlocks(
      [
        creature({ printed: 60, hp: 7 }),
        creature({ printed: 90, ac: 13, hp: 22, cr: 1 }),
        creature({ printed: 95, traits: [{ name: 'Howl', text: 'The jackalwere howls.' }] }),
        creature({ printed: 99 }),
      ],
      [{ name: 'Dust Wisp', page: 60 }],
      [
        { name: 'Dust Wisp', hp: 7 },
        { name: 'Ash Hound', ac: 13, hp: 22, cr: 1 },
      ],
      vocab,
    );
    expect(named.map((block: NamedCreature) => block.name)).toEqual([
      'Dust Wisp',
      'Ash Hound',
      'Jackalwere',
      undefined,
    ]);
    expect(named.map((block) => block.issues)).toEqual([
      ['no heading; name taken from the index by page'],
      ['name "Ash Hound" taken from known stats (AC, hit points, challenge)'],
      ['no heading; name "Jackalwere" taken from how its text refers to itself'],
      ['no heading and no index name fits'],
    ]);
  });
});

describe('assignFamilies', () => {
  it('moves a block to the nearby family whose title its name holds, longest title first', () => {
    const families: LoreFamily[] = [
      { title: 'DRAGONS', page: 10, sections: [] },
      { title: 'BLACK DRAGON', page: 12, sections: [] },
    ];
    const blocks: NamedCreature[] = [
      { ...creature({ page: 13, family: 0 }), name: 'Adult Black Dragon' },
      { ...creature({ page: 13, family: 0 }), name: 'Mire Toad' },
      { ...creature({ page: 20, family: 0 }), name: 'Black Dragon Wyrmling' },
    ];
    assignFamilies(blocks, families);
    expect(blocks.map((block) => block.family)).toEqual([1, 0, 0]);
  });
});
