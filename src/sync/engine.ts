import { z } from 'zod';
import { deserializeWorkspace, serializeWorkspace, type Workspace } from '../db/database';
import {
  fingerprint,
  syncId,
  workspaceContents,
  type SyncKind,
  type SyncRecord,
} from '../db/sync-metadata';
import {
  CampaignSchema,
  CharacterBuildSchema,
  LiveStateSchema,
  LogEventSchema,
  SCHEMA_VERSION,
} from '../engine/schema';
import { createCharacterStore } from '../state/character-store';
import { planSync, remoteFingerprint, type SyncStep } from './plan';
import type { RemoteEntity, SyncProvider } from './provider';

/** How the user settled a conflict: upload this device's version, or take the cloud's. */
export type ConflictChoice = 'this-device' | 'cloud';

export interface SyncConflict {
  id: string;
  kind: SyncKind;
  entityId: string;
  /** Name on this device, falling back to the cloud's, for the conflict prompt. */
  name: string;
  remote: RemoteEntity;
}

export interface SyncOutcome {
  /** Workspace with cloud changes applied; the same object when nothing was downloaded. */
  workspace: Workspace;
  /** Sync rows that changed, to be written after the workspace. */
  records: SyncRecord[];
  conflicts: SyncConflict[];
  uploaded: number;
  downloaded: number;
  /** Cloud rows saved by a different app version; left untouched. */
  skipped: number;
}

const CharacterPayloadSchema = z.strictObject({
  build: CharacterBuildSchema,
  live: LiveStateSchema,
  events: z.array(LogEventSchema),
});

function nameOf(content: unknown): string | undefined {
  if (typeof content !== 'object' || content === null) return undefined;
  const record = 'build' in content ? content.build : content;
  if (typeof record !== 'object' || record === null || !('name' in record)) return undefined;
  return typeof record.name === 'string' ? record.name : undefined;
}

let seedFingerprints: Set<string> | undefined;

/** Fingerprints of the untouched starter data, so a fresh device takes the cloud's copy quietly. */
function pristine(): Set<string> {
  seedFingerprints ??= new Set(
    [...workspaceContents(serializeWorkspace(createCharacterStore().getState())).values()].map(
      ({ content }) => fingerprint(content),
    ),
  );
  return seedFingerprints;
}

/** Hub Undo history is per device; drop it if cloud changes make it unreplayable. */
function validated(candidate: Workspace): Workspace {
  try {
    deserializeWorkspace(serializeWorkspace(candidate));
    return candidate;
  } catch {
    const withoutHistory = { ...candidate, managementEvents: [] };
    deserializeWorkspace(serializeWorkspace(withoutHistory));
    return withoutHistory;
  }
}

/**
 * One sync pass: upload local changes, download cloud changes, and collect conflicts. Conflicts
 * listed in `choices` are settled as chosen; the rest are returned untouched. Uploads that lose
 * a race are left for the next pass, which sees the newer cloud row.
 */
export async function syncWorkspace(
  workspace: Workspace,
  records: readonly SyncRecord[],
  provider: SyncProvider,
  choices: ReadonlyMap<string, ConflictChoice> = new Map(),
): Promise<SyncOutcome> {
  const contents = workspaceContents(serializeWorkspace(workspace));
  const remote = await provider.pull();
  const usable = remote.filter((row) => row.schemaVersion === SCHEMA_VERSION);
  const skippedIds = new Set(
    remote
      .filter((row) => row.schemaVersion !== SCHEMA_VERSION)
      .map((row) => syncId(row.kind, row.entityId)),
  );
  const locals = records.filter((row) => !skippedIds.has(syncId(row.kind, row.entityId)));
  const byId = new Map(locals.map((row) => [syncId(row.kind, row.entityId), row]));
  const changed: SyncRecord[] = [];
  const conflicts: SyncConflict[] = [];
  const campaigns = { ...workspace.campaigns };
  const characters = { ...workspace.characters };
  let uploaded = 0;
  let downloaded = 0;

  const settle = (step: SyncStep): SyncStep | null => {
    if (step.type !== 'conflict') return step;
    const { id, remote: theirs } = step;
    const choice = choices.get(id);
    if (choice === 'cloud') return { type: 'pull', id, remote: theirs };
    if (choice === 'this-device')
      return {
        type: 'push',
        id,
        kind: theirs.kind,
        entityId: theirs.entityId,
        expectedRevision: theirs.revision,
      };
    conflicts.push({
      id,
      kind: theirs.kind,
      entityId: theirs.entityId,
      name: nameOf(contents.get(id)?.content) ?? nameOf(theirs.payload) ?? theirs.entityId,
      remote: theirs,
    });
    return null;
  };

  for (const planned of planSync(locals, usable, pristine())) {
    const step = settle(planned);
    if (!step) continue;
    const mine = byId.get(step.id);
    if (step.type === 'push') {
      if (!mine) continue;
      const entity = contents.get(step.id);
      const result = await provider.push(
        {
          kind: step.kind,
          entityId: step.entityId,
          deleted: !entity,
          changedAt: mine.changedAt,
          schemaVersion: SCHEMA_VERSION,
          payload: entity?.content ?? null,
        },
        step.expectedRevision,
      );
      if (result.result !== 'ok') continue;
      uploaded += 1;
      const pushed = entity ? fingerprint(entity.content) : '';
      changed.push({ ...mine, baseRevision: result.revision, syncedFingerprint: pushed });
      continue;
    }
    const theirs = step.remote;
    const theirFingerprint = remoteFingerprint(theirs);
    const synced = { baseRevision: theirs.revision, syncedFingerprint: theirFingerprint };
    if (step.type === 'adopt') {
      changed.push({
        ...(mine ?? {
          kind: theirs.kind,
          entityId: theirs.entityId,
          changedAt: theirs.changedAt,
          deleted: theirs.deleted,
          fingerprint: theirFingerprint,
        }),
        ...synced,
      });
      continue;
    }
    if (theirs.kind === 'campaign') {
      if (theirs.deleted) delete campaigns[theirs.entityId];
      else campaigns[theirs.entityId] = CampaignSchema.parse(theirs.payload);
    } else if (theirs.deleted) {
      delete characters[theirs.entityId];
    } else {
      characters[theirs.entityId] = CharacterPayloadSchema.parse(theirs.payload);
    }
    downloaded += 1;
    changed.push({
      ...mine,
      kind: theirs.kind,
      entityId: theirs.entityId,
      changedAt: theirs.changedAt,
      deleted: theirs.deleted,
      fingerprint: theirFingerprint,
      ...synced,
    });
  }

  return {
    workspace: downloaded > 0 ? validated({ ...workspace, campaigns, characters }) : workspace,
    records: changed,
    conflicts,
    uploaded,
    downloaded,
    skipped: skippedIds.size,
  };
}
