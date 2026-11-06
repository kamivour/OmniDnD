import { z } from 'zod';
import {
  CUSTOM_ITEM_PREFIX,
  RefEntrySchema,
  type ItemDef,
  type MechanicsOverlay,
  type RefEntry,
  type RefKind,
  type SummaryOverlay,
} from './schema';

type EntryOf<K extends RefKind> = Extract<RefEntry, { kind: K }>;

/** Every reference entry by id, with summaries and mechanics merged in (DATA.md §2, D51). */
export interface Registry {
  readonly entries: ReadonlyMap<string, RefEntry>;
  /** Throws when the id is missing or is another kind: a broken reference is a data bug. */
  get<K extends RefKind>(kind: K, id: string): EntryOf<K>;
  /** The bundled registry under a character's custom items. */
  readonly base?: Registry;
}

/**
 * Builds the registry from parsed packs (SRD, then data/content) and overlays. An id may
 * appear in one pack only, and in at most one summary and one mechanics overlay. Each
 * overlay's fields replace the entry's; the merged entry is parsed again.
 */
export function buildRegistry(
  packs: readonly RefEntry[][],
  summaries: readonly SummaryOverlay[],
  mechanics: readonly MechanicsOverlay[],
): Registry {
  const entries = new Map<string, RefEntry>();
  for (const entry of packs.flat()) {
    if (entries.has(entry.id)) throw new Error(`${entry.id} is in more than one pack`);
    if (entry.id.startsWith(CUSTOM_ITEM_PREFIX))
      throw new Error(`${entry.id} uses the custom item prefix`);
    entries.set(entry.id, entry);
  }

  for (const [label, overlays] of [
    ['summary', summaries],
    ['mechanics', mechanics],
  ] as const) {
    const seen = new Set<string>();
    for (const overlay of overlays) {
      const entry = entries.get(overlay.id);
      if (!entry) throw new Error(`${label} overlay for unknown id ${overlay.id}`);
      if (seen.has(overlay.id)) throw new Error(`Two ${label} overlays for ${overlay.id}`);
      seen.add(overlay.id);
      const merged = RefEntrySchema.safeParse({ ...entry, ...overlay });
      if (!merged.success) {
        throw new Error(`${overlay.id} after ${label} overlay: ${z.prettifyError(merged.error)}`);
      }
      entries.set(overlay.id, merged.data);
    }
  }

  return lookup(entries);
}

function lookup(entries: ReadonlyMap<string, RefEntry>, base?: Registry): Registry {
  return {
    entries,
    ...(base && { base }),
    get<K extends RefKind>(kind: K, id: string) {
      const entry = entries.get(id);
      if (!entry) throw new Error(`Unknown ${kind} ${id}`);
      if (entry.kind !== kind) throw new Error(`${id} is a ${entry.kind}, not a ${kind}`);
      return entry as EntryOf<K>;
    },
  };
}

const scoped = new WeakMap<Registry, WeakMap<readonly ItemDef[], Registry>>();

/**
 * The registry one character sees: bundled entries plus the build's custom items, so every
 * calculation and command resolves them like catalogue items. Cached per custom item list.
 */
export function characterRegistry(
  registry: Registry,
  build: { customItems?: readonly ItemDef[] | undefined },
): Registry {
  const base = registry.base ?? registry;
  const items = build.customItems;
  if (!items || items.length === 0) return base;
  let cache = scoped.get(base);
  if (!cache) scoped.set(base, (cache = new WeakMap()));
  const cached = cache.get(items);
  if (cached) return cached;
  const entries = new Map(base.entries);
  for (const item of items) entries.set(item.id, item);
  const result = lookup(entries, base);
  cache.set(items, result);
  return result;
}
