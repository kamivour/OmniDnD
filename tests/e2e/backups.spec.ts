import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import type { WorkspaceRows } from '../../src/db/database';
import {
  ExportFileSchema,
  type Campaign,
  type CharacterBuild,
  type ExportFile,
  type LiveState,
  type LogEvent,
} from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

interface Stored<T> {
  id: string;
  schemaVersion: number;
  data: T;
}

interface BackupData {
  kind: 'omnidnd-workspace-backup';
  payloadVersion: 1;
  reason: 'before-import' | 'before-reset' | 'after-long-rest';
  capturedAt: string;
  order: number;
  workspace: WorkspaceRows;
}

interface DatabaseSnapshot {
  builds: Stored<CharacterBuild>[];
  live: Stored<LiveState>[];
  events: (Stored<LogEvent> & { characterId: string; order: number })[];
  campaigns: Stored<Campaign>[];
  settings: Stored<unknown>[];
  backups: Stored<unknown>[];
  userPacks: Stored<unknown>[];
}

interface BackupTestWindow extends Window {
  __backupProbe?: {
    release: () => Promise<void>;
    writes: string[];
    restore: () => void;
  };
  __failedBackup?: Stored<BackupData>;
}

const hud = (page: Page) => page.getByRole('banner', { name: 'Character HUD', exact: true });
const hp = (page: Page) => hud(page).getByRole('button', { name: 'Adjust hit points' });
const rest = (page: Page) => page.getByRole('dialog', { name: 'Long Rest', exact: true });

async function saved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

async function readDatabase(page: Page): Promise<DatabaseSnapshot> {
  return page.evaluate(async () => {
    const value = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await value(indexedDB.open('omnidnd'));
    try {
      const stores = ['builds', 'live', 'events', 'campaigns', 'settings', 'backups', 'userPacks'];
      const transaction = db.transaction(stores, 'readonly');
      return Object.fromEntries(
        await Promise.all(
          stores.map(async (name) => [name, await value(transaction.objectStore(name).getAll())]),
        ),
      ) as unknown as DatabaseSnapshot;
    } finally {
      db.close();
    }
  });
}

function workspace(snapshot: DatabaseSnapshot): WorkspaceRows {
  const setting = (id: string) => snapshot.settings.find((row) => row.id === id)?.data;
  return {
    builds: snapshot.builds,
    live: snapshot.live,
    events: snapshot.events,
    campaigns: snapshot.campaigns,
    automation: setting('automation'),
    reducedMotion: setting('reducedMotion'),
    managementEvents: setting('managementEvents'),
    bookmarks: setting('bookmarks'),
    activityOrder: setting('activityOrder'),
  } as WorkspaceRows;
}

function normalized(rows: WorkspaceRows) {
  const byId = <T extends { id: string }>(values: T[]) =>
    [...values].sort((left, right) => left.id.localeCompare(right.id));
  return {
    ...rows,
    builds: byId(rows.builds),
    live: byId(rows.live),
    events: byId(rows.events),
    campaigns: byId(rows.campaigns),
  };
}

function backups(snapshot: DatabaseSnapshot): Stored<BackupData>[] {
  return snapshot.backups
    .filter(
      (row) =>
        (row.data as Partial<BackupData>)?.kind === 'omnidnd-workspace-backup' &&
        (row.data as Partial<BackupData>)?.payloadVersion === 1,
    )
    .map((row) => row as Stored<BackupData>)
    .sort((left, right) => left.data.order - right.data.order);
}

async function damage(page: Page, amount: number) {
  await hp(page).click();
  const dialog = page.getByRole('dialog', { name: 'Hit points', exact: true });
  for (const digit of String(amount))
    await dialog.getByRole('button', { name: digit, exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function openRest(page: Page) {
  if (page.viewportSize()!.width < 640) {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'More', exact: true })
      .getByRole('button', { name: 'Long Rest', exact: true })
      .click();
  } else {
    await page
      .getByRole('button', { name: 'Long Rest', exact: true })
      .filter({ visible: true })
      .click();
  }
  await expect(rest(page)).toBeVisible();
}

async function completeRest(page: Page) {
  await openRest(page);
  await rest(page).getByRole('button', { name: 'Apply Long Rest', exact: true }).click();
  const warning = page.getByRole('dialog', { name: 'Check this action', exact: true });
  if (await warning.isVisible())
    await warning.getByRole('button', { name: 'Do anyway', exact: true }).click();
  await expect(rest(page)).toBeHidden();
}

async function selectImport(page: Page, file: ExportFile) {
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: 'backup-check.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(ExportFileSchema.parse(file))),
  });
  await expect(page.getByRole('dialog', { name: 'Import character', exact: true })).toBeVisible();
}

