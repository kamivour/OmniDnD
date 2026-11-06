import { database, parseStoredRecord, storedRecord, type Workspace } from '../db/database';
import { SyncRecordSchema, syncId, type SyncRecord } from '../db/sync-metadata';
import { characterStore, type CharacterStoreState } from '../state/character-store';
import { flushPersistence } from '../state/persistence';
import { syncWorkspace, type ConflictChoice, type SyncConflict } from './engine';
import type { SyncProvider } from './provider';

/** Settings row naming the account this device's cloud revisions belong to. */
const ACCOUNT_SETTING = 'syncAccount';

export interface SyncReport {
  uploaded: number;
  downloaded: number;
  skipped: number;
  conflicts: SyncConflict[];
  /** Downloads waited because something changed here during the sync; run again. */
  deferred: boolean;
}

async function readRecords(): Promise<SyncRecord[]> {
  return (await database.sync.toArray()).map(
    (row) => parseStoredRecord(row, SyncRecordSchema, 'sync record').data,
  );
}

/** Signing in with another account: forget which cloud revisions this device matched. */
async function bindAccount(accountId: string) {
  await database.transaction('rw', database.settings, database.sync, async () => {
    const saved = await database.settings.get(ACCOUNT_SETTING);
    if (saved?.data === accountId) return;
    const reset = (await readRecords()).map((record) => {
      const rest = { ...record };
      delete rest.baseRevision;
      delete rest.syncedFingerprint;
      return storedRecord(syncId(record.kind, record.entityId), rest);
    });
    await database.sync.bulkPut(reset);
    await database.settings.put(storedRecord(ACCOUNT_SETTING, accountId));
  });
}

function workspaceOf(state: CharacterStoreState): Workspace {
  const { campaigns, characters, automation, reducedMotion, managementEvents, bookmarks } = state;
  return {
    campaigns,
    characters,
    automation,
    reducedMotion,
    managementEvents,
    bookmarks,
    ...(state.activityOrder === undefined ? {} : { activityOrder: state.activityOrder }),
  };
}

/**
 * Sync this device with the signed-in account. Local saves finish first; downloaded changes
 * replace store records directly (with an automatic backup), not as undoable game actions.
 */
export async function runSync(
  provider: SyncProvider,
  choices: ReadonlyMap<string, ConflictChoice> = new Map(),
): Promise<SyncReport> {
  const account = await provider.currentAccount();
  if (!account) throw new Error('Sign in to sync.');
  await flushPersistence();
  await bindAccount(account.id);
  const before = characterStore.getState();
  const snapshot = workspaceOf(before);
  const records = await readRecords();
  const outcome = await syncWorkspace(snapshot, records, provider, choices);

  const after = characterStore.getState();
  const editedMeanwhile =
    after.campaigns !== before.campaigns ||
    after.characters !== before.characters ||
    after.managementEvents !== before.managementEvents;
  const apply = outcome.workspace !== snapshot && !editedMeanwhile;
  const original = new Map(records.map((record) => [syncId(record.kind, record.entityId), record]));

  await database.transaction('rw', database.sync, async () => {
    for (const record of outcome.records) {
      const id = syncId(record.kind, record.entityId);
      const was = original.get(id);
      const pulled = was?.fingerprint !== record.fingerprint || was.deleted !== record.deleted;
      // Skipped downloads are planned again next time.
      if (pulled && !apply) continue;
      const row = await database.sync.get(id);
      const current = row && parseStoredRecord(row, SyncRecordSchema, 'sync record').data;
      // A save during the sync keeps its newer content stamp; only the cloud revision is new.
      const savedSince =
        current && was && !pulled && current.fingerprint !== was.fingerprint
          ? {
              fingerprint: current.fingerprint,
              changedAt: current.changedAt,
              deleted: current.deleted,
            }
          : {};
      await database.sync.put(storedRecord(id, { ...record, ...savedSince }));
    }
  });

  if (apply) {
    const { campaigns, characters, managementEvents } = outcome.workspace;
    characterStore.setState({ campaigns, characters, managementEvents });
    await flushPersistence();
  }
  return {
    uploaded: outcome.uploaded,
    downloaded: apply ? outcome.downloaded : 0,
    skipped: outcome.skipped,
    conflicts: outcome.conflicts,
    deferred: outcome.workspace !== snapshot && !apply,
  };
}
