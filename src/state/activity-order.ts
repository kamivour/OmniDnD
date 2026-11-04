import { z } from 'zod';
import type { ManagementEvent } from '../engine/commands/management';
import type { LogEvent } from '../engine/schema';

export const ActivityReferenceSchema = z.discriminatedUnion('scope', [
  z.strictObject({
    scope: z.literal('character'),
    characterId: z.string().min(1),
    eventId: z.string().min(1),
    fingerprint: z.string().min(1),
  }),
  z.strictObject({
    scope: z.literal('workspace'),
    eventId: z.string().min(1),
    fingerprint: z.string().min(1),
  }),
]);

export type ActivityReference = z.infer<typeof ActivityReferenceSchema>;
type ActivityIdentity =
  | { scope: 'character'; characterId: string; eventId: string }
  | { scope: 'workspace'; eventId: string };

// Store commands replace log entries instead of mutating them, including when marking Undo.
// Reuse identities across renders and commands without retaining pruned history in memory.
const eventFingerprints = new WeakMap<LogEvent | ManagementEvent, string>();

/** Compact local identity check, not a security boundary. Marking Undo does not change it. */
function eventFingerprint(event: LogEvent | ManagementEvent): string {
  const cached = eventFingerprints.get(event);
  if (cached !== undefined) return cached;
  const immutable = { ...event };
  delete immutable.undoneBy;
  const value = JSON.stringify(immutable);
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  const fingerprint = `${value.length.toString(36)}:${(first >>> 0).toString(36)}:${(second >>> 0).toString(36)}`;
  eventFingerprints.set(event, fingerprint);
  return fingerprint;
}

const referenceKey = (reference: ActivityReference) =>
  JSON.stringify([
    reference.scope,
    reference.scope === 'character' ? reference.characterId : null,
    reference.eventId,
    reference.fingerprint,
  ]);

/** Oldest-first local references; neither event timestamps nor exported records carry order. */
export const ActivityOrderSchema = z.array(ActivityReferenceSchema).superRefine((refs, ctx) => {
  const seen = new Set<string>();
  refs.forEach((reference, index) => {
    const key = referenceKey(reference);
    if (seen.has(key))
      ctx.addIssue({ code: 'custom', message: 'Duplicate activity reference', path: [index] });
    seen.add(key);
  });
});

export type CharacterActivity =
  { scope: 'character'; event: LogEvent } | { scope: 'workspace'; event: ManagementEvent };

export interface ActivityState {
  characters: Record<string, { events: LogEvent[] }>;
  managementEvents: ManagementEvent[];
  activityOrder?: ActivityReference[];
}

/** Merge only the active character and shared history, preserving each source's saved order. */
export function characterActivity(state: ActivityState, characterId: string): CharacterActivity[] {
  const ranks = new Map((state.activityOrder ?? []).map((ref, rank) => [referenceKey(ref), rank]));
  const character = (state.characters[characterId]?.events ?? []).map((event) => ({
    event,
    rank: ranks.get(
      referenceKey({
        scope: 'character',
        characterId,
        eventId: event.id,
        fingerprint: eventFingerprint(event),
      }),
    ),
  }));
  const workspace = state.managementEvents.map((event) => ({
    event,
    rank: ranks.get(
      referenceKey({ scope: 'workspace', eventId: event.id, fingerprint: eventFingerprint(event) }),
    ),
  }));
  let characterIndex = character.length - 1;
  let workspaceIndex = workspace.length - 1;
  const result: CharacterActivity[] = [];
  while (characterIndex >= 0 || workspaceIndex >= 0) {
    const game = character[characterIndex];
    const management = workspace[workspaceIndex];
    const characterRank = game?.rank;
    const workspaceRank = management?.rank;
    // A tracked local action follows older untracked history. Ambiguous legacy heads prefer
    // the character; this is a stable fallback, not an inferred cross-history chronology.
    const chooseCharacter =
      game !== undefined &&
      (management === undefined ||
        (characterRank !== undefined &&
          (workspaceRank === undefined || characterRank > workspaceRank)) ||
        (characterRank === undefined && workspaceRank === undefined));
    if (chooseCharacter && game) {
      result.push({ scope: 'character', event: game.event });
      characterIndex -= 1;
    } else if (management) {
      result.push({ scope: 'workspace', event: management.event });
      workspaceIndex -= 1;
    }
  }
  return result;
}

/** Each underlying Undo API targets its own latest remaining command. */
export function characterUndoTarget(
  state: ActivityState,
  characterId: string,
): CharacterActivity | undefined {
  return characterActivity(state, characterId).find(
    ({ event }) => event.command !== 'undo' && event.undoneBy === undefined,
  );
}

/** Keep references while a retained management patch can restore the corresponding history. */
export function recordActivity(
  state: ActivityState,
  reference: ActivityIdentity,
): ActivityReference[] {
  const recoverable = new Set<string>();
  const seen = new WeakSet<object>();
  const rememberEvent = (characterId: string, event: unknown) => {
    if (
      typeof event !== 'object' ||
      event === null ||
      !('id' in event) ||
      typeof event.id !== 'string'
    )
      return;
    if (seen.has(event)) return;
    seen.add(event);
    recoverable.add(
      referenceKey({
        scope: 'character',
        characterId,
        eventId: event.id,
        fingerprint: eventFingerprint(event as LogEvent),
      }),
    );
  };
  const rememberEvents = (characterId: string, events: unknown) => {
    if (Array.isArray(events)) events.forEach((event) => rememberEvent(characterId, event));
  };
  const rememberCharacter = (characterId: string, record: unknown) => {
    if (typeof record === 'object' && record !== null && 'events' in record)
      rememberEvents(characterId, record.events);
  };
  Object.entries(state.characters).forEach(([id, character]) =>
    rememberEvents(id, character.events),
  );
  for (const event of state.managementEvents) {
    recoverable.add(
      referenceKey({ scope: 'workspace', eventId: event.id, fingerprint: eventFingerprint(event) }),
    );
    for (const patch of [...event.patches, ...event.inversePatches]) {
      if (patch.path[0] !== 'characters') continue;
      const characterId = patch.path[1];
      if (characterId === undefined && typeof patch.value === 'object' && patch.value !== null) {
        Object.entries(patch.value).forEach(([id, record]) => rememberCharacter(id, record));
      } else if (typeof characterId === 'string') {
        if (patch.path.length === 2) rememberCharacter(characterId, patch.value);
        else if (patch.path[2] === 'events') {
          if (patch.path.length === 3) rememberEvents(characterId, patch.value);
          else if (patch.path.length === 4) rememberEvent(characterId, patch.value);
        }
      }
    }
  }
  const event =
    reference.scope === 'character'
      ? state.characters[reference.characterId]?.events.findLast(
          (entry) => entry.id === reference.eventId,
        )
      : state.managementEvents.findLast((entry) => entry.id === reference.eventId);
  const chosen: ActivityReference | undefined = event
    ? { ...reference, fingerprint: eventFingerprint(event) }
    : undefined;
  const chosenKey = chosen ? referenceKey(chosen) : undefined;
  return [
    ...(state.activityOrder ?? []).filter((ref) => referenceKey(ref) !== chosenKey),
    ...(chosen ? [chosen] : []),
  ].filter((ref) => recoverable.has(referenceKey(ref)));
}
