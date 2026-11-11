import { z } from 'zod';
import { createStore } from 'zustand/vanilla';
import {
  AutomationSchema,
  database,
  deserializeWorkspace,
  parseStoredRecord,
  serializeWorkspace,
  storedRecord,
  type Workspace,
  type WorkspaceRows,
} from '../db/database';
import { characterStore, createCharacterStore } from './character-store';
import { starterFiles } from '../data/seed';
import { ManagementEventSchema } from '../engine/commands/management';
import { BookmarkSchema, PreferencesSchema } from '../engine/schema';
import { ActivityOrderSchema } from './activity-order';
import {
  createBackupIntent,
  ownedBackup,
  planBackups,
  snapshotBackupIntent,
  type BackupIntent,
  type BackupPayload,
} from '../db/backups';
import { planSyncRecords, SyncRecordSchema } from '../db/sync-metadata';

interface StorageStatus {
  ready: boolean;
  pending: number;
  error: string | null;
  conflict: boolean;
  /** IndexedDB has successfully loaded or saved this workspace; this is not a quota permission. */
  persistent: boolean;
}

export const storageStatusStore = createStore<StorageStatus>()(() => ({
  ready: false,
  pending: 0,
  error: null,
  conflict: false,
  persistent: false,
}));

let initialization: Promise<void> | undefined;
let subscribed = false;
let writeQueue: Promise<void> = Promise.resolve();
let workspaceRevision = 0;
// Intent payloads capture command-time state. Retry must never reconstruct them from later edits.
const pendingBackups = new Map<string, BackupIntent>();
/** True while restoreWorkspace swaps the state; the restored history is not a new command. */
let restoring = false;

export class WorkspaceConflictError extends Error {
  constructor() {
    super(
      'Saved data changed in another window. Changes here remain unsaved. Reload this window before editing.',
    );
    this.name = 'WorkspaceConflictError';
  }
}

async function readRevision(): Promise<number> {
  const row = await database.settings.get('workspaceRevision');
  return row ? parseStoredRecord(row, z.int().nonnegative(), 'workspace revision').data : 0;
}

