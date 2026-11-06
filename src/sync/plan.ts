import { fingerprint, syncId, type SyncKind, type SyncRecord } from '../db/sync-metadata';
import type { RemoteEntity } from './provider';

export type SyncStep =
  /** Upload this device's version. `expectedRevision` null: the cloud has no row yet. */
  | { type: 'push'; id: string; kind: SyncKind; entityId: string; expectedRevision: number | null }
  /** Take the cloud version; this device has no unsynced change. */
  | { type: 'pull'; id: string; remote: RemoteEntity }
  /** Both sides already match; only record the cloud revision. */
  | { type: 'adopt'; id: string; remote: RemoteEntity }
  /** Both sides changed since the last sync. The user chooses; nothing is overwritten. */
  | { type: 'conflict'; id: string; remote: RemoteEntity };

/**
 * True when this device has a change the cloud has not seen. A never-synced entity counts as
 * changed unless its content is in `pristine` (the untouched starter data every device has).
 */
export function hasLocalChange(
  local: SyncRecord,
  pristine: ReadonlySet<string> = new Set(),
): boolean {
  if (local.baseRevision === undefined) return !local.deleted && !pristine.has(local.fingerprint);
  return local.fingerprint !== local.syncedFingerprint;
}

/** Fingerprint of a cloud row, comparable with local `fingerprint`. */
export function remoteFingerprint(remote: RemoteEntity): string {
  return remote.deleted ? '' : fingerprint(remote.payload);
}

/**
 * Compare this device with the cloud, entity by entity. Campaigns come before characters so
 * a character never arrives before its campaign. Pure: the caller performs the steps.
 */
export function planSync(
  local: readonly SyncRecord[],
  remote: readonly RemoteEntity[],
  pristine: ReadonlySet<string> = new Set(),
): SyncStep[] {
  const locals = new Map(local.map((row) => [syncId(row.kind, row.entityId), row]));
  const remotes = new Map(remote.map((row) => [syncId(row.kind, row.entityId), row]));
  const steps: SyncStep[] = [];
  for (const id of new Set([...locals.keys(), ...remotes.keys()])) {
    const mine = locals.get(id);
    const theirs = remotes.get(id);
    if (!theirs) {
      // Never uploaded, or the cloud lost it: upload anything that still exists here.
      if (mine && !mine.deleted)
        steps.push({
          type: 'push',
          id,
          kind: mine.kind,
          entityId: mine.entityId,
          expectedRevision: null,
        });
      continue;
    }
    if (!mine) {
      steps.push({ type: theirs.deleted ? 'adopt' : 'pull', id, remote: theirs });
      continue;
    }
    const changedHere = hasLocalChange(mine, pristine);
    const changedThere = theirs.revision !== mine.baseRevision;
    if (!changedThere) {
      if (changedHere)
        steps.push({
          type: 'push',
          id,
          kind: mine.kind,
          entityId: mine.entityId,
          expectedRevision: theirs.revision,
        });
      continue;
    }
    if (remoteFingerprint(theirs) === mine.fingerprint) {
      steps.push({ type: 'adopt', id, remote: theirs });
    } else if (!changedHere) {
      steps.push({ type: 'pull', id, remote: theirs });
    } else {
      steps.push({ type: 'conflict', id, remote: theirs });
    }
  }
  const order = (step: SyncStep) =>
    (step.type === 'push' ? step.kind : step.remote.kind) === 'campaign' ? 0 : 1;
  return steps.sort((a, b) => order(a) - order(b));
}
