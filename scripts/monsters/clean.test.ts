import { describe, expect, it } from 'vitest';
import {
  Vocab,
  fixDice,
  fixNumbers,
  fixWords,
  glueSplit,
  joinLines,
  stripTrailingJunk,
  tidy,
  toNumber,
} from './clean.ts';

/** A small made-up vocabulary: every word and pair the tests lean on, nothing else. */
function makeVocab(): Vocab {
  const vocab = new Vocab();
  for (const text of [
    'and one more, and one done',
    'it fails a test, fails a check, fails a save; a fail',
    'the beast regains its breath there',
    'a polearm and a wyvern',
    'melee slash slashing',
    'an arm, or a leg; armor armor armor natural',
    'leaps in to the pool, in to the pit, into the pond, into it',
    'of the creature; it exhales',
    'three barghests at the window, a win',
    'a soul devouring blade',
  ]) {
    vocab.addTrusted(text);
  }
  vocab.addBook('sa sa sa');
  return vocab;
}

describe('Vocab', () => {
  const vocab = makeVocab();

  it('treats single letters other than a and I as non-words', () => {
    expect(vocab.isTrusted('a')).toBe(true);
    expect(vocab.isTrusted('I')).toBe(true);
    expect(vocab.isTrusted('d')).toBe(false);
  });

  it('counts book words as words only when they are common', () => {
    const v = new Vocab();
    v.addBook('zorp zorp blig');
    expect(v.isWord('zorp')).toBe(false);
    v.addBook('zorp');
    expect(v.isWord('zorp')).toBe(true);
    expect(v.isWord('blig')).toBe(false);
  });

  it('counts word pairs from clean text', () => {
    expect(vocab.pairCount('and', 'one')).toBe(2);
    expect(vocab.pairCount('Fails', 'A')).toBe(3);
    expect(vocab.pairCount('arm', 'or')).toBe(0);
  });

  it('finds the one word a slip away, and nothing when two are as close', () => {
    expect(vocab.nearest('exbales')).toBe('exhales');
    const v = new Vocab();
    v.addTrusted('mantle mangle');
    expect(v.nearest('manrle')).toBeUndefined();
  });

  it('skips glued book words', () => {
    const v = new Vocab();
    v.addTrusted('of the');
    v.addBook('ofthe ofthe ofthe');
    expect(v.isWord('ofthe')).toBe(false);
  });
});

describe('number repairs', () => {
  it('reads letters OCR set for digits', () => {
    expect(toNumber('l5')).toBe(15);
    expect(toNumber('IO')).toBe(10);
    expect(toNumber('S')).toBe(5);
    expect(toNumber('cat')).toBeUndefined();
  });

  it('mends dice formulas in parentheses', () => {
    expect(fixDice('(8dl O+ 40)')).toBe('(8d10 + 40)');
    expect(fixDice('{ld6 - 1}')).toBe('(1d6 - 1)');
    expect(fixDice('(5d8 4- 5)')).toBe('(5d8 + 5)');
    expect(fixDice('(2d10 4- 3)')).toBe('(2d10 + 3)');
    expect(fixDice('(1d4)')).toBe('(1d4)');
  });

  it('mends numbers only where the wording needs one', () => {
    expect(fixNumbers('Melee Weapon Attack: 4-7 to hit')).toBe('Melee Weapon Attack: +7 to hit');
    expect(fixNumbers('+l to hit')).toBe('+1 to hit');
    expect(fixNumbers('a DC l5 save')).toBe('a DC 15 save');
    expect(fixNumbers('l2 (2d6 + 3) damage')).toBe('12 (2d6 + 3) damage');
    expect(fixNumbers('takes ld6 fire')).toBe('takes 1d6 fire');
    expect(fixNumbers('reach S ft.')).toBe('reach 5 ft.');
    expect(fixNumbers('lO feet away')).toBe('10 feet away');
    expect(fixNumbers('Sly Ollie')).toBe('Sly Ollie');
  });

  it('mends range pairs, including a slash read as f', () => {
    expect(fixNumbers('range 8O/32O ft.')).toBe('range 80/320 ft.');
    expect(fixNumbers('range 80f320 ft.')).toBe('range 80/320 ft.');
    expect(fixNumbers('range 80 ft. /320 ft.')).toBe('range 80/320 ft.');
  });
});

