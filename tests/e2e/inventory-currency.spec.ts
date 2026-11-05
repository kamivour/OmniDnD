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

type Coin = keyof LiveState['currency'];
const main = (page: Page) => page.getByRole('main');
const wallet = (page: Page) => main(page).getByRole('region', { name: 'Currency', exact: true });
const weight = (page: Page) =>
  main(page).getByRole('region', { name: 'Carried weight', exact: true });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Adjust currency', exact: true });
const opener = (page: Page) =>
  wallet(page).getByRole('button', { name: 'Adjust currency', exact: true });
const apply = (page: Page) =>
  dialog(page).getByRole('button', { name: 'Apply currency', exact: true });
const undo = (page: Page) => page.getByRole('button', { name: 'Undo last command', exact: true });
const total = (page: Page) =>
  wallet(page).getByText('Total value', { exact: true }).locator('..').locator('dd');
const coinCount = (page: Page, unit: Coin) =>
  wallet(page).getByText(unit, { exact: true }).locator('..').locator('dd');
const weightValue = (page: Page, label: string) =>
  weight(page).getByText(label, { exact: true }).locator('..').locator('dd');

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

function emptyFile(id: string): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = id;
  file.build.name = id;
  file.build.items = [];
  file.live.characterId = id;
  file.live.items = {};
  file.live.currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  file.events = [];
  return file;
}

