import { z } from 'zod';
import {
  RefEntrySchema,
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

  return {
    entries,
    get<K extends RefKind>(kind: K, id: string) {
      const entry = entries.get(id);
      if (!entry) throw new Error(`Unknown ${kind} ${id}`);
      if (entry.kind !== kind) throw new Error(`${id} is a ${entry.kind}, not a ${kind}`);
      return entry as EntryOf<K>;
    },
  };
}