describe('glueSplit', () => {
  const vocab = makeVocab();

  it('splits a short word glued to a known one', () => {
    expect(glueSplit('ofthe', vocab)).toBe(2);
    expect(glueSplit('Acreature', vocab)).toBe(1);
  });

  it('leaves known and short words alone', () => {
    expect(glueSplit('creature', vocab)).toBeUndefined();
    expect(glueSplit('ofa', vocab)).toBeUndefined();
  });
});

describe('fixWords', () => {
  const vocab = makeVocab();

  it('rejoins split words', () => {
    expect(fixWords('Mele e slash ing', vocab)).toBe('Melee slashing');
    expect(fixWords('p o lear m', vocab)).toBe('polearm');
    expect(fixWords("the wyv ern's tail", vocab)).toBe("the wyvern's tail");
  });

  it('uses clean text to choose between two ways to join', () => {
    expect(fixWords('an d one', vocab)).toBe('and one');
    expect(fixWords('fail s a', vocab)).toBe('fails a');
  });

  it('keeps a known word apart when the pieces after it join on their own', () => {
    expect(fixWords('the re ga ins', vocab)).toBe('the regains');
  });

  it('joins two real words only when clean text rarely pairs them', () => {
    expect(fixWords('natural arm or', vocab)).toBe('natural armor');
    expect(fixWords('in to', vocab)).toBe('in to');
  });

  it('moves a word break by one letter when clean text backs it', () => {
    expect(fixWords('it fail sa test', vocab)).toBe('it fails a test');
  });

  it('splits glued words and fixes one-letter slips, but not in names', () => {
    expect(fixWords('ofthe creature', vocab)).toBe('of the creature');
    expect(fixWords('it exbales', vocab)).toBe('it exhales');
    expect(fixWords('Exbales', vocab)).toBe('Exbales');
  });

  it('reads a slash or a one inside a word as an l, only when that makes a word', () => {
    expect(fixWords('a po/earm, it fai1s', vocab)).toBe('a polearm, it fails');
    expect(fixWords('arm/leg and/or 1/2', vocab)).toBe('arm/leg and/or 1/2');
  });
});

describe('joinLines', () => {
  const vocab = makeVocab();

  it('drops a line-end hyphen only when the halves make a word', () => {
    expect(joinLines(['three bar-', 'ghests howl'], vocab)).toBe('three barghests howl');
    expect(joinLines(['a soul-', 'devouring blade'], vocab)).toBe('a soul-devouring blade');
  });

  it('reads a middle dot at a line end as that hyphen', () => {
    expect(joinLines(['three bar·', 'ghests howl'], vocab)).toBe('three barghests howl');
    expect(joinLines(['a soul•', 'devouring blade'], vocab)).toBe('a soul-devouring blade');
    expect(joinLines(['it regains its bre·', 'eth'], vocab)).toBe('it regains its breath');
    expect(joinLines(['it takes a pole·', 'armand'], vocab)).toBe('it takes a polearm and');
  });

  it('joins a word split across lines without a hyphen, unless both halves are words', () => {
    expect(joinLines(['at the win', 'dow sill'], vocab)).toBe('at the window sill');
    expect(joinLines(['leaps in', 'to the pool'], vocab)).toBe('leaps in to the pool');
  });

  it('skips blank lines', () => {
    expect(joinLines(['one', '  ', 'two'], vocab)).toBe('one two');
  });
});

describe('tidy and stripTrailingJunk', () => {
  it('tidies spacing and punctuation', () => {
    expect(tidy('Speed 40ft., fly 60 ft.')).toBe('Speed 40 ft., fly 60 ft.');
    expect(tidy('AC 15 ( natural armor )')).toBe('AC 15 (natural armor)');
    expect(tidy("It can 't fly")).toBe("It can't fly");
    expect(tidy('{3d6} mud·eel')).toBe('(3d6) mud-eel');
    expect(tidy('15,natural')).toBe('15, natural');
    expect(tidy('Aura ofEmbers, theRed Hall')).toBe('Aura of Embers, the Red Hall');
  });

  it('drops stray marks at a line end', () => {
    expect(stripTrailingJunk('The beast roars . •~')).toBe('The beast roars.');
    expect(stripTrailingJunk('a • b')).toBe('a b');
    expect(stripTrailingJunk('Bite (1d6).')).toBe('Bite (1d6).');
  });
});
