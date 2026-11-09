import { z } from 'zod';
import { SCHEMA_VERSION } from '../engine/schema';
import type { StoredRecord, WorkspaceRows } from './database';

/**
 * Per-entity change tracking for future account sync (MA). Only campaigns and characters
 * sync; device preferences, bookmarks, backups and hub history stay on this device.
 */
export const SyncKindSchema = z.enum(['campaign', 'character']);
export type SyncKind = z.infer<typeof SyncKindSchema>;

export const SyncRecordSchema = z.strictObject({
  kind: SyncKindSchema,
  entityId: z.string().min(1),
  /** Device time of the last local change, ISO 8601. Ordering hint only; sync uses revisions. */
  changedAt: z.iso.datetime(),
  /** Deletion marker: the entity was removed here and the removal must reach other devices. */
  deleted: z.boolean(),
  /** Content fingerprint of the saved rows; empty for deletion markers. */
  fingerprint: z.string(),
  /** Cloud revision this device last matched; absent until the entity first syncs. */
  baseRevision: z.int().positive().optional(),
  /** `fingerprint` at that revision. Different now means a local change waits to upload. */
  syncedFingerprint: z.string().optional(),
});
export type SyncRecord = z.infer<typeof SyncRecordSchema>;

export const syncId = (kind: SyncKind, entityId: string) => `${kind}:${entityId}`;

/** JSON with sorted object keys, so equal content always gives equal text. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** 53-bit cyrb53 hash: fast and stable; not a security measure. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export const fingerprint = (value: unknown) => hash(stableJson(value));

/** What one syncable entity uploads: a campaign record, or a character's build, live state and log. */
export interface SyncContent {
  kind: SyncKind;
  entityId: string;
  content: unknown;
}

/** Content of every syncable entity in a serialized workspace, keyed by sync id. */
export function workspaceContents(rows: WorkspaceRows): Map<string, SyncContent> {
  const entities = new Map<string, SyncContent>();
  for (const { id, data } of rows.campaigns)
    entities.set(syncId('campaign', id), { kind: 'campaign', entityId: id, content: data });
  for (const { id, data: build } of rows.builds) {
    // Read-only copies of other members' characters belong to the party, not to this account.
    if (build.partyOwner) continue;
    entities.set(syncId('character', id), {
      kind: 'character',
      entityId: id,
      content: {
        build,
        live: rows.live.find((row) => row.id === id)?.data,
        events: rows.events
          .filter(({ characterId }) => characterId === id)
          .sort((a, b) => a.order - b.order)
          .map(({ data }) => data),
      },
    });
  }
  return entities;
}

/** Fingerprints of every syncable entity in a serialized workspace, keyed by sync id. */
export function workspaceFingerprints(rows: WorkspaceRows): Map<string, SyncRecord> {
  const entities = new Map<string, SyncRecord>();
  for (const [id, { kind, entityId, content }] of workspaceContents(rows))
    entities.set(id, {
      kind,
      entityId,
      changedAt: '',
      deleted: false,
      fingerprint: fingerprint(content),
    });
  return entities;
}

/**
 * Sync rows to write after saving `rows`. New or changed entities get `now`; entities that
 * disappeared get a deletion marker; unchanged entities and existing markers are left alone.
 * Called on load too, which back-fills metadata for workspaces saved before MA.
 */
export function planSyncRecords(
  previous: readonly StoredRecord<SyncRecord>[],
  rows: WorkspaceRows,
  now: string,
): StoredRecord<SyncRecord>[] {
  const known = new Map(previous.map((row) => [row.id, row.data]));
  const current = workspaceFingerprints(rows);
  const changes: StoredRecord<SyncRecord>[] = [];
  const put = (id: string, data: SyncRecord) =>
    changes.push({ id, schemaVersion: SCHEMA_VERSION, data });
  for (const [id, entity] of current) {
    const before = known.get(id);
    if (before && !before.deleted && before.fingerprint === entity.fingerprint) continue;
    put(id, { ...before, ...entity, changedAt: now });
  }
  for (const [id, before] of known) {
    if (before.deleted || current.has(id)) continue;
    put(id, { ...before, changedAt: now, deleted: true, fingerprint: '' });
  }
  return changes;
}
