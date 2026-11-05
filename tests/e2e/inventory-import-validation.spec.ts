import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import {
  ExportFileSchema,
  type CharacterBuild,
  type ExportFile,
  type LiveState,
  type LogEvent,
} from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

interface Stored<T> {
  id: string;
  data: T;
}

interface DatabaseSnapshot {
  builds: Stored<CharacterBuild>[];
  live: Stored<LiveState>[];
  events: (Stored<LogEvent> & { characterId: string; order: number })[];
  campaigns: unknown[];
  settings: unknown[];
  backups: unknown[];
  userPacks: unknown[];
}

const legacyId = String('constructor');
const hud = (page: Page) => page.getByRole('banner', { name: 'Character HUD', exact: true });
const undo = (page: Page) => page.getByRole('button', { name: 'Undo last command', exact: true });

async function saved(page: Page) {
  await expect(page.locator('[role="status"][aria-label="Local save status"]')).toContainText(
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

function character(snapshot: DatabaseSnapshot, characterId = 'the-fool') {
  return {
    build: snapshot.builds.find(({ id }) => id === characterId)!.data,
    live: snapshot.live.find(({ id }) => id === characterId)!.data,
    events: snapshot.events
      .filter((event) => event.characterId === characterId)
      .sort((left, right) => left.order - right.order)
      .map(({ data }) => data),
  };
}

function legacyFile(characterId: string, includeOwnLive: boolean): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = characterId;
  file.build.name = characterId;
  file.build.items = [
    { instanceId: legacyId, itemId: 'item.torch', notes: 'Legacy torch with recorded state' },
  ];
  file.live.characterId = characterId;
  file.live.items = includeOwnLive
    ? { [legacyId]: { qty: 1, equipped: true, attuned: true, charges: 3 } }
    : {};
  file.events = [];
  return file;
}

async function selectImport(page: Page, file: ExportFile) {
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: `${file.build.id}.json`,
    mimeType: 'application/json',
    // The malformed fixture deliberately reaches the actual UI validation boundary.
    buffer: Buffer.from(JSON.stringify(file)),
  });
}

async function importValidLegacy(page: Page, characterId: string) {
  await page.goto('/');
  await saved(page);
  const file = legacyFile(characterId, true);
  expect(Object.hasOwn(file.live.items, legacyId)).toBe(true);
  await selectImport(page, file);
  const preview = page.getByRole('dialog', { name: 'Import character', exact: true });
  await expect(preview).toBeVisible();
  await preview.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(preview).toBeHidden();
  await saved(page);
  await page.goto(`/characters/${characterId}/inventory`);
  await saved(page);
}

test('an item without its own live entry is rejected before preview without changing any saved data', async ({
  page,
}) => {
  await page.goto('/');
  await saved(page);
  const before = await readDatabase(page);
  const malformed = legacyFile('inventory-missing-own-live', false);
  expect(Object.hasOwn(malformed.live.items, legacyId)).toBe(false);
  expect(legacyId in malformed.live.items).toBe(true);
  await selectImport(page, malformed);
  await expect(page.getByRole('alert')).toContainText('Import failed:');
  await expect(page.getByRole('dialog', { name: 'Import character', exact: true })).toHaveCount(0);
  expect(await readDatabase(page)).toEqual(before);

  await page.getByRole('article', { name: 'The Fool', exact: true }).getByRole('link').click();
  await expect(hud(page)).toBeVisible();
  await saved(page);
  await page.goto('/characters/the-fool/inventory');
  await saved(page);
  const candle = page.getByRole('article', { name: 'Candle', exact: true });
  await candle.getByRole('button', { name: 'Add one: Candle', exact: true }).click();
  await saved(page);
  expect(character(await readDatabase(page)).live.items['candle-1']?.qty).toBe(6);
  await undo(page).click();
  await saved(page);
  const restored = character(await readDatabase(page));
  expect(restored.build).toEqual(character(before).build);
  expect(restored.live).toEqual(character(before).live);
  expect((await readDatabase(page)).backups).toEqual(before.backups);
});

test('a valid legacy own-key item imports, edits and restores exactly after reload and Undo', async ({
  page,
}) => {
  const characterId = 'inventory-own-live-legacy';
  await importValidLegacy(page, characterId);
  const importedDatabase = await readDatabase(page);
  const before = character(importedDatabase, characterId);
  expect(Object.hasOwn(before.live.items, legacyId)).toBe(true);
  expect(before.live.items[legacyId]).toEqual({
    qty: 1,
    equipped: true,
    attuned: true,
    charges: 3,
  });
  const torch = page
    .getByRole('article', { name: 'Torch', exact: true })
    .and(page.locator('[data-instance-id="constructor"]'));
  await expect(torch).toContainText('Legacy torch with recorded state');
  await torch.getByRole('button', { name: 'Edit: Torch', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit item', exact: true });
  await editor.getByLabel('Quantity', { exact: true }).fill('2');
  await editor.getByLabel('Notes', { exact: true }).fill('Reviewed legacy torch');
  await editor.getByRole('button', { name: 'Save item', exact: true }).click();
  await expect(editor).toBeHidden();
  await saved(page);
  const edited = character(await readDatabase(page), characterId);
  expect(edited.build).toEqual({
    ...before.build,
    items: [{ ...before.build.items[0]!, notes: 'Reviewed legacy torch' }],
  });
  expect(edited.live).toEqual({
    ...before.live,
    items: { [legacyId]: { ...before.live.items[legacyId]!, qty: 2 } },
  });
  expect(edited.events.at(-1)?.command).toBe('editInventoryItem');
  await page.reload();
  await saved(page);
  expect(character(await readDatabase(page), characterId)).toEqual(edited);
  await undo(page).click();
  await saved(page);
  const restored = character(await readDatabase(page), characterId);
  expect(restored.build).toEqual(before.build);
  expect(restored.live).toEqual(before.live);
  expect(Object.hasOwn(restored.live.items, legacyId)).toBe(true);
  expect(restored.events.map(({ command }) => command)).toEqual(['editInventoryItem', 'undo']);
  expect(restored.events[0]?.undoneBy).toBe(restored.events[1]?.id);
  expect(character(await readDatabase(page))).toEqual(character(importedDatabase));
  expect((await readDatabase(page)).backups).toEqual(importedDatabase.backups);
});

test('loading a saved item with its own live entry removed preserves all data without reseeding', async ({
  page,
}) => {
  const characterId = 'inventory-corrupt-own-live';
  await importValidLegacy(page, characterId);
  await page.evaluate(
    async ({ id, instanceId }) => {
      const value = <T>(request: IDBRequest<T>) =>
        new Promise<T>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const db = await value(indexedDB.open('omnidnd'));
      try {
        const transaction = db.transaction('live', 'readwrite');
        const done = new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onabort = () => reject(transaction.error);
          transaction.onerror = () => reject(transaction.error);
        });
        const store = transaction.objectStore('live');
        const row = (await value(store.get(id))) as Stored<LiveState>;
        if (!Object.hasOwn(row.data.items, instanceId)) throw new Error('Legacy item missing');
        delete row.data.items[instanceId];
        store.put(row);
        await done;
      } finally {
        db.close();
      }
    },
    { id: characterId, instanceId: legacyId },
  );
  const malformed = await readDatabase(page);
  expect(Object.hasOwn(character(malformed, characterId).live.items, legacyId)).toBe(false);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Local storage unavailable', exact: true }),
  ).toBeVisible();
  await expect(hud(page)).toHaveCount(0);
  expect(await readDatabase(page)).toEqual(malformed);
});