function addItem(
  file: ExportFile,
  instanceId: string,
  itemId: string,
  qty: number,
  container?: string,
) {
  file.build.items.push({ instanceId, itemId, ...(container ? { container } : {}) });
  file.live.items[instanceId] = { qty, equipped: false, attuned: false };
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

async function chooseCurrency(page: Page, operation: 'Add' | 'Spend', unit: Coin, amount: number) {
  await dialog(page).getByLabel('Operation', { exact: true }).selectOption({ label: operation });
  await dialog(page).getByLabel('Coin', { exact: true }).selectOption({ label: unit });
  await dialog(page).getByLabel('Amount', { exact: true }).fill(String(amount));
}

async function adjust(page: Page, operation: 'Add' | 'Spend', unit: Coin, amount: number) {
  await opener(page).click();
  await chooseCurrency(page, operation, unit, amount);
  await apply(page).click();
  await expect(dialog(page)).toBeHidden();
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

test('all five denominations stay separate while value and coin weight update exactly', async ({
  page,
}) => {
  const file = emptyFile('currency-denominations');
  await importCharacter(page, file);
  const before = character(await readDatabase(page), file.build.id);
  const expected = { cp: 10, sp: 4, ep: 2, gp: 3, pp: 1 };
  for (const unit of ['cp', 'sp', 'ep', 'gp', 'pp'] as const) {
    await adjust(page, 'Add', unit, expected[unit]);
    await expect(coinCount(page, unit)).toHaveText(String(expected[unit]));
  }
  await expect(total(page)).toHaveText('14.5 gp');
  await expect(
    wallet(page).getByText('Coins carried', { exact: true }).locator('..').locator('dd'),
  ).toHaveText('20');
  await expect(weightValue(page, 'Coin weight')).toHaveText('0.4 lb');
  await expect(weightValue(page, 'Known item weight')).toHaveText('0 lb');
  await expect(weightValue(page, 'Known carried weight')).toHaveText('0.4 lb');
  const after = character(await readDatabase(page), file.build.id);
  expect(after.build).toEqual(before.build);
  expect(after.live).toEqual({ ...before.live, currency: expected });
  expect(after.events.map(({ command }) => command)).toEqual(Array(5).fill('adjustCurrency'));
  await page.reload();
  await saved(page);
  expect(character(await readDatabase(page), file.build.id)).toEqual(after);
  await expect(total(page)).toHaveText('14.5 gp');
});

test('spending requires the selected coins and never exchanges other denominations', async ({
  page,
}) => {
  const file = emptyFile('currency-spending');
  file.live.currency.gp = 5;
  await importCharacter(page, file);
  const before = await readDatabase(page);
  await opener(page).click();
  await chooseCurrency(page, 'Spend', 'sp', 1);
  await expect(apply(page)).toBeDisabled();
  expect(await readDatabase(page)).toEqual(before);
  await chooseCurrency(page, 'Spend', 'gp', 0);
  await expect(apply(page)).toBeDisabled();
  await dialog(page).getByLabel('Amount', { exact: true }).fill('1.5');
  await expect(apply(page)).toBeDisabled();
  expect(await readDatabase(page)).toEqual(before);
  // Number() rounds this fractional decimal into a safe integer; the entered count must win.
  await chooseCurrency(page, 'Add', 'cp', 1);
  await dialog(page).getByLabel('Amount', { exact: true }).fill('9007199254740990.1');
  await expect(dialog(page).getByLabel('Amount', { exact: true })).toHaveValue(
    '9007199254740990.1',
  );
  await expect(apply(page)).toBeDisabled();
  expect(await readDatabase(page)).toEqual(before);
  await chooseCurrency(page, 'Spend', 'gp', 2);
  await expect(apply(page)).toBeEnabled();
  await apply(page).click();
  await expect(dialog(page)).toBeHidden();
  await saved(page);
  const after = character(await readDatabase(page), file.build.id);
  expect(after.live.currency).toEqual({ cp: 0, sp: 0, ep: 0, gp: 3, pp: 0 });
  await expect(total(page)).toHaveText('3 gp');
  await opener(page).click();
  await chooseCurrency(page, 'Spend', 'gp', 4);
  await expect(apply(page)).toBeDisabled();
  expect(character(await readDatabase(page), file.build.id)).toEqual(after);
});

test('currency previews cancel without saving and one applied adjustment undoes exactly after reload', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/characters/the-fool/inventory');
  await saved(page);
  const initial = await readDatabase(page);
  const before = character(initial);
  await opener(page).click();
  await chooseCurrency(page, 'Add', 'gp', 7);
  await expect(dialog(page)).toContainText('56.5 gp');
  await expect(dialog(page)).toContainText('1.22 lb');
  await expect(apply(page)).toBeEnabled();
  expect(await readDatabase(page)).toEqual(initial);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`currency-preview-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(opener(page)).toBeFocused();
  expect(await readDatabase(page)).toEqual(initial);
  await opener(page).click();
  await chooseCurrency(page, 'Spend', 'sp', 2);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(opener(page)).toBeFocused();
  expect(await readDatabase(page)).toEqual(initial);

  await adjust(page, 'Add', 'gp', 7);
  const after = character(await readDatabase(page));
  expect(after.build).toEqual(before.build);
  expect(after.live).toEqual({ ...before.live, currency: { ...before.live.currency, gp: 56 } });
  expect(after.events.map(({ command }) => command)).toEqual(['adjustCurrency']);
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveCount(1);
  await page.reload();
  await saved(page);
  expect(character(await readDatabase(page))).toEqual(after);
  await undo(page).click();
  await saved(page);
  const restored = character(await readDatabase(page));
  expect(restored.build).toEqual(before.build);
  expect(restored.live).toEqual(before.live);
  expect(restored.events.map(({ command }) => command)).toEqual(['adjustCurrency', 'undo']);
  expect(restored.events[0]?.undoneBy).toBe(restored.events[1]?.id);
  expect((await readDatabase(page)).backups).toEqual(initial.backups);
});

test('catalogue and item-edit quantities reject a fractional decimal near the safe integer limit', async ({
  page,
}) => {
  await page.goto('/characters/the-fool/inventory');
  await saved(page);
  const before = await readDatabase(page);
  await main(page).getByRole('button', { name: 'Add item', exact: true }).click();
  const adding = page.getByRole('dialog', { name: 'Add item', exact: true });
  await adding.getByRole('searchbox', { name: 'Search items', exact: true }).fill('torch');
  await adding.getByRole('button', { name: 'Select Torch', exact: true }).click();
  await adding.getByLabel('Quantity', { exact: true }).fill('9007199254740990.1');
  await expect(adding.getByLabel('Quantity', { exact: true })).toHaveValue('9007199254740990.1');
  await expect(adding.getByRole('button', { name: 'Add item', exact: true })).toBeDisabled();
  expect(await readDatabase(page)).toEqual(before);
  await adding.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(adding).toBeHidden();

  await main(page)
    .getByRole('article', { name: 'Candle', exact: true })
    .getByRole('button', { name: 'Edit: Candle', exact: true })
    .click();
  const editing = page.getByRole('dialog', { name: 'Edit item', exact: true });
  await editing.getByLabel('Quantity', { exact: true }).fill('9007199254740990.1');
  await expect(editing.getByLabel('Quantity', { exact: true })).toHaveValue('9007199254740990.1');
  await expect(editing.getByRole('button', { name: 'Save item', exact: true })).toBeDisabled();
  expect(await readDatabase(page)).toEqual(before);
  await editing.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editing).toBeHidden();
  expect(await readDatabase(page)).toEqual(before);
});

test('weight counts nested contents once, divides purchase bundles and identifies unknown weights', async ({
  page,
  isMobile,
}, info) => {
  const file = emptyFile('inventory-weight');
  addItem(file, 'bag', 'item.backpack', 1);
  addItem(file, 'pouch', 'item.pouch', 1, 'bag');
  addItem(file, 'arrows', 'item.arrow', 20, 'pouch');
  addItem(file, 'torches', 'item.torch', 2);
  addItem(file, 'empty-rations', 'item.rations-1-day', 0, 'bag');
  addItem(file, 'rings', 'item.signet-ring', 3);
  addItem(file, 'marked-cards', 'item.deck-of-marked-cards', 2, 'bag');
  file.live.currency.cp = 50;
  await importCharacter(page, file);
  const before = character(await readDatabase(page), file.build.id);
  await expect(weightValue(page, 'Known item weight')).toHaveText('9 lb');
  await expect(weightValue(page, 'Coin weight')).toHaveText('1 lb');
  await expect(weightValue(page, 'Known carried weight')).toHaveText('10 lb');
  await expect(weight(page)).toContainText('Deck of marked cards');
  await expect(weight(page)).toContainText('Incomplete weight:');
  await expect(
    weight(page).getByRole('button', { name: 'Show Carrying capacity breakdown', exact: true }),
  ).toContainText('165');
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`inventory-weight-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  const arrows = main(page).getByRole('article', { name: 'Arrow', exact: true });
  await arrows.getByRole('button', { name: 'Add one: Arrow', exact: true }).click();
  await saved(page);
  await expect(weightValue(page, 'Known item weight')).toHaveText('9.05 lb');
  await expect(weightValue(page, 'Known carried weight')).toHaveText('10.05 lb');
  const after = character(await readDatabase(page), file.build.id);
  expect(after.live).toEqual({
    ...before.live,
    items: { ...before.live.items, arrows: { ...before.live.items.arrows!, qty: 21 } },
  });
  await page.reload();
  await saved(page);
  await expect(weightValue(page, 'Known carried weight')).toHaveText('10.05 lb');
});

test('another character uses its overridden Strength capacity and overcapacity stays a manual warning', async ({
  page,
}) => {
  const file = emptyFile('inventory-elf-fighter');
  file.build.name = 'Aster with a heavy pack';
  file.build.raceId = 'race.elf';
  file.build.subraceId = 'race.high-elf';
  file.build.backgroundId = 'background.acolyte';
  file.build.classes = [
    { classId: 'class.fighter', subclassId: 'subclass.fighter.champion', level: 3 },
  ];
  file.build.abilityScores = {
    base: { STR: 6, DEX: 10, CON: 10, INT: 13, WIS: 8, CHA: 13 },
    bonuses: [
      { source: 'race.high-elf', ability: 'DEX', value: 2 },
      { source: 'race.high-elf', ability: 'INT', value: 1 },
    ],
  };
  file.build.hpEntries = [10, 6, 6].map((value, index) => ({
    level: index + 1,
    classId: 'class.fighter',
    value,
    method: index === 0 ? ('max' as const) : ('rolled' as const),
  }));
  file.build.spells = [];
  file.build.overrides = [
    { path: '/abilities/STR/score', value: 8, note: 'DM approved carrying Strength' },
  ];
  file.live.hp = 22;
  file.live.slotsUsed = Array<number>(10).fill(0);
  file.live.featureUsesSpent = {};
  file.live.combat = {
    round: 2,
    turnActive: true,
    economy: {
      actionUsed: true,
      bonusUsed: false,
      reactionUsed: false,
      movementUsed: 5,
      objectInteractionUsed: true,
      bonusActionSpellCast: false,
      otherSpellCast: false,
    },
  };
  addItem(file, 'torches', 'item.torch', 100);
  await importCharacter(page, file);
  const before = character(await readDatabase(page), file.build.id);
  const capacity = weight(page).getByRole('button', {
    name: 'Show Carrying capacity breakdown',
    exact: true,
  });
  await expect(capacity).toContainText('120');
  await expect(weightValue(page, 'Known carried weight')).toHaveText('100 lb');
  const torch = main(page).getByRole('article', { name: 'Torch', exact: true });
  await torch.getByRole('button', { name: 'Edit: Torch', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit item', exact: true });
  await editor.getByLabel('Quantity', { exact: true }).fill('200');
  await editor.getByRole('button', { name: 'Save item', exact: true }).click();
  await expect(editor).toBeHidden();
  await saved(page);
  await expect(weightValue(page, 'Known carried weight')).toHaveText('200 lb');
  await expect(capacity).toContainText('120');
  await expect(weight(page)).toContainText(/exceeds|over capacity|over carrying/i);
  const after = character(await readDatabase(page), file.build.id);
  expect(after.build).toEqual(before.build);
  expect(after.live).toEqual({
    ...before.live,
    items: { torches: { ...before.live.items.torches!, qty: 200 } },
  });
  await page.goto(`/characters/${file.build.id}/sheet`);
  await saved(page);
  await expect(
    main(page).getByRole('button', { name: 'Show Speed breakdown', exact: true }),
  ).toContainText('30');
  await expect(
    main(page).getByRole('button', { name: 'Show Carrying capacity breakdown', exact: true }),
  ).toContainText('120');
});