async function applyImport(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Import character', exact: true });
  await dialog.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(dialog).toBeHidden();
  await saved(page);
}

test('only a completed long rest backs up its exact post-rest workspace', async ({ page }) => {
  await page.goto('/characters/the-fool');
  await saved(page);
  expect(backups(await readDatabase(page))).toEqual([]);
  await damage(page, 3);
  await saved(page);
  await openRest(page);
  await rest(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(backups(await readDatabase(page))).toEqual([]);

  await completeRest(page);
  await saved(page);
  const rested = await readDatabase(page);
  const [backup] = backups(rested);
  expect(backups(rested)).toHaveLength(1);
  expect(backup?.data.reason).toBe('after-long-rest');
  expect(normalized(backup!.data.workspace)).toEqual(normalized(workspace(rested)));
  expect(backup?.data.workspace.live[0]?.data.hp).toBe(19);
  expect(backup?.data.workspace.events.at(-1)?.data.command).toBe('completeLongRest');
  await damage(page, 3);
  await saved(page);
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await saved(page);
  await page.reload();
  await saved(page);
  expect(backups(await readDatabase(page))).toEqual([backup]);
});

test('a stale window cannot write a long-rest backup or replace newer saved data', async ({
  page,
}) => {
  await page.goto('/characters/the-fool');
  await saved(page);
  const stale = await page.context().newPage();
  try {
    await stale.goto('/characters/the-fool');
    await saved(stale);
    await damage(page, 3);
    await saved(page);
    const before = await readDatabase(page);
    await completeRest(stale);
    await expect(
      stale.getByRole('status', { name: 'Local save status', exact: true }),
    ).toContainText('Save conflict');
    expect(await readDatabase(page)).toEqual(before);
    await expect(stale.getByRole('button', { name: 'Retry save', exact: true })).toHaveCount(0);
    await stale.reload();
    await saved(stale);
    await expect(hp(stale)).toHaveText(/8\s*\/\s*19/);
    expect(await readDatabase(page)).toEqual(before);
  } finally {
    await stale.close();
  }
});

test('import saves every campaign and preference before adding a character with rest history', async ({
  page,
}) => {
  await page.goto('/settings');
  await saved(page);
  await page.getByRole('radio', { name: /^Manual/ }).check();
  await saved(page);
  await page.getByRole('checkbox', { name: 'Always reduce motion', exact: true }).check();
  await saved(page);
  const other = ExportFileSchema.parse(seed);
  other.build.id = 'other-character';
  other.build.name = 'Another campaign character';
  other.live.characterId = other.build.id;
  other.campaign.id = 'other-campaign';
  other.campaign.name = 'Another campaign';
  other.build.campaignId = other.campaign.id;
  await selectImport(page, other);
  await applyImport(page);
  await page.goto('/characters/the-fool');
  await saved(page);
  await completeRest(page);
  await saved(page);
  await damage(page, 3);
  await saved(page);
  const before = await readDatabase(page);
  const file = ExportFileSchema.parse(seed);
  file.build = structuredClone(before.builds.find(({ id }) => id === 'the-fool')!.data);
  file.live = structuredClone(before.live.find(({ id }) => id === 'the-fool')!.data);
  file.events = before.events
    .filter(({ characterId }) => characterId === 'the-fool')
    .sort((left, right) => left.order - right.order)
    .map(({ data }, index) => ({
      ...data,
      id: `imported-history-${index}`,
      characterId: 'rest-copy',
    }));
  file.build.id = 'rest-copy';
  file.build.name = 'Imported rest history';
  file.live.characterId = 'rest-copy';
  expect(file.events.some((event) => event.command === 'completeLongRest')).toBe(true);
  await page.goto('/settings');
  await saved(page);
  await selectImport(page, file);
  // Preview and cancellation do not create recovery copies.
  await page
    .getByRole('dialog', { name: 'Import character', exact: true })
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  expect(await readDatabase(page)).toEqual(before);
  await selectImport(page, file);
  await applyImport(page);
  const after = await readDatabase(page);
  expect(backups(after)).toHaveLength(backups(before).length + 1);
  const imported = backups(after).at(-1)!;
  expect(imported.data.reason).toBe('before-import');
  expect(normalized(imported.data.workspace)).toEqual(normalized(workspace(before)));
  expect(imported.data.workspace.campaigns).toHaveLength(2);
  expect(imported.data.workspace.builds).toHaveLength(2);
  expect(imported.data.workspace.automation).toBe('manual');
  expect(imported.data.workspace.reducedMotion).toBe(true);
  expect(after.builds).toHaveLength(3);
  expect(after.events.filter(({ characterId }) => characterId === 'rest-copy')).toHaveLength(2);
});

for (const recovery of ['Retry', 'later command'] as const) {
  test(`backup insert failure rolls back the workspace; ${recovery} saves the original snapshot once`, async ({
    page,
  }) => {
    await page.goto('/characters/the-fool');
    await saved(page);
    const before = await readDatabase(page);
    await page.evaluate(() => {
      const add = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (value: unknown, key?: IDBValidKey) {
        if (this.name === 'backups') {
          (window as BackupTestWindow).__failedBackup = structuredClone(
            value,
          ) as Stored<BackupData>;
          IDBObjectStore.prototype.add = add;
          throw new DOMException('Backup quota test failure', 'QuotaExceededError');
        }
        return key === undefined ? add.call(this, value) : add.call(this, value, key);
      };
    });
    await completeRest(page);
    await expect(
      page.getByRole('status', { name: 'Local save status', exact: true }),
    ).toContainText('Save failed');
    expect(await readDatabase(page)).toEqual(before);
    const intended = await page.evaluate(() => (window as BackupTestWindow).__failedBackup);
    expect(intended?.data.reason).toBe('after-long-rest');
    expect(intended?.data.workspace.live[0]?.data.hp).toBe(19);
    if (recovery === 'Retry') {
      await page.getByRole('button', { name: 'Retry save', exact: true }).click();
    } else {
      await damage(page, 3);
    }
    await saved(page);
    const after = await readDatabase(page);
    expect(backups(after)).toEqual([intended]);
    expect(after.live[0]?.data.hp).toBe(recovery === 'Retry' ? 19 : 16);
    await page.reload();
    await saved(page);
    expect(backups(await readDatabase(page))).toEqual([intended]);
  });
}

test('queued ordinary saves cannot consume a later backup, and later damage cannot change it', async ({
  page,
}) => {
  await page.goto('/characters/the-fool');
  await saved(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('omnidnd');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction('live', 'readwrite');
    const store = transaction.objectStore('live');
    let released = false;
    const finished = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    const put = IDBObjectStore.prototype.put;
    const add = IDBObjectStore.prototype.add;
    const writes: string[] = [];
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === 'live') writes.push(`live:${(value as Stored<LiveState>).data.hp}`);
      return key === undefined ? put.call(this, value) : put.call(this, value, key);
    };
    IDBObjectStore.prototype.add = function (value: unknown, key?: IDBValidKey) {
      if (this.name === 'backups')
        writes.push(`backup:${(value as Stored<BackupData>).data.reason}`);
      return key === undefined ? add.call(this, value) : add.call(this, value, key);
    };
    (window as BackupTestWindow).__backupProbe = {
      writes,
      release: async () => {
        released = true;
        try {
          await finished;
        } finally {
          db.close();
        }
      },
      restore: () => {
        IDBObjectStore.prototype.put = put;
        IDBObjectStore.prototype.add = add;
      },
    };
    await new Promise<void>((resolve, reject) => {
      const keepAlive = () => {
        const request = store.get('the-fool');
        request.onsuccess = () => {
          resolve();
          if (!released) keepAlive();
        };
        request.onerror = () => reject(request.error);
      };
      keepAlive();
    });
  });
  try {
    await damage(page, 5);
    await expect(hp(page)).toHaveText(/6\s*\/\s*19/);
    await completeRest(page);
    await expect(hp(page)).toHaveText(/19\s*\/\s*19/);
    await damage(page, 3);
    await expect(hp(page)).toHaveText(/16\s*\/\s*19/);
    await expect(
      page.getByRole('status', { name: 'Local save status', exact: true }),
    ).toContainText('Saving');
  } finally {
    await page.evaluate(async () => {
      await (window as BackupTestWindow).__backupProbe?.release();
    });
  }
  try {
    await saved(page);
    const writes = await page.evaluate(
      () => (window as BackupTestWindow).__backupProbe?.writes ?? [],
    );
    expect(writes).toEqual(['live:6', 'backup:after-long-rest', 'live:19', 'live:16']);
    const after = await readDatabase(page);
    const [backup] = backups(after);
    expect(backups(after)).toHaveLength(1);
    expect(backup?.data.workspace.live[0]?.data.hp).toBe(19);
    expect(backup?.data.workspace.events.map(({ data }) => data.command)).toEqual([
      'applyDamage',
      'completeLongRest',
    ]);
    expect(after.live[0]?.data.hp).toBe(16);
  } finally {
    await page.evaluate(() => {
      (window as BackupTestWindow).__backupProbe?.restore();
      delete (window as BackupTestWindow).__backupProbe;
    });
  }
});

