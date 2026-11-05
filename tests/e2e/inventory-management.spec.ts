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
}

const main = (page: Page) => page.getByRole('main');
const item = (page: Page, name: string, instanceId: string) =>
  main(page)
    .getByRole('article', { name, exact: true })
    .and(page.locator(`[data-instance-id="${instanceId}"]`));
const editDialog = (page: Page) => page.getByRole('dialog', { name: 'Edit item', exact: true });
const addDialog = (page: Page) => page.getByRole('dialog', { name: 'Add item', exact: true });
const removal = (page: Page) => page.getByRole('dialog', { name: 'Remove item?', exact: true });
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
      const stores = ['builds', 'live', 'events', 'campaigns', 'settings', 'backups'];
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

function character(snapshot: DatabaseSnapshot, id = 'the-fool') {
  return {
    build: snapshot.builds.find((row) => row.id === id)!.data,
    live: snapshot.live.find((row) => row.id === id)!.data,
    events: snapshot.events
      .filter((row) => row.characterId === id)
      .sort((left, right) => left.order - right.order)
      .map(({ data }) => data),
  };
}

function characterFile(id: string): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = id;
  file.build.name = id;
  file.live.characterId = id;
  file.events = [];
  return file;
}

function containerFile(id: string): ExportFile {
  const file = characterFile(id);
  for (const instanceId of ['bedroll-1', 'pouch-1', 'disguise-kit-1'])
    file.build.items.find((entry) => entry.instanceId === instanceId)!.container = 'backpack-1';
  file.build.items.find((entry) => entry.instanceId === 'candle-1')!.container = 'pouch-1';
  file.live.items['candle-1']!.charges = 3;
  return file;
}

