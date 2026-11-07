import { z } from 'zod';
import {
  deserializeWorkspace,
  parseStoredRecord,
  serializeWorkspace,
  storedRecord,
  type StoredRecord,
  type Workspace,
  type WorkspaceRows,
} from './database';
import { ActivityReferenceSchema, resolveActivity } from '../state/activity-order';

export const BACKUP_LIMIT = 10;

const WorkspaceRowsShape = z.strictObject({
  builds: z.array(z.unknown()),
  live: z.array(z.unknown()),
  events: z.array(z.unknown()),
  campaigns: z.array(z.unknown()),
  automation: z.unknown(),
  reducedMotion: z.unknown().optional(),
  managementEvents: z.array(z.unknown()).optional(),
  bookmarks: z.array(z.unknown()).optional(),
  activityOrder: z.array(z.unknown()).optional(),
});

// Unknown, future, and damaged records must never become retention deletion candidates.
const WorkspaceSnapshotSchema = z.custom<WorkspaceRows>((value) => {
  try {
    const shape = WorkspaceRowsShape.parse(value);
    // Deserialization joins rows through object keys; reject duplicate primary keys before
    // that join can hide damaged rows and accidentally make them eligible for deletion.
    for (const table of [shape.builds, shape.live, shape.campaigns]) {
      const ids = table.map((row) => z.object({ id: z.string() }).parse(row).id);
      if (new Set(ids).size !== ids.length) return false;
    }
    deserializeWorkspace(value as WorkspaceRows);
    return true;
  } catch {
    return false;
  }
});

const BackupIntentDataSchema = z.strictObject({
  kind: z.literal('omnidnd-workspace-backup'),
  payloadVersion: z.literal(1),
  reason: z.enum(['before-import', 'before-reset', 'after-long-rest', 'before-restore']),
  capturedAt: z.iso.datetime(),
  /** Absent for a snapshot taken by the Backups screen rather than by a command. */
  source: ActivityReferenceSchema.optional(),
  workspace: WorkspaceSnapshotSchema,
});
const BackupPayloadSchema = BackupIntentDataSchema.extend({ order: z.int().positive() });

export type BackupPayload = z.infer<typeof BackupPayloadSchema>;
export type BackupIntent = StoredRecord<z.infer<typeof BackupIntentDataSchema>>;

/** Capture once at the successful transition, before any queued save or Retry can run. */
export function createBackupIntent(
  previous: Workspace,
  next: Workspace,
  metadata: { id: string; capturedAt: string },
): BackupIntent | undefined {
  const source = next.activityOrder?.at(-1);
  if (!source) return undefined;
  const activity = resolveActivity(next, source);
  // A restored/imported history entry is not a newly executed local command.
  if (!activity || activity.event.undoneBy || resolveActivity(previous, source)) return undefined;
  const previousReferences = previous.activityOrder ?? [];
  if (
    previousReferences.some(
      (entry) =>
        entry.scope === source.scope &&
        (entry.scope !== 'character' ||
          (source.scope === 'character' && entry.characterId === source.characterId)) &&
        entry.eventId === source.eventId &&
        entry.fingerprint === source.fingerprint,
    )
  )
    return undefined;
  const lastEvent =
    source.scope === 'character'
      ? next.characters[source.characterId]?.events.at(-1)
      : next.managementEvents.at(-1);
  if (lastEvent !== activity.event) return undefined;
  const reason =
    activity.scope === 'workspace' && activity.event.command === 'importCharacter'
      ? 'before-import'
      : activity.scope === 'character' && activity.event.command === 'resetCharacter'
        ? 'before-reset'
        : activity.scope === 'character' && activity.event.command === 'completeLongRest'
          ? 'after-long-rest'
          : undefined;
  if (!reason) return undefined;
  if (!metadata.id.startsWith('backup:') || metadata.id.length === 'backup:'.length)
    throw new Error('Backup id must start with backup: and include a unique identity');
  const capturedAt = z.iso.datetime().parse(metadata.capturedAt);
  return storedRecord(metadata.id, {
    kind: 'omnidnd-workspace-backup',
    payloadVersion: 1,
    reason,
    capturedAt,
    source: { ...source },
    workspace: structuredClone(serializeWorkspace(reason === 'after-long-rest' ? next : previous)),
  });
}

export function ownedBackup(row: StoredRecord<unknown>): StoredRecord<BackupPayload> | undefined {
  try {
    const parsed = parseStoredRecord(row, BackupPayloadSchema, 'backup');
    return parsed.id.startsWith('backup:') && parsed.id.length > 'backup:'.length
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

/** A snapshot of the whole workspace taken on request, e.g. just before a restore replaces it. */
export function snapshotBackupIntent(
  workspace: Workspace,
  reason: 'before-restore',
  metadata: { id: string; capturedAt: string },
): BackupIntent {
  return storedRecord(metadata.id, {
    kind: 'omnidnd-workspace-backup',
    payloadVersion: 1,
    reason,
    capturedAt: z.iso.datetime().parse(metadata.capturedAt),
    workspace: structuredClone(serializeWorkspace(workspace)),
  });
}

/** Allocate local order inside the save transaction; wall-clock changes cannot evict newer saves. */
export function planBackups(
  existing: StoredRecord<unknown>[],
  intents: BackupIntent[],
): { add: StoredRecord<BackupPayload>[]; remove: string[] } {
  const owned = existing.flatMap((row) => {
    const parsed = ownedBackup(row);
    return parsed ? [parsed] : [];
  });
  let order = owned.reduce((maximum, row) => Math.max(maximum, row.data.order), 0);
  const rowsById = new Map(existing.map((row) => [row.id, row]));
  const add: StoredRecord<BackupPayload>[] = [];
  for (const intent of intents) {
    const { data } = parseStoredRecord(intent, BackupIntentDataSchema, 'backup intent');
    if (!intent.id.startsWith('backup:') || intent.id.length === 'backup:'.length)
      throw new Error('Backup id must start with backup: and include a unique identity');
    const occupied = rowsById.get(intent.id);
    if (occupied) {
      const parsed = ownedBackup(occupied);
      if (parsed) {
        const prior = { ...parsed.data, order: undefined };
        if (JSON.stringify(prior) === JSON.stringify(data)) continue;
      }
      throw new Error(`Backup identity collision: ${intent.id}`);
    }
    order += 1;
    const row = storedRecord(intent.id, BackupPayloadSchema.parse({ ...data, order }));
    add.push(row);
    rowsById.set(row.id, row);
  }
  const newest = [...owned, ...add].sort(
    (first, second) => second.data.order - first.data.order || first.id.localeCompare(second.id),
  );
  return { add, remove: newest.slice(BACKUP_LIMIT).map((row) => row.id) };
}
