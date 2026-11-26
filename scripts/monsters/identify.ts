/**
 * Stage 7 of the monster pipeline: give each parsed block its creature name and lore family.
 * Pure functions. A block's own heading is the best clue; the book's index (`names.json`) and
 * known clean names (the SRD) correct OCR slips, and a block whose heading OCR lost is matched
 * by page and by what its stats and text say about itself.
 */
import type { Vocab } from './clean.ts';
import { editDistance } from './layout.ts';
import type { IndexEntry } from './names.ts';
import type { ParsedCreature } from './parse.ts';
import { letters, type LoreFamily } from './segment.ts';

export interface NamedCreature extends ParsedCreature {
  name?: string;
}

/** What identify needs from a known clean creature (an SRD entry). */
export interface KnownCreature {
  name: string;
  ac?: number;
  hp?: number;
  cr?: number;
}

const SMALL = new Set(['of', 'the', 'and', 'or', 'in', 'a', 'an', 'to', 'on', 'from', 'with']);

/** "ADULT BLACK DRAGON" -> "Adult Black Dragon"; small words stay lower case inside a name. */
export function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, k) =>
      k > 0 && SMALL.has(word)
        ? word
        : word.replace(/(^|[-(])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase()),
    )
    .join(' ');
}

const closeEnough = (a: string, b: string) => {
  const shorter = Math.min(a.length, b.length);
  return editDistance(a, b) <= (shorter < 5 ? 1 : Math.max(2, Math.floor(shorter * 0.2)));
};

const nameWords = (name: string) =>
  name
    .split(/[\s,()/-]+/)
    .map(letters)
    .filter(Boolean);

/** How much of a name is known words (clean text, or common in the books). */
const wordShare = (name: string, vocab: Vocab) => {
  const words = nameWords(name);
  return words.length === 0 ? 0 : words.filter((word) => vocab.isWord(word)).length / words.length;
};

/** Singular, letters only: "Dragons" -> "dragon", "Harpies" stays near enough. */
const stem = (word: string) => letters(word).replace(/(?:ies|es|s)$/, '');

const matchCase = (like: string, word: string) =>
  /^[A-Z]/.test(like) ? word.charAt(0).toUpperCase() + word.slice(1) : word;

/**
 * Repairs a name OCR split or glued: "S pec tator" -> "Spectator", "Yuan -ti" -> "Yuan-ti",
 * "Eye ofGruumsh" -> "Eye of Gruumsh". Pieces join when the whole is a known word (or one slip
 * from one) and the pieces are not all words; a stray single letter left over is dropped.
 */
export function cleanName(name: string, vocab: Vocab): string {
  const tokens = name
    .replace(/\s*-\s*/g, '-')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);
  const plain = (token: string) => /^[A-Za-z]+$/.test(token);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    let joined: { word: string; span: number } | undefined;
    for (let span = Math.min(4, tokens.length - i); span >= 2 && !joined; span--) {
      const pieces = tokens.slice(i, i + span);
      if (!pieces.every(plain) || pieces.every((piece) => vocab.isTrusted(piece))) continue;
      const whole = pieces.join('').toLowerCase();
      if (vocab.isWord(whole)) joined = { word: whole, span };
      else if (span === 2 && pieces.some((piece) => piece.length <= 2) && whole.length >= 6) {
        const near = vocab.nearest(whole);
        if (near) joined = { word: near, span };
      }
    }
    if (joined) {
      out.push(matchCase(tokens[i]!, joined.word));
      i += joined.span - 1;
      continue;
    }
    const token = tokens[i]!;
    if (plain(token) && token.length === 1 && !/^[aA]$/.test(token)) continue;
    const near =
      plain(token) && token.length >= 5 && !vocab.isWord(token) ? vocab.nearest(token) : undefined;
    out.push(near ? matchCase(token, near) : token);
  }
  return out.join(' ');
}

/** A known creature's stats confirm a block: the same hit points, else (none read) the same AC. */
const statsAgree = (clean: KnownCreature, creature: ParsedCreature) =>
  creature.hp !== undefined
    ? clean.hp === creature.hp
    : clean.ac !== undefined && clean.ac === creature.ac;

/**
 * How a block's text names its own creature ("The jackalwere can ..."): the word most often
 * after "the" that clean text does not know as an ordinary word.
 */
