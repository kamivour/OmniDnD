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

interface OwnedItem {
  id: string;
  itemId: string;
  quantity?: number;
  equipped?: boolean;
  attuned?: boolean;
  charges?: number;
  notes?: string;
}

const main = (page: Page) => page.getByRole('main');
const summary = (page: Page) => main(page).getByRole('region', { name: 'Attunement', exact: true });
const opener = (page: Page) =>
  summary(page).getByRole('button', { name: 'Manage attunement', exact: true });
const manager = (page: Page) =>
  page.getByRole('dialog', { name: 'Manage attunement', exact: true });
const warning = (page: Page) =>
  page.getByRole('dialog', { name: 'Check this action', exact: true });
const row = (page: Page, name: string, instanceId: string) =>
  manager(page)
    .getByRole('article', { name, exact: true })
    .and(page.locator(`[data-instance-id="${instanceId}"]`));
const attuned = (page: Page, name: string, instanceId: string) =>
  row(page, name, instanceId).getByRole('checkbox', { name: `Attuned: ${name}`, exact: true });
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

function character(snapshot: DatabaseSnapshot, characterId: string) {
  return {
    build: snapshot.builds.find(({ id }) => id === characterId)!.data,
    live: snapshot.live.find(({ id }) => id === characterId)!.data,
    events: snapshot.events
      .filter((event) => event.characterId === characterId)
      .sort((left, right) => left.order - right.order)
      .map(({ data }) => data),
  };
}

function fixture(id: string, items: OwnedItem[]): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = id;
  file.build.name = id;
  file.build.items = items.map(({ id: instanceId, itemId, notes }) => ({
    instanceId,
    itemId,
    ...(notes === undefined ? {} : { notes }),
  }));
  file.live.characterId = id;
  file.live.items = Object.fromEntries(
    items.map((item) => [
      item.id,
      {
        qty: item.quantity ?? 1,
        equipped: item.equipped ?? false,
        attuned: item.attuned ?? false,
        ...(item.charges === undefined ? {} : { charges: item.charges }),
      },
    ]),
  );
  file.live.clock.seconds = 98765;
  file.live.combat = {
    round: 3,
    turnActive: true,
    economy: {
      actionUsed: true,
      bonusUsed: false,
      reactionUsed: true,
      movementUsed: 10,
      objectInteractionUsed: true,
      bonusActionSpellCast: false,
      otherSpellCast: false,
    },
  };
  file.events = [];
  return file;
}

const fourItems = (): OwnedItem[] => [
  { id: 'candle', itemId: 'item.candle' },
  { id: 'torch', itemId: 'item.torch' },
  { id: 'flute', itemId: 'item.flute', notes: 'A separate personal focus' },
  { id: 'pouch', itemId: 'item.pouch' },
];

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

async function showAll(page: Page) {
  await manager(page).getByRole('checkbox', { name: 'Show other items', exact: true }).check();
}

async function confirmMark(page: Page, name: string, instanceId: string) {
  // A warning leaves the controlled checkbox unchecked until the player confirms it.
  await attuned(page, name, instanceId).click();
  await expect(warning(page)).toBeVisible();
  await warning(page).getByRole('button', { name: 'Do anyway', exact: true }).click();
  await expect(warning(page)).toBeHidden();
  await saved(page);
  await expect(attuned(page, name, instanceId)).toBeChecked();
}

async function done(page: Page) {
  await manager(page).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(manager(page)).toBeHidden();
}

