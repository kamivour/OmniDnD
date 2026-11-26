import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { registry, setMonsterPack } from '../data/registry';
import { database, parseStoredRecord, storedRecord } from '../db/database';
import type { Registry } from '../engine/registry';
import {
  MonsterPackSchema,
  type MonsterLore,
  type MonsterPack,
  type Source,
} from '../engine/schema';

/**
 * The device's private monster pack (M50, D273): imported from a file, kept in IndexedDB and
 * merged into the live registry. It is never backed up, synced or shared.
 */
const ROW_ID = 'monsters';

export interface MonsterPackSummary {
  version: string;
  extractedAt: string;
  creatures: number;
  /** Bundled SRD creatures the pack adds book tags or lore to. */
  supplements: number;
  lore: number;
  /** Creatures plus tagged SRD creatures printed in each book. */
  books: Partial<Record<Source, number>>;
  /** Pack entries left out because their id clashes with bundled data or is unknown. */
  skipped: number;
  /** Loaded from the developer's local file, not saved on this device. */
  local?: boolean;
}

interface MonsterPackState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  summary: MonsterPackSummary | undefined;
  lore: ReadonlyMap<string, MonsterLore>;
  /** Bumped whenever the registry changes, so screens that list creatures re-render. */
  version: number;
  error: string | undefined;
}

export const monsterPackStore = createStore<MonsterPackState>(() => ({
  status: 'idle',
  summary: undefined,
  lore: new Map(),
  version: 0,
  error: undefined,
}));

function summarize(pack: MonsterPack, skipped: number): MonsterPackSummary {
  const books: Partial<Record<Source, number>> = {};
  for (const entry of [...pack.creatures, ...pack.supplements]) {
    for (const source of new Set((entry.books ?? []).map((book) => book.source)))
      books[source] = (books[source] ?? 0) + 1;
  }
  return {
    version: pack.version,
    extractedAt: pack.extractedAt,
    creatures: pack.creatures.length,
    supplements: pack.supplements.length,
    lore: pack.lore.length,
    books,
    skipped,
  };
}

function apply(pack: MonsterPack | undefined, local = false) {
  const { skipped } = setMonsterPack(pack);
  monsterPackStore.setState((state) => ({
    status: 'ready',
    summary: pack && { ...summarize(pack, skipped.length), ...(local && { local }) },
    lore: new Map(pack?.lore.map((lore) => [lore.id, lore])),
    version: state.version + 1,
    error: undefined,
  }));
}

const NOT_A_PACK = 'This file is not a monster pack. Choose the monsters.pack.json file.';

/** Parses a pack file, with plain words for a file that is not a valid pack. */
export function readPackFile(text: string): { pack: MonsterPack } | { error: string } {
  try {
    return checkPack(JSON.parse(text));
  } catch {
    return { error: NOT_A_PACK };
  }
}

export function checkPack(raw: unknown): { pack: MonsterPack } | { error: string } {
  if (typeof raw !== 'object' || raw === null || !('canary' in raw) || !('creatures' in raw))
    return { error: NOT_A_PACK };
  if ((raw as { format?: unknown }).format !== 1)
    return { error: 'This pack was made by a different app version. Make the pack again.' };
  const parsed = MonsterPackSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? ` (at ${issue.path.map(String).join('.')})` : '';
    return { error: `This pack has a problem${where}: ${issue?.message ?? 'unknown'}.` };
  }
  return { pack: parsed.data };
}

/** Loads the saved pack at startup. A broken row is reported, not thrown. */
export async function loadMonsterPack(fallback?: () => Promise<unknown>) {
  monsterPackStore.setState({ status: 'loading' });
  try {
    const row = await database.userPacks.get(ROW_ID);
    if (row) return apply(parseStoredRecord(row, MonsterPackSchema, 'monster pack').data);
    const local = fallback && (await fallback());
    if (local) {
      const read = checkPack(local);
      if ('pack' in read) return apply(read.pack, true);
    }
    apply(undefined);
  } catch {
    monsterPackStore.setState({
      status: 'error',
      error: 'The saved monster pack could not be read. Import it again or remove it.',
    });
  }
}

/** Validates a pack file and saves it on this device. Returns an error message on failure. */
export async function importMonsterPack(text: string): Promise<string | undefined> {
  const read = readPackFile(text);
  if ('error' in read) return read.error;
  await database.userPacks.put(storedRecord(ROW_ID, read.pack));
  apply(read.pack);
  return undefined;
}

export async function removeMonsterPack() {
  await database.userPacks.delete(ROW_ID);
  apply(undefined);
}

export function useMonsterPack<T>(selector: (state: MonsterPackState) => T): T {
  return useStore(monsterPackStore, selector);
}

/** Subscribes a component to registry swaps; call it where creatures are listed. */
export function useMonsterPackVersion(): number {
  return useStore(monsterPackStore, (state) => state.version);
}

/** The live registry, re-read after a pack loads or is removed. Use it as a memo dependency. */
export function useRegistry(): Registry {
  useMonsterPackVersion();
  return registry;
}