export function selfName(creature: ParsedCreature, vocab: Vocab): string | undefined {
  const text = [...creature.traits, ...creature.actions].map((entry) => entry.text).join(' ');
  const counts = new Map<string, number>();
  for (const [, word] of text.matchAll(/\bthe\s+([a-z][a-z-]{3,})(?:'s)?\b/gi)) {
    const lower = word!.toLowerCase();
    if (!vocab.isTrusted(lower)) counts.set(lower, (counts.get(lower) ?? 0) + 1);
  }
  const [best] = [...counts].sort((a, b) => b[1] - a[1]);
  return best ? matchCase('X', best[0]) : undefined;
}

/**
 * Names every block it can. Headed blocks claim their index name first. The rest (no heading,
 * or a heading the index lacks, often a sidebar title) take the unclaimed index name near their
 * page that their stats and text fit best, best fit first. A block still unnamed takes the one
 * known creature with its exact AC, hit points and challenge: OCR loses index lines too.
 */
export function nameBlocks(
  creatures: readonly ParsedCreature[],
  expected: readonly IndexEntry[],
  known: readonly KnownCreature[],
  vocab: Vocab,
): NamedCreature[] {
  const used = new Set<number>();
  const knownByKey = new Map(known.map((creature) => [letters(creature.name), creature]));
  const out: NamedCreature[] = creatures.map((creature) => ({
    ...creature,
    issues: [...creature.issues],
  }));

  /** The known creature a name means: the same letters, else one slip away when that is unique. */
  const knownLike = (name: string) => {
    const key = letters(name);
    const exact = knownByKey.get(key);
    if (exact || key.length < 3) return exact;
    const near = known.filter((clean) => editDistance(key, letters(clean.name)) === 1);
    return near.length === 1 ? near[0] : undefined;
  };

  /** A known name close to `name`; a slip counts only when the block's stats agree. */
  const knownName = (name: string, creature: ParsedCreature) => {
    const key = letters(name);
    const exact = knownByKey.get(key);
    if (exact) return exact.name;
    let best: { name: string; distance: number } | undefined;
    for (const clean of known) {
      const other = letters(clean.name);
      const distance = editDistance(key, other);
      if (
        distance > (Math.min(key.length, other.length) < 5 ? 1 : 2) ||
        !statsAgree(clean, creature)
      )
        continue;
      if (!best || distance < best.distance) best = { name: clean.name, distance };
    }
    return best?.name;
  };

  const settle = (creature: NamedCreature, fromIndex?: string, useHeading = true) => {
    const heading = useHeading && creature.heading ? titleCase(creature.heading) : undefined;
    const index = fromIndex;
    for (const option of [heading, index]) {
      const clean = option && knownName(option, creature);
      if (clean) {
        creature.name = clean;
        return;
      }
    }
    if (!heading || !index) {
      creature.name = heading ?? index;
      return;
    }
    // Same letters: the index has the book's capitals ("Yuan-ti"), unless it glued two words
    // ("Swarm ofbats") and reads worse. Else the more readable one.
    const sameLetters = letters(heading) === letters(index);
    const share = wordShare(index, vocab) - wordShare(heading, vocab);
    creature.name = share > 0 || (sameLetters && share === 0) ? index : heading;
  };

  const cleaned = expected.map((entry) => cleanName(entry.name, vocab));
  for (const creature of out) {
    if (!creature.heading) continue;
    const key = letters(creature.heading);
    let best: { index: number; distance: number } | undefined;
    expected.forEach((entry, index) => {
      if (used.has(index)) return;
      const target = letters(entry.name);
      if (!closeEnough(key, target)) return;
      // Short names sit a slip apart ("Deva", "Deer"): the index page must be near the block.
      const far =
        entry.page !== undefined &&
        creature.printed !== undefined &&
        Math.abs(entry.page - creature.printed) > 3;
      if (far && key !== target) return;
      const distance =
        editDistance(key, target) +
        (entry.page !== undefined && creature.printed !== undefined
          ? Math.min(3, Math.abs(entry.page - creature.printed)) * 0.1
          : 0);
      if (!best || distance < best.distance) best = { index, distance };
    });
    if (best) {
      used.add(best.index);
      settle(creature, cleaned[best.index]);
    }
  }

  const fit = (creature: NamedCreature, index: number, text: string) => {
    const entry = expected[index]!;
    const gap = entry.page! - creature.printed!;
    let score = gap === 0 ? 0.5 : gap < 0 ? 0.2 : -0.3;
    const clean = knownLike(cleaned[index]!);
    if (clean?.hp !== undefined && creature.hp !== undefined)
      score += clean.hp === creature.hp ? 3 : -2;
    if (clean?.ac !== undefined && clean.ac === creature.ac) score += 1;
    const last = stem(nameWords(cleaned[index]!).at(-1) ?? '');
    if (last.length >= 3 && text.includes(last)) score += 1;
    return score;
  };
  const choices = new Map<NamedCreature, { index: number; score: number }[]>();
  for (const creature of out) {
    if (creature.name !== undefined || creature.printed === undefined) continue;
    const printed = creature.printed;
    const text = [...creature.traits, ...creature.actions]
      .map((entry) => entry.text)
      .join(' ')
      .toLowerCase();
    choices.set(
      creature,
      expected.flatMap((entry, index) =>
        entry.page !== undefined && Math.abs(entry.page - printed) <= 1
          ? [{ index, score: fit(creature, index, text) }]
          : [],
      ),
    );
  }
  // Best fit first. When fits tie, blocks take tied names in reading order, the index's order.
  for (;;) {
    let pick: { creature: NamedCreature; index: number; score: number; tied: boolean } | undefined;
    for (const [creature, list] of choices) {
      const free = list
        .filter(({ index }) => !used.has(index))
        .sort((a, b) => b.score - a.score || a.index - b.index);
      const [top, next] = free;
      // A heading the index lacks gives way only to a strong fit: known stats agreeing.
      if (!top || top.score < (creature.heading ? 3 : 0)) continue;
      const tied = next !== undefined && next.score === top.score;
      if (!pick || (pick.tied && !tied) || (pick.tied === tied && top.score > pick.score)) {
        pick = { creature, index: top.index, score: top.score, tied };
      }
    }
    if (!pick) break;
    const { creature, index, tied } = pick;
    used.add(index);
    choices.delete(creature);
    settle(creature, cleaned[index], false);
    const how = tied ? 'by page order' : 'by page';
    creature.issues.push(
      creature.heading
        ? `heading "${creature.heading}" is not in the book's index; name taken from the index ${how}`
        : `no heading; name taken from the index ${how}`,
    );
  }

  const named = new Set(out.flatMap((creature) => (creature.name ? [letters(creature.name)] : [])));
  for (const creature of out) {
    if (creature.name !== undefined) continue;
    const heading = creature.heading;
    const fromHeading = heading ? knownName(titleCase(heading), creature) : undefined;
    const twins = fromHeading
      ? []
      : known.filter((clean) => {
          if (creature.hp === undefined || clean.hp !== creature.hp || clean.ac !== creature.ac)
            return false;
          if (clean.cr !== undefined && creature.cr !== undefined && clean.cr !== creature.cr)
            return false;
          if (named.has(letters(clean.name))) return false;
          const listed = expected.find((entry) => letters(entry.name) === letters(clean.name));
          return (
            listed?.page === undefined ||
            creature.printed === undefined ||
            Math.abs(listed.page - creature.printed) <= 3
          );
        });
    const self = heading ? undefined : selfName(creature, vocab);
    if (twins.length === 1) {
      creature.name = twins[0]!.name;
      creature.issues.push(
        `name "${creature.name}" taken from known stats (AC, hit points, challenge)`,
      );
    } else if (heading) {
      settle(creature);
      creature.issues.push(`heading "${heading}" is not in the book's index`);
    } else if (self && !named.has(letters(self))) {
      creature.name = self;
      creature.issues.push(`no heading; name "${self}" taken from how its text refers to itself`);
    } else {
      creature.issues.push('no heading and no index name fits');
    }
    if (creature.name) named.add(letters(creature.name));
  }
  return out;
}

/**
 * Moves each block to the lore family whose title its name holds ("Adult Black Dragon" under
 * "Black Dragon"), looking two pages either way: books print a block before or beside its
 * family heading. Blocks with no such family keep the last heading before them.
 */
export function assignFamilies(creatures: NamedCreature[], families: readonly LoreFamily[]): void {
  for (const creature of creatures) {
    if (!creature.name) continue;
    const words = new Set(
      creature.name
        .split(/[\s,()-]+/)
        .map(stem)
        .filter(Boolean),
    );
    let best: { index: number; size: number; gap: number } | undefined;
    families.forEach((family, index) => {
      if (!family.title) return;
      const gap = Math.abs(family.page - creature.page);
      if (gap > 2) return;
      const title = family.title
        .split(/[\s,()-]+/)
        .map(stem)
        .filter(Boolean);
      if (title.length === 0 || !title.every((word) => words.has(word))) return;
      const size = title.join('').length;
      if (!best || size > best.size || (size === best.size && gap < best.gap)) {
        best = { index, size, gap };
      }
    });
    if (best) creature.family = best.index;
  }
}