async function importCharacter(page: Page, file: ExportFile) {
  await page.goto('/');
  await saved(page);
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: `${file.build.id}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(ExportFileSchema.parse(file))),
  });
  const importing = page.getByRole('dialog', { name: 'Import character', exact: true });
  await importing.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(importing).toBeHidden();
  await saved(page);
  await page.goto(`/characters/${file.build.id}/inventory`);
  await saved(page);
}

async function openEdit(page: Page, name: string, instanceId: string) {
  await item(page, name, instanceId)
    .getByRole('button', { name: `Edit: ${name}`, exact: true })
    .click();
  await expect(editDialog(page)).toBeVisible();
}

async function addArrow(page: Page, quantity: number, notes: string) {
  await main(page).getByRole('button', { name: 'Add item', exact: true }).click();
  await addDialog(page).getByRole('searchbox', { name: 'Search items', exact: true }).fill('arrow');
  await addDialog(page).getByRole('button', { name: 'Select Arrow', exact: true }).click();
  await expect(addDialog(page).getByLabel('Quantity', { exact: true })).toHaveValue('20');
  await addDialog(page).getByLabel('Quantity', { exact: true }).fill(String(quantity));
  await addDialog(page).getByLabel('Notes', { exact: true }).fill(notes);
  await addDialog(page).getByRole('button', { name: 'Add item', exact: true }).click();
  await expect(addDialog(page)).toBeHidden();
  await saved(page);
}

async function applyEdit(page: Page) {
  await editDialog(page).getByRole('button', { name: 'Save item', exact: true }).click();
  await expect(editDialog(page)).toBeHidden();
  await saved(page);
}

async function noOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
}

test('an empty character adds searched catalogue bundles as separate instances with durable Undo', async ({
  page,
}) => {
  const file = characterFile('inventory-catalogue');
  file.build.items = [];
  file.live.items = {};
  await importCharacter(page, file);
  const initial = await readDatabase(page);
  const before = character(initial, file.build.id);
  await expect(
    main(page).getByRole('heading', { name: 'No items recorded', exact: true }),
  ).toBeVisible();

  await addArrow(page, 20, 'Training supply');
  const first = character(await readDatabase(page), file.build.id);
  const firstArrow = first.build.items.find(({ itemId }) => itemId === 'item.arrow')!;
  expect(firstArrow).toMatchObject({ itemId: 'item.arrow', notes: 'Training supply' });
  expect(first.live).toEqual({
    ...before.live,
    items: { [firstArrow.instanceId]: { qty: 20, equipped: false, attuned: false } },
  });
  await addArrow(page, 7, 'Second quiver');
  const second = character(await readDatabase(page), file.build.id);
  expect(second.build.items).toHaveLength(2);
  const otherArrow = second.build.items.find(
    ({ instanceId }) => instanceId !== firstArrow.instanceId,
  )!;
  expect(otherArrow).toMatchObject({ itemId: 'item.arrow', notes: 'Second quiver' });
  expect(otherArrow.instanceId).not.toBe(firstArrow.instanceId);
  expect(second.live.items[firstArrow.instanceId]?.qty).toBe(20);
  expect(second.live.items[otherArrow.instanceId]?.qty).toBe(7);
  expect(second.live.currency).toEqual(before.live.currency);
  await expect(item(page, 'Arrow', firstArrow.instanceId)).toContainText('Training supply');
  await expect(item(page, 'Arrow', otherArrow.instanceId)).toContainText('Second quiver');
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveCount(1);

  await page.reload();
  await saved(page);
  expect(character(await readDatabase(page), file.build.id)).toEqual(second);
  await undo(page).click();
  await saved(page);
  const undoneSecond = character(await readDatabase(page), file.build.id);
  expect(undoneSecond.build).toEqual(first.build);
  expect(undoneSecond.live).toEqual(first.live);
  await undo(page).click();
  await saved(page);
  const undoneFirst = character(await readDatabase(page), file.build.id);
  expect(undoneFirst.build).toEqual(before.build);
  expect(undoneFirst.live).toEqual(before.live);
  expect(undoneFirst.events.map(({ command }) => command)).toEqual([
    'addInventoryItem',
    'addInventoryItem',
    'undo',
    'undo',
  ]);
  expect((await readDatabase(page)).backups).toEqual(initial.backups);
});

test('notes, absolute quantity and container edits preserve other records and exclude new cycles', async ({
  page,
}) => {
  const file = containerFile('inventory-edit');
  await importCharacter(page, file);
  const before = character(await readDatabase(page), file.build.id);
  await openEdit(page, 'Candle', 'candle-1');
  await editDialog(page).getByLabel('Quantity', { exact: true }).fill('3');
  await editDialog(page)
    .getByLabel('Container', { exact: true })
    .selectOption({ label: 'Backpack' });
  await editDialog(page).getByLabel('Notes', { exact: true }).fill('Dry candles, kept separately');
  await applyEdit(page);
  const after = character(await readDatabase(page), file.build.id);
  expect(after.build).toEqual({
    ...before.build,
    items: before.build.items.map((entry) =>
      entry.instanceId === 'candle-1'
        ? { ...entry, container: 'backpack-1', notes: 'Dry candles, kept separately' }
        : entry,
    ),
  });
  expect(after.live).toEqual({
    ...before.live,
    items: { ...before.live.items, 'candle-1': { ...before.live.items['candle-1']!, qty: 3 } },
  });
  await expect(main(page).getByRole('region', { name: 'Backpack', exact: true })).toContainText(
    'Dry candles, kept separately',
  );
  await openEdit(page, 'Backpack', 'backpack-1');
  const container = editDialog(page).getByLabel('Container', { exact: true });
  await expect(container.getByRole('option', { name: 'Carried', exact: true })).toHaveCount(1);
  for (const id of ['backpack-1', 'pouch-1']) {
    const invalid = container.locator(`option[value="${id}"]`);
    if (await invalid.count()) await expect(invalid).toBeDisabled();
    else await expect(invalid).toHaveCount(0);
  }
  await editDialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.reload();
  await saved(page);
  expect(character(await readDatabase(page), file.build.id)).toEqual(after);
  await undo(page).click();
  await saved(page);
  const restored = character(await readDatabase(page), file.build.id);
  expect(restored.build).toEqual(before.build);
  expect(restored.live).toEqual(before.live);
});

test('removing a container rehomes direct contents, retains nested contents and undoes exactly', async ({
  page,
}) => {
  const file = containerFile('inventory-remove-container');
  await importCharacter(page, file);
  const initial = await readDatabase(page);
  const before = character(initial, file.build.id);
  await openEdit(page, 'Backpack', 'backpack-1');
  await editDialog(page).getByRole('button', { name: 'Remove item', exact: true }).click();
  await expect(removal(page)).toBeVisible();
  await expect(removal(page)).toContainText('Carried');
  await removal(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(removal(page)).toBeHidden();
  expect(await readDatabase(page)).toEqual(initial);
  if (!(await editDialog(page).isVisible())) await openEdit(page, 'Backpack', 'backpack-1');
  await editDialog(page).getByRole('button', { name: 'Remove item', exact: true }).click();
  await removal(page).getByRole('button', { name: 'Remove item', exact: true }).click();
  await expect(removal(page)).toBeHidden();
  await saved(page);
  const after = character(await readDatabase(page), file.build.id);
  const expectedItems = before.build.items
    .filter(({ instanceId }) => instanceId !== 'backpack-1')
    .map((entry) => {
      if (entry.container !== 'backpack-1') return entry;
      const copy = { ...entry };
      delete copy.container;
      return copy;
    });
  const expectedLive = structuredClone(before.live);
  delete expectedLive.items['backpack-1'];
  expect(after.build).toEqual({ ...before.build, items: expectedItems });
  expect(after.live).toEqual(expectedLive);
  expect(after.build.items.find(({ instanceId }) => instanceId === 'candle-1')?.container).toBe(
    'pouch-1',
  );
  await expect(main(page).getByRole('region', { name: 'Pouch', exact: true })).toContainText(
    'Candle',
  );
  expect(character(await readDatabase(page))).toEqual(character(initial));
  await page.reload();
  await saved(page);
  await undo(page).click();
  await saved(page);
  const restored = character(await readDatabase(page), file.build.id);
  expect(restored.build).toEqual(before.build);
  expect(restored.live).toEqual(before.live);
  expect(restored.events.map(({ command }) => command)).toEqual(['removeInventoryItem', 'undo']);
});

test('Add and Edit drafts cancel with Escape or Cancel and retain all durable records', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/characters/the-fool/inventory');
  await saved(page);
  const before = await readDatabase(page);
  const add = main(page).getByRole('button', { name: 'Add item', exact: true });
  await add.click();
  await addDialog(page).getByRole('searchbox', { name: 'Search items', exact: true }).fill('torch');
  await addDialog(page).getByRole('button', { name: 'Select Torch', exact: true }).click();
  await addDialog(page).getByLabel('Quantity', { exact: true }).fill('12');
  await addDialog(page).getByLabel('Notes', { exact: true }).fill('Unsaved supply');
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`inventory-add-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(addDialog(page)).toBeHidden();
  await expect(add).toBeFocused();
  expect(await readDatabase(page)).toEqual(before);

  const edit = item(page, 'Flute', 'flute-1').getByRole('button', {
    name: 'Edit: Flute',
    exact: true,
  });
  await edit.click();
  await editDialog(page).getByLabel('Quantity', { exact: true }).fill('4');
  await editDialog(page)
    .getByLabel('Container', { exact: true })
    .selectOption({ label: 'Backpack' });
  await editDialog(page).getByLabel('Notes', { exact: true }).fill('Discard this edit');
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`inventory-edit-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  await editDialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editDialog(page)).toBeHidden();
  await expect(edit).toBeFocused();
  expect(await readDatabase(page)).toEqual(before);
});

test('legacy cycles survive note-only edits until explicitly repaired, and both changes undo', async ({
  page,
}) => {
  const file = containerFile('inventory-legacy-cycle');
  file.build.items.find(({ instanceId }) => instanceId === 'backpack-1')!.container = 'pouch-1';
  await importCharacter(page, file);
  const before = character(await readDatabase(page), file.build.id);
  await openEdit(page, 'Backpack', 'backpack-1');
  await editDialog(page).getByLabel('Notes', { exact: true }).fill('Reviewed without moving');
  await applyEdit(page);
  const noted = character(await readDatabase(page), file.build.id);
  expect(noted.build).toEqual({
    ...before.build,
    items: before.build.items.map((entry) =>
      entry.instanceId === 'backpack-1' ? { ...entry, notes: 'Reviewed without moving' } : entry,
    ),
  });
  expect(noted.live).toEqual(before.live);
  await expect(
    main(page).getByRole('region', { name: 'Review container links', exact: true }),
  ).toBeVisible();
  await openEdit(page, 'Backpack', 'backpack-1');
  await editDialog(page)
    .getByLabel('Container', { exact: true })
    .selectOption({ label: 'Carried' });
  await applyEdit(page);
  const repaired = character(await readDatabase(page), file.build.id);
  expect(
    repaired.build.items.find(({ instanceId }) => instanceId === 'backpack-1'),
  ).not.toHaveProperty('container');
  expect(repaired.build.items.find(({ instanceId }) => instanceId === 'pouch-1')?.container).toBe(
    'backpack-1',
  );
  expect(repaired.build.items.find(({ instanceId }) => instanceId === 'candle-1')?.container).toBe(
    'pouch-1',
  );
  await expect(
    main(page).getByRole('region', { name: 'Review container links', exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await saved(page);
  await undo(page).click();
  await saved(page);
  expect(character(await readDatabase(page), file.build.id).build).toEqual(noted.build);
  await undo(page).click();
  await saved(page);
  const restored = character(await readDatabase(page), file.build.id);
  expect(restored.build).toEqual(before.build);
  expect(restored.live).toEqual(before.live);
});

test('removing equipped armor updates shared AC and preserves exact restoration after reload', async ({
  page,
}) => {
  await page.goto('/characters/the-fool/inventory');
  await saved(page);
  const initial = await readDatabase(page);
  const before = character(initial);
  await openEdit(page, 'Leather Armor', 'leather-armor-1');
  await editDialog(page).getByRole('button', { name: 'Remove item', exact: true }).click();
  await removal(page).getByRole('button', { name: 'Remove item', exact: true }).click();
  await saved(page);
  const hud = page.getByRole('banner', { name: 'Character HUD', exact: true });
  await expect(hud.getByRole('button', { name: 'AC 12', exact: true })).toBeVisible();
  await expect(item(page, 'Leather Armor', 'leather-armor-1')).toHaveCount(0);
  const after = character(await readDatabase(page));
  const expectedLive = structuredClone(before.live);
  delete expectedLive.items['leather-armor-1'];
  expect(after.live).toEqual(expectedLive);
  expect(after.build).toEqual({
    ...before.build,
    items: before.build.items.filter(({ instanceId }) => instanceId !== 'leather-armor-1'),
  });
  await page.reload();
  await saved(page);
  await undo(page).click();
  await saved(page);
  await expect(hud.getByRole('button', { name: 'AC 13', exact: true })).toBeVisible();
  const restored = character(await readDatabase(page));
  expect(restored.build).toEqual(before.build);
  expect(restored.live).toEqual(before.live);
  expect(restored.events.map(({ command }) => command)).toEqual(['removeInventoryItem', 'undo']);
  expect((await readDatabase(page)).backups).toEqual(initial.backups);
});

test('other-source catalogue choices retain their draft through warning Cancel and log an explicit override', async ({
  page,
}) => {
  const file = characterFile('inventory-source-review');
  file.campaign.id = 'inventory-homebrew-campaign';
  file.campaign.name = 'Homebrew source review';
  file.campaign.sources = ['HB'];
  file.build.campaignId = file.campaign.id;
  await importCharacter(page, file);
  const initial = await readDatabase(page);
  const before = character(initial, file.build.id);
  await main(page).getByRole('button', { name: 'Add item', exact: true }).click();
  await addDialog(page).getByRole('searchbox', { name: 'Search items', exact: true }).fill('torch');
  await expect(addDialog(page)).toContainText('No items match these choices.');
  await expect(
    addDialog(page).getByRole('button', { name: 'Select Torch', exact: true }),
  ).toHaveCount(0);
  await addDialog(page)
    .getByRole('checkbox', { name: 'Include other sources', exact: true })
    .check();
  await addDialog(page).getByRole('button', { name: 'Select Torch', exact: true }).click();
  await addDialog(page).getByLabel('Quantity', { exact: true }).fill('4');
  await addDialog(page).getByLabel('Notes', { exact: true }).fill('DM-approved expedition supply');
  await addDialog(page).getByRole('button', { name: 'Add item', exact: true }).click();
  const warning = page.getByRole('dialog', { name: 'Check this action', exact: true });
  await expect(warning).toContainText(/Torch.*outside.*enabled sources/);
  expect(await readDatabase(page)).toEqual(initial);
  await warning.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(warning).toBeHidden();
  await expect(addDialog(page)).toBeVisible();
  await expect(addDialog(page).getByLabel('Quantity', { exact: true })).toHaveValue('4');
  await expect(addDialog(page).getByLabel('Notes', { exact: true })).toHaveValue(
    'DM-approved expedition supply',
  );
  expect(await readDatabase(page)).toEqual(initial);
  await addDialog(page).getByRole('button', { name: 'Add item', exact: true }).click();
  await expect(warning).toBeVisible();
  await warning.getByRole('button', { name: 'Do anyway', exact: true }).click();
  await expect(addDialog(page)).toBeHidden();
  await saved(page);
  const afterDatabase = await readDatabase(page);
  const after = character(afterDatabase, file.build.id);
  const torch = after.build.items.find(
    ({ instanceId }) => !before.build.items.some((original) => original.instanceId === instanceId),
  )!;
  expect(torch).toMatchObject({ itemId: 'item.torch', notes: 'DM-approved expedition supply' });
  expect(after.live.items[torch.instanceId]).toEqual({
    qty: 4,
    equipped: false,
    attuned: false,
  });
  expect(after.events).toHaveLength(1);
  expect(after.events[0]).toMatchObject({ command: 'addInventoryItem', override: true });
  expect(afterDatabase.campaigns).toEqual(initial.campaigns);
  expect(afterDatabase.backups).toEqual(initial.backups);
  await page.reload();
  await saved(page);
  expect(character(await readDatabase(page), file.build.id)).toEqual(after);
  await undo(page).click();
  await saved(page);
  const restored = character(await readDatabase(page), file.build.id);
  expect(restored.build).toEqual(before.build);
  expect(restored.live).toEqual(before.live);
  expect((await readDatabase(page)).campaigns).toEqual(initial.campaigns);
});