function storageError(error: unknown): Error {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    return new Error(
      `Saved data is invalid: ${issue?.path.join('.') || 'record'}: ${issue?.message || 'validation failed'}`,
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

async function updateSyncRecords(rows: WorkspaceRows) {
  const saved = (await database.sync.toArray()).map((row) =>
    parseStoredRecord(row, SyncRecordSchema, 'sync record'),
  );
  const changes = planSyncRecords(saved, rows, new Date().toISOString());
  if (changes.length > 0) await database.sync.bulkPut(changes);
}

/** Replace the workspace atomically. Unrelated settings, packs, and backups stay untouched. */
async function replaceRows(rows: WorkspaceRows) {
  await Promise.all([
    database.builds.clear(),
    database.live.clear(),
    database.events.clear(),
    database.campaigns.clear(),
  ]);
  await Promise.all([
    database.builds.bulkPut(rows.builds),
    database.live.bulkPut(rows.live),
    database.events.bulkPut(rows.events),
    database.campaigns.bulkPut(rows.campaigns),
    database.settings.put(storedRecord('automation', rows.automation)),
    database.settings.put(storedRecord('reducedMotion', rows.reducedMotion ?? false)),
    database.settings.put(storedRecord('initialized', true)),
    database.settings.put(storedRecord('managementEvents', rows.managementEvents ?? [])),
    database.settings.put(storedRecord('bookmarks', rows.bookmarks ?? [])),
    ...(rows.activityOrder === undefined
      ? [database.settings.delete('activityOrder')]
      : [database.settings.put(storedRecord('activityOrder', rows.activityOrder))]),
  ]);
  await updateSyncRecords(rows);
}

async function saveWorkspace(snapshot: Workspace, backups: BackupIntent[]) {
  const rows = serializeWorkspace(snapshot);
  const nextRevision = await database.transaction(
    'rw',
    [
      database.builds,
      database.live,
      database.events,
      database.campaigns,
      database.settings,
      database.backups,
      database.sync,
    ],
    async () => {
      const currentRevision = await readRevision();
      if (currentRevision !== workspaceRevision) throw new WorkspaceConflictError();
      if (backups.length > 0) {
        const plan = planBackups(await database.backups.toArray(), backups);
        // add (rather than put) makes an unexpected id collision fail without replacing recovery data.
        await database.backups.bulkAdd(plan.add);
        await database.backups.bulkDelete(plan.remove);
      }
      await replaceRows(rows);
      const next = currentRevision + 1;
      await database.settings.put(storedRecord('workspaceRevision', next));
      return next;
    },
  );
  // Advance only after the transaction commits; a failed write keeps the old expectation.
  workspaceRevision = nextRevision;
}

async function loadOrSeedWorkspace(): Promise<{ workspace: Workspace; revision: number }> {
  return database.transaction(
    'rw',
    [
      database.builds,
      database.live,
      database.events,
      database.campaigns,
      database.settings,
      database.sync,
    ],
    async () => {
      const [builds, live, events, campaigns, settings] = await Promise.all([
        database.builds.toArray(),
        database.live.toArray(),
        database.events.toArray(),
        database.campaigns.toArray(),
        database.settings.toArray(),
      ]);
      const savedSettings = settings.map((row) => parseStoredRecord(row, z.unknown(), 'setting'));
      const initialized = savedSettings.find(({ id }) => id === 'initialized');
      const automation = savedSettings.find(({ id }) => id === 'automation');
      const reducedMotion = savedSettings.find(({ id }) => id === 'reducedMotion');
      const management = savedSettings.find(({ id }) => id === 'managementEvents');
      const bookmarks = savedSettings.find(({ id }) => id === 'bookmarks');
      const activityOrder = savedSettings.find(({ id }) => id === 'activityOrder');
      const mode = automation ? AutomationSchema.parse(automation.data) : 'assisted';
      const motion = reducedMotion
        ? PreferencesSchema.shape.reducedMotion.parse(reducedMotion.data)
        : false;
      if (initialized) {
        if (initialized.data !== true) throw new Error('Saved initialization marker is invalid');
        const workspace = deserializeWorkspace({
          builds,
          live,
          events,
          campaigns,
          automation: mode,
          reducedMotion: motion,
          managementEvents: management ? z.array(ManagementEventSchema).parse(management.data) : [],
          bookmarks: bookmarks ? z.array(BookmarkSchema).parse(bookmarks.data) : [],
          ...(activityOrder
            ? { activityOrder: ActivityOrderSchema.parse(activityOrder.data) }
            : {}),
        });
        // Back-fills metadata for workspaces saved before MA; a no-op once rows exist.
        await updateSyncRecords(serializeWorkspace(workspace));
        return { workspace, revision: await readRevision() };
      }
      if (builds.length || live.length || events.length || campaigns.length || bookmarks) {
        throw new Error('Saved workspace is missing its initialization marker');
      }
      const initial = {
        ...createCharacterStore(starterFiles()).getState(),
        automation: mode,
        reducedMotion: motion,
      };
      const rows = serializeWorkspace(initial);
      await replaceRows(rows);
      await database.settings.put(storedRecord('workspaceRevision', 1));
      return { workspace: deserializeWorkspace(rows), revision: 1 };
    },
  );
}

function enqueueSave(snapshot: Workspace) {
  // Older queued snapshots cannot commit recovery points for commands that happened after them.
  const eligibleBackups = [...pendingBackups.keys()];
  storageStatusStore.setState((status) => ({ pending: status.pending + 1 }));
  const operation = writeQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        const backups = eligibleBackups.flatMap((id) => {
          const intent = pendingBackups.get(id);
          return intent ? [intent] : [];
        });
        await saveWorkspace(snapshot, backups);
        backups.forEach(({ id }) => pendingBackups.delete(id));
        storageStatusStore.setState({ error: null, persistent: true, conflict: false });
      } catch (cause) {
        const error = storageError(cause);
        storageStatusStore.setState({
          error: error.message,
          persistent: false,
          conflict: error instanceof WorkspaceConflictError,
        });
        throw error;
      } finally {
        storageStatusStore.setState((status) => ({ pending: status.pending - 1 }));
      }
    });
  writeQueue = operation;
  // The caller observes failures through flush/status; background writes must not reject unhandled.
  void operation.catch(() => undefined);
}