test('attunement browsing and a cancelled manual recording leave every saved record unchanged', async ({
  page,
  isMobile,
}, info) => {
  const file = fixture('attunement-warning', fourItems());
  await importCharacter(page, file);
  const before = await readDatabase(page);
  await expect(summary(page)).toContainText('0/3 attuned');
  await opener(page).click();
  await expect(
    manager(page).getByRole('checkbox', { name: 'Show other items', exact: true }),
  ).not.toBeChecked();
  await expect(manager(page).getByRole('article')).toHaveCount(0);
  await showAll(page);
  await expect(manager(page).getByRole('article')).toHaveCount(4);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
  await page.screenshot({
    path: info.outputPath(`attunement-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  await manager(page).getByLabel('Search items', { exact: true }).fill('torch');
  await expect(manager(page).getByRole('article')).toHaveCount(1);
  await attuned(page, 'Torch', 'torch').click();
  await expect(warning(page)).toContainText(/attunement/i);
  expect(await readDatabase(page)).toEqual(before);
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(warning(page)).toBeHidden();
  await expect(attuned(page, 'Torch', 'torch')).not.toBeChecked();
  await expect(manager(page).getByLabel('Search items', { exact: true })).toHaveValue('torch');
  expect(await readDatabase(page)).toEqual(before);
  await done(page);
  await expect(opener(page)).toBeFocused();
  expect(await readDatabase(page)).toEqual(before);
});

test('confirming a manual attunement logs once and Undo restores exact resources after reload', async ({
  page,
}) => {
  const file = fixture('attunement-durable', fourItems());
  await importCharacter(page, file);
  const initial = await readDatabase(page);
  const before = character(initial, file.build.id);
  await opener(page).click();
  await showAll(page);
  await confirmMark(page, 'Torch', 'torch');
  const after = character(await readDatabase(page), file.build.id);
  expect(after.build).toEqual(before.build);
  expect(after.live).toEqual({
    ...before.live,
    items: { ...before.live.items, torch: { ...before.live.items.torch!, attuned: true } },
  });
  expect(after.events).toHaveLength(1);
  expect(after.events[0]).toMatchObject({ command: 'setItemAttunement', override: true });
  await done(page);
  await expect(summary(page)).toContainText('1/3 attuned');
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveCount(1);
  await page.reload();
  await saved(page);
  expect(character(await readDatabase(page), file.build.id)).toEqual(after);
  await undo(page).click();
  await saved(page);
  await expect(summary(page)).toContainText('0/3 attuned');
  const restored = character(await readDatabase(page), file.build.id);
  expect(restored.build).toEqual(before.build);
  expect(restored.live).toEqual(before.live);
  expect(restored.events.map(({ command }) => command)).toEqual(['setItemAttunement', 'undo']);
  expect(restored.events[0]?.undoneBy).toBe(restored.events[1]?.id);
  expect((await readDatabase(page)).backups).toEqual(initial.backups);
});

test('three distinct attunements prevent a fourth until an existing one is ended', async ({
  page,
}) => {
  const file = fixture('attunement-limit', fourItems());
  await importCharacter(page, file);
  const before = character(await readDatabase(page), file.build.id);
  await opener(page).click();
  await showAll(page);
  await confirmMark(page, 'Candle', 'candle');
  await confirmMark(page, 'Torch', 'torch');
  await confirmMark(page, 'Flute', 'flute');
  await expect(attuned(page, 'Pouch', 'pouch')).toBeDisabled();
  await expect(row(page, 'Pouch', 'pouch')).toContainText(/3|three|limit|slot/i);
  const full = await readDatabase(page);
  expect(
    Object.values(character(full, file.build.id).live.items).filter((entry) => entry.attuned),
  ).toHaveLength(3);
  await attuned(page, 'Torch', 'torch').uncheck();
  await saved(page);
  await expect(attuned(page, 'Pouch', 'pouch')).toBeEnabled();
  await confirmMark(page, 'Pouch', 'pouch');
  await done(page);
  await expect(summary(page)).toContainText('3/3 attuned');
  const after = character(await readDatabase(page), file.build.id);
  expect(after.live).toEqual({
    ...before.live,
    items: {
      ...before.live.items,
      candle: { ...before.live.items.candle!, attuned: true },
      flute: { ...before.live.items.flute!, attuned: true },
      pouch: { ...before.live.items.pouch!, attuned: true },
    },
  });
  expect(after.events.map(({ command }) => command)).toEqual(Array(5).fill('setItemAttunement'));
});

test('duplicate copies and empty items cannot start, while an empty legacy attunement can end', async ({
  page,
}) => {
  const file = fixture('attunement-duplicates', [
    {
      id: 'empty-candle',
      itemId: 'item.candle',
      quantity: 0,
      equipped: true,
      attuned: true,
      charges: 3,
    },
    { id: 'torch-one', itemId: 'item.torch', attuned: true, notes: 'First copy' },
    { id: 'torch-two', itemId: 'item.torch', notes: 'Second copy' },
    { id: 'empty-flute', itemId: 'item.flute', quantity: 0 },
    { id: 'pouch', itemId: 'item.pouch' },
  ]);
  await importCharacter(page, file);
  const before = character(await readDatabase(page), file.build.id);
  await expect(summary(page)).toContainText('2/3 attuned');
  await opener(page).click();
  await expect(attuned(page, 'Candle', 'empty-candle')).toBeChecked();
  await expect(attuned(page, 'Candle', 'empty-candle')).toBeEnabled();
  await showAll(page);
  await expect(attuned(page, 'Torch', 'torch-two')).toBeDisabled();
  await expect(row(page, 'Torch', 'torch-two')).toContainText(/same|copy|already|duplicate/i);
  await expect(attuned(page, 'Flute', 'empty-flute')).toBeDisabled();
  await expect(row(page, 'Flute', 'empty-flute')).toContainText(/0|quantity|no item/i);
  await attuned(page, 'Candle', 'empty-candle').uncheck();
  await saved(page);
  await expect(attuned(page, 'Candle', 'empty-candle')).toBeDisabled();
  await expect(manager(page).getByRole('button', { name: 'Done', exact: true })).toBeFocused();
  await expect(attuned(page, 'Torch', 'torch-two')).toBeDisabled();
  await attuned(page, 'Torch', 'torch-one').uncheck();
  await saved(page);
  await expect(attuned(page, 'Torch', 'torch-two')).toBeEnabled();
  await confirmMark(page, 'Torch', 'torch-two');
  await done(page);
  await expect(summary(page)).toContainText('1/3 attuned');
  const after = character(await readDatabase(page), file.build.id);
  expect(after.build).toEqual(before.build);
  expect(after.live).toEqual({
    ...before.live,
    items: {
      ...before.live.items,
      'empty-candle': { ...before.live.items['empty-candle']!, attuned: false },
      'torch-one': { ...before.live.items['torch-one']!, attuned: false },
      'torch-two': { ...before.live.items['torch-two']!, attuned: true },
    },
  });
});

test('legacy over-limit records stay until explicitly ended and exact Undo restores them', async ({
  page,
}) => {
  const file = fixture('attunement-legacy-limit', [
    ...fourItems().map((entry) => ({ ...entry, attuned: true })),
    { id: 'rope', itemId: 'item.rope-hempen-50-feet' },
  ]);
  await importCharacter(page, file);
  const initial = await readDatabase(page);
  const before = character(initial, file.build.id);
  await expect(summary(page)).toContainText('4/3 attuned');
  await opener(page).click();
  await expect(manager(page).getByRole('article')).toHaveCount(4);
  expect(await readDatabase(page)).toEqual(initial);
  await showAll(page);
  await expect(attuned(page, 'Rope, hempen (50 feet)', 'rope')).toBeDisabled();
  await attuned(page, 'Candle', 'candle').uncheck();
  await saved(page);
  await expect(attuned(page, 'Rope, hempen (50 feet)', 'rope')).toBeDisabled();
  await attuned(page, 'Torch', 'torch').uncheck();
  await saved(page);
  await expect(attuned(page, 'Rope, hempen (50 feet)', 'rope')).toBeEnabled();
  await done(page);
  await expect(summary(page)).toContainText('2/3 attuned');
  await page.reload();
  await saved(page);
  await undo(page).click();
  await saved(page);
  await expect(summary(page)).toContainText('3/3 attuned');
  await undo(page).click();
  await saved(page);
  await expect(summary(page)).toContainText('4/3 attuned');
  const restored = character(await readDatabase(page), file.build.id);
  expect(restored.build).toEqual(before.build);
  expect(restored.live).toEqual(before.live);
  expect(restored.events.map(({ command }) => command)).toEqual([
    'setItemAttunement',
    'setItemAttunement',
    'undo',
    'undo',
  ]);
  expect((await readDatabase(page)).backups).toEqual(initial.backups);
});
