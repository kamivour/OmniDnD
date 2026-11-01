import { z } from 'zod';
import { NonNegativeInt } from './common';

/** Event log entry with Immer patches for undo (DATA.md §5). */

export const PatchSchema = z.strictObject({
  op: z.enum(['add', 'remove', 'replace']),
  path: z.array(z.union([z.string(), z.number()])),
  value: z.unknown().optional(),
});

export const LogEventSchema = z.strictObject({
  id: z.string().min(1),
  characterId: z.string().min(1),
  realTime: z.iso.datetime(),
  gameSeconds: NonNegativeInt,
  command: z.string().min(1),
  /** Human line, e.g. "Cast Faerie Fire (L1 slot)". */
  text: z.string().min(1),
  patches: z.array(PatchSchema),
  inversePatches: z.array(PatchSchema),
  /** The user chose "Do anyway" on a warning. */
  override: z.boolean().optional(),
  /** Set on an event that was undone: the id of the undo event. */
  undoneBy: z.string().optional(),
});

export type Patch = z.infer<typeof PatchSchema>;
export type LogEvent = z.infer<typeof LogEventSchema>;