test('retention failure rolls back; Retry keeps ten local backups and preserves opaque records', async ({
  page,
}) => {
  await page.goto('/characters/the-fool');
  await saved(page);
  await completeRest(page);
  await saved(page);
  await page.evaluate(async () => {
    const value = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await value(indexedDB.open('omnidnd'));
    try {
      const transaction = db.transaction(['backups', 'settings', 'userPacks'], 'readwrite');
      const done = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      const store = transaction.objectStore('backups');
      const [original] = (await value(store.getAll())) as Stored<BackupData>[];
      for (let order = 2; order <= 10; order += 1) {
        store.add({
          ...original,
          id: `backup:${crypto.randomUUID()}`,
          data: {
            ...original!.data,
            order,
            capturedAt: order % 2 ? '2099-01-01T00:00:00.000Z' : '2000-01-01T00:00:00.000Z',
          },
        });
      }
      store.add({ id: 'foreign-row', schemaVersion: 999, data: { keep: ['unchanged'] } });
      store.add({ ...original, id: 'future-row', data: { ...original!.data, payloadVersion: 2 } });
      transaction
        .objectStore('settings')
        .put({ id: 'foreign-setting', schemaVersion: 1, data: { keep: true } });
      transaction
        .objectStore('userPacks')
        .put({ id: 'foreign-pack', schemaVersion: 1, data: { keep: true } });
      await done;
    } finally {
      db.close();
    }
    const remove = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (key: IDBValidKey | IDBKeyRange) {
      if (this.name === 'backups') {
        IDBObjectStore.prototype.delete = remove;
        throw new DOMException('Retention test failure', 'QuotaExceededError');
      }
      return remove.call(this, key);
    };
  });
  const before = await readDatabase(page);
  await completeRest(page);
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Save failed',
  );
  expect(await readDatabase(page)).toEqual(before);
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await saved(page);
  const after = await readDatabase(page);
  expect(backups(after).map(({ data }) => data.order)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  expect(after.backups.filter(({ id }) => id === 'foreign-row' || id === 'future-row')).toEqual(
    before.backups.filter(({ id }) => id === 'foreign-row' || id === 'future-row'),
  );
  expect(after.userPacks).toEqual(before.userPacks);
  expect(after.settings.find(({ id }) => id === 'foreign-setting')).toEqual(
    before.settings.find(({ id }) => id === 'foreign-setting'),
  );
  await page.reload();
  await saved(page);
  await completeRest(page);
  await saved(page);
  expect(backups(await readDatabase(page)).map(({ data }) => data.order)).toEqual([
    3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  ]);
});
