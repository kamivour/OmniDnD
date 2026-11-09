import { applyPatches, enablePatches } from 'immer';
import type { z } from 'zod';
import { EVENT_LIMIT } from '../engine/commands/runner';
import type { LogEvent } from '../engine/schema';

enablePatches();

/** A character as stored and synced: current data plus its event log. */
export interface CharacterContent {
  build: unknown;
  live: unknown;
  events: LogEvent[];
}

type Path = readonly (string | number)[];

function touched(events: readonly LogEvent[]): Path[] {
  return events.flatMap((event) =>
    event.patches.map((patch) => patch.path as Path).filter((path) => path.length > 0),
  );
}

/** Two paths clash when they are equal or one lies inside the other. */
function clash(a: Path, b: Path): boolean {
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

/**
 * Merge two edited copies of one character. Both must share a start of the event log; the
 * events after it are applied to the same fields on neither side. Returns null when the
 * edits touch the same field (or history does not line up), so the user decides.
 */
export function mergeCharacters<T extends CharacterContent>(
  mine: T,
  theirs: T,
  schema: z.ZodType<T>,
): T | null {
  const a = mine.events;
  const b = theirs.events;
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared]?.id === b[shared]?.id) shared += 1;
  // No common event is fine for a log that began empty; a full log may have lost its start.
  if (shared === 0 && (a.length >= EVENT_LIMIT || b.length >= EVENT_LIMIT)) return null;
  const onlyMine = a.slice(shared);
  const onlyTheirs = b.slice(shared);
  if (onlyMine.length === 0 || onlyTheirs.length === 0) return null;
  const mineTouched = touched(onlyMine);
  const theirsTouched = touched(onlyTheirs);
  if (mineTouched.some((x) => theirsTouched.some((y) => clash(x, y)))) return null;
  try {
    const patches = onlyTheirs.flatMap((event) => event.patches);
    const data = applyPatches({ build: mine.build, live: mine.live }, patches as never);
    return schema.parse({ ...mine, ...data, events: [...a, ...onlyTheirs] });
  } catch {
    return null;
  }
}