/** Hydrate once before UI commands can run. Failed startup is retryable and never resets data. */
export function initializePersistence(): Promise<void> {
  if (storageStatusStore.getState().ready) return Promise.resolve();
  if (initialization) return initialization;
  storageStatusStore.setState({ error: null, persistent: false, conflict: false });
  initialization = (async () => {
    try {
      await database.open();
      const loaded = await loadOrSeedWorkspace();
      const { workspace } = loaded;
      workspaceRevision = loaded.revision;
      characterStore.setState(workspace);
      if (!subscribed) {
        characterStore.subscribe((next, previous) => {
          if (
            next.characters !== previous.characters ||
            next.campaigns !== previous.campaigns ||
            next.automation !== previous.automation ||
            next.reducedMotion !== previous.reducedMotion ||
            next.managementEvents !== previous.managementEvents ||
            next.bookmarks !== previous.bookmarks ||
            next.activityOrder !== previous.activityOrder
          ) {
            const backup = restoring
              ? undefined
              : createBackupIntent(previous, next, {
                  id: `backup:${crypto.randomUUID()}`,
                  capturedAt: new Date().toISOString(),
                });
            if (backup) pendingBackups.set(backup.id, backup);
            enqueueSave({
              characters: next.characters,
              campaigns: next.campaigns,
              automation: next.automation,
              reducedMotion: next.reducedMotion,
              managementEvents: next.managementEvents,
              bookmarks: next.bookmarks,
              ...(next.activityOrder === undefined ? {} : { activityOrder: next.activityOrder }),
            });
          }
        });
        subscribed = true;
      }
      storageStatusStore.setState({ ready: true, error: null, persistent: true, conflict: false });
    } catch (cause) {
      const error = storageError(cause);
      storageStatusStore.setState({ ready: false, error: error.message, persistent: false });
      throw error;
    } finally {
      initialization = undefined;
    }
  })();
  return initialization;
}

/** Wait through writes queued while waiting; report failure only if the latest snapshot is unsaved. */
export async function flushPersistence(): Promise<void> {
  if (!storageStatusStore.getState().ready) await initializePersistence();
  for (;;) {
    const current = writeQueue;
    try {
      await current;
    } catch (error) {
      if (current !== writeQueue) continue;
      throw error;
    }
    if (current === writeQueue) return;
  }
}

/** Recover a failed startup, or save the latest in-memory workspace after a write failure. */
export async function retryPersistence(): Promise<void> {
  if (!storageStatusStore.getState().ready) return initializePersistence();
  const {
    campaigns,
    characters,
    automation,
    reducedMotion,
    managementEvents,
    bookmarks,
    activityOrder,
  } = characterStore.getState();
  enqueueSave({
    campaigns,
    characters,
    automation,
    reducedMotion,
    managementEvents,
    bookmarks,
    ...(activityOrder === undefined ? {} : { activityOrder }),
  });
  await flushPersistence();
}

export interface SavedBackup {
  id: string;
  reason: BackupPayload['reason'];
  capturedAt: string;
  workspace: Workspace;
}

/** Automatic recovery points, newest first. Damaged or unknown rows are skipped, never deleted. */
export async function listBackups(): Promise<SavedBackup[]> {
  const rows = await database.backups.toArray();
  const found: SavedBackup[] = [];
  for (const row of rows
    .flatMap((entry) => ownedBackup(entry) ?? [])
    .sort((a, b) => b.data.order - a.data.order)) {
    try {
      found.push({
        id: row.id,
        reason: row.data.reason,
        capturedAt: row.data.capturedAt,
        workspace: deserializeWorkspace(row.data.workspace),
      });
    } catch {
      // A recovery point that no longer validates is left alone.
    }
  }
  return found;
}

/**
 * Replace the whole workspace with a validated one (a backup file or recovery point). The current
 * workspace is saved as a recovery point in the same write, so a restore can be taken back.
 */
export function restoreWorkspace(workspace: Workspace): void {
  const current = characterStore.getState();
  const backup = snapshotBackupIntent(current, 'before-restore', {
    id: `backup:${crypto.randomUUID()}`,
    capturedAt: new Date().toISOString(),
  });
  pendingBackups.set(backup.id, backup);
  restoring = true;
  try {
    characterStore.setState({
      campaigns: workspace.campaigns,
      characters: workspace.characters,
      automation: workspace.automation,
      reducedMotion: workspace.reducedMotion,
      managementEvents: workspace.managementEvents,
      bookmarks: workspace.bookmarks,
      activityOrder: workspace.activityOrder,
    });
  } finally {
    restoring = false;
  }
}
