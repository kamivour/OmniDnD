import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import { formatClock, formatDuration } from '../../src/engine/clock';
import {
  ExportFileSchema,
  type CharacterBuild,
  type ExportFile,
  type LiveState,
  type LogEvent,
} from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

interface SavedCharacter {
  build: CharacterBuild;
  live: LiveState;
  events: LogEvent[];
}

const main = (page: Page) => page.getByRole('main');
const undo = (page: Page) => page.getByRole('button', { name: 'Undo last command', exact: true });
const weight = (page: Page) =>
  main(page).getByRole('region', { name: 'Carried weight', exact: true });
const reminders = (page: Page) =>
  main(page).getByRole('region', { name: 'Roll reminders', exact: true });
const potion = (page: Page) =>
  main(page).getByRole('article', { name: 'Potion of Healing', exact: true });
const warning = (page: Page) =>
  page.getByRole('dialog', { name: 'Check this action', exact: true });

async function saved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

async function readSaved(page: Page, id: string): Promise<SavedCharacter> {
  return page.evaluate(async (id) => {
    const value = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await value(indexedDB.open('omnidnd'));
    try {
      const transaction = db.transaction(['builds', 'live', 'events'], 'readonly');
      const [build, live, events] = await Promise.all([
        value(transaction.objectStore('builds').get(id)) as Promise<{ data: CharacterBuild }>,
        value(transaction.objectStore('live').get(id)) as Promise<{ data: LiveState }>,
        value(transaction.objectStore('events').getAll()) as Promise<
          { characterId: string; order: number; data: LogEvent }[]
        >,
      ]);
      return {
        build: build.data,
        live: live.data,
        events: events
          .filter((event) => event.characterId === id)
          .sort((left, right) => left.order - right.order)
          .map(({ data }) => data),
      };
    } finally {
      db.close();
    }
  }, id);
}

function fixture(id: string): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = id;
  file.build.name = id;
  file.build.items = [];
  file.live.characterId = id;
  file.live.items = {};
  file.live.currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  file.live.hp = 5;
  file.events = [];
  return file;
}

function addItem(file: ExportFile, instanceId: string, itemId: string, qty: number) {
  file.build.items.push({ instanceId, itemId });
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
}

async function configure(
  page: Page,
  changes: {
    rests?: 'Gritty realism' | 'Epic heroism';
    encumbrance?: 'Variant' | 'Off';
    potion?: true;
  },
) {
  await page.goto('/campaigns/campaign-273/settings');
  await saved(page);
  for (const [group, value] of [
    ['Rest length', changes.rests],
    ['Encumbrance', changes.encumbrance],
  ] as const) {
    if (value)
      await page
        .getByRole('group', { name: group, exact: true })
        .getByRole('radio', { name: new RegExp(`^${value}`) })
        .check();
  }
  if (changes.potion)
    await page
      .getByRole('group', { name: 'Optional rules', exact: true })
      .getByRole('checkbox', { name: /^Potions as a bonus action/ })
      .check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL('/');
  await saved(page);
}

async function openRest(page: Page, kind: 'Short' | 'Long') {
  const name = `${kind} Rest`;
  if (page.viewportSize()!.width < 640) {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'More', exact: true })
      .getByRole('button', { name, exact: true })
      .click();
  } else {
    await page.getByRole('button', { name, exact: true }).filter({ visible: true }).click();
  }
  const dialog = page.getByRole('dialog', { name, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function durableUndo(page: Page, id: string, before: SavedCharacter, command: string) {
  await page.reload();
  await saved(page);
  const applied = await readSaved(page, id);
  expect(applied.events.at(-1)?.command).toBe(command);
  await undo(page).click();
  await saved(page);
  const restored = await readSaved(page, id);
  expect(restored.build).toEqual(before.build);
  expect(restored.live).toEqual(before.live);
  expect(restored.events).toHaveLength(before.events.length + 2);
  expect(restored.events.at(-1)?.command).toBe('undo');
  expect(restored.events.at(-2)?.undoneBy).toBe(restored.events.at(-1)?.id);
  return restored;
}

async function noOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(0);
}

for (const variant of [
  { name: 'Gritty realism' as const, short: 8 * 3600, long: 7 * 86400 },
  { name: 'Epic heroism' as const, short: 5 * 60, long: 3600 },
]) {
  test(`${variant.name} settings change both rest previews, saved clocks and exact Undo`, async ({
    page,
    isMobile,
  }, info) => {
    const id = variant.name === 'Gritty realism' ? 'gritty-rests' : 'epic-rests';
    await importCharacter(page, fixture(id));
    await configure(page, { rests: variant.name });
    await page.goto(`/characters/${id}`);
    await saved(page);
    for (const kind of ['Short', 'Long'] as const) {
      const before = await readSaved(page, id);
      const duration = kind === 'Short' ? variant.short : variant.long;
      const dialog = await openRest(page, kind);
      const preview = dialog.getByRole('region', { name: 'Rest preview', exact: true });
      await expect(preview).toContainText(`Rest preview · +${formatDuration(duration)}`);
      await expect(
        preview.getByText('Game clock', { exact: true }).locator('..').locator('dd'),
      ).toHaveText(
        `${formatClock(before.live.clock.seconds)} → ${formatClock(before.live.clock.seconds + duration)}`,
      );
      expect(await readSaved(page, id)).toEqual(before);
      await noOverflow(page);
      if (kind === 'Long')
        await page.screenshot({
          path: info.outputPath(`${id}-${isMobile ? 375 : 1440}.png`),
          animations: 'disabled',
        });
      await dialog.getByRole('button', { name: `Apply ${kind} Rest`, exact: true }).click();
      await expect(dialog).toBeHidden();
      await saved(page);
      expect((await readSaved(page, id)).live.clock.seconds).toBe(
        before.live.clock.seconds + duration,
      );
      await durableUndo(page, id, before, `complete${kind}Rest`);
    }
  });
}

async function editTorches(page: Page, quantity: number) {
  await main(page)
    .getByRole('article', { name: 'Torch', exact: true })
    .getByRole('button', { name: 'Edit: Torch', exact: true })
    .click();
  const editor = page.getByRole('dialog', { name: 'Edit item', exact: true });
  await editor.getByLabel('Quantity', { exact: true }).fill(String(quantity));
  await editor.getByRole('button', { name: 'Save item', exact: true }).click();
  await expect(editor).toBeHidden();
  await saved(page);
}

async function sheetSpeed(page: Page, id: string, speed: number) {
  await page.goto(`/characters/${id}/sheet`);
  await saved(page);
  await expect(
    main(page).getByRole('button', { name: 'Show Speed breakdown', exact: true }),
  ).toContainText(String(speed));
}

test('variant load thresholds include coins, retain unknown weights and share speed and scoped reminders', async ({
  page,
  isMobile,
}, info) => {
  const file = fixture('variant-load');
  addItem(file, 'torches', 'item.torch', 54);
  addItem(file, 'unknown', 'item.deck-of-marked-cards', 1);
  file.live.currency.cp = 50;
  await importCharacter(page, file);
  await configure(page, { encumbrance: 'Variant' });
  await page.goto('/characters/variant-load/inventory');
  await saved(page);
  await expect(weight(page)).toContainText('Incomplete weight:');
  await expect(
    weight(page).getByText('Known carried weight', { exact: true }).locator('..').locator('dd'),
  ).toHaveText('55 lb');
  await sheetSpeed(page, file.build.id, 30);
  await page.goto('/characters/variant-load/inventory');
  await editTorches(page, 55);
  await expect(weight(page)).toContainText('Encumbered');
  await sheetSpeed(page, file.build.id, 20);
  await page.goto('/characters/variant-load/inventory');
  await saved(page);
  const beforeHeavy = await readSaved(page, file.build.id);
  await editTorches(page, 110);
  await expect(weight(page)).toContainText('Heavily encumbered');
  await expect(weight(page)).toContainText('Missing weights may increase the penalty.');
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`variant-load-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  await sheetSpeed(page, file.build.id, 10);
  await page.goto('/characters/variant-load');
  await saved(page);
  await expect(reminders(page)).toContainText('STR, DEX and CON');
  await expect(reminders(page)).toContainText(/heavily encumbered/i);
  await expect(
    main(page)
      .getByRole('region', { name: 'Abilities', exact: true })
      .getByText('Disadvantage', { exact: true }),
  ).toHaveCount(3);
  await durableUndo(page, file.build.id, beforeHeavy, 'editInventoryItem');
  await expect(reminders(page)).toHaveCount(0);
  await sheetSpeed(page, file.build.id, 20);
});

test('encumbrance Off keeps weight facts without load warnings or movement penalties', async ({
  page,
}) => {
  const file = fixture('weight-off');
  addItem(file, 'torches', 'item.torch', 200);
  addItem(file, 'unknown', 'item.deck-of-marked-cards', 1);
  await importCharacter(page, file);
  const before = await readSaved(page, file.build.id);
  await configure(page, { encumbrance: 'Off' });
  await page.goto('/characters/weight-off/inventory');
  await saved(page);
  await expect(weight(page)).toContainText('200 lb');
  await expect(weight(page)).toContainText('Incomplete weight:');
  await expect(weight(page)).not.toContainText('Known weight exceeds carrying capacity');
  await expect(weight(page)).not.toContainText('Heavily encumbered');
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await sheetSpeed(page, file.build.id, 30);
});

test('the potion house rule spends bonus only for self drinking and keeps administration and other items distinct', async ({
  page,
  isMobile,
}, info) => {
  const file = fixture('potion-rule');
  addItem(file, 'potion', 'item.potion-of-healing-common', 3);
  addItem(file, 'acid', 'item.acid-vial', 2);
  await importCharacter(page, file);
  await configure(page, { potion: true });
  await page.goto('/characters/potion-rule/combat');
  await saved(page);
  await main(page).getByRole('button', { name: 'Start combat', exact: true }).click();
  await main(page).getByRole('button', { name: 'Start Turn', exact: true }).click();
  await saved(page);
  await main(page).getByRole('tab', { name: 'Items', exact: true }).click();
  const before = await readSaved(page, file.build.id);
  await expect(potion(page)).toContainText('Bonus action to drink · action to give');
  await potion(page).getByLabel('2d4 roll', { exact: true }).fill('4');
  await potion(page).getByRole('button', { name: 'Drink: Potion of Healing', exact: true }).click();
  await saved(page);
  const drank = await readSaved(page, file.build.id);
  expect(drank.live.combat!.economy).toEqual({ ...before.live.combat!.economy, bonusUsed: true });
  expect(drank.live.hp).toBe(11);
  expect(drank.live.items.potion!.qty).toBe(2);
  await potion(page).getByLabel('2d4 roll', { exact: true }).fill('4');
  await potion(page).getByRole('button', { name: 'Drink: Potion of Healing', exact: true }).click();
  await expect(warning(page)).toContainText('Bonus action already used');
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await readSaved(page, file.build.id)).toEqual(drank);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`potion-rule-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  await durableUndo(page, file.build.id, before, 'consumeItem');
  await main(page).getByRole('tab', { name: 'Items', exact: true }).click();
  await potion(page)
    .getByRole('button', { name: 'Give to another: Potion of Healing', exact: true })
    .click();
  await saved(page);
  const given = await readSaved(page, file.build.id);
  expect(given.live.combat!.economy).toEqual({ ...before.live.combat!.economy, actionUsed: true });
  expect(given.live.hp).toBe(before.live.hp);
  await undo(page).click();
  await saved(page);
  const acid = main(page).getByRole('article', { name: 'Acid (vial)', exact: true });
  await acid.getByRole('button', { name: 'Throw: Acid (vial)', exact: true }).click();
  await saved(page);
  expect((await readSaved(page, file.build.id)).live.combat!.economy).toEqual({
    ...before.live.combat!.economy,
    actionUsed: true,
  });
  await undo(page).click();
  await saved(page);
  const beforeAlly = await readSaved(page, file.build.id);
  await potion(page).getByRole('checkbox', { name: 'An ally gives it to me', exact: true }).check();
  await potion(page).getByLabel('2d4 roll', { exact: true }).fill('2');
  await potion(page).getByRole('button', { name: 'Drink: Potion of Healing', exact: true }).click();
  await saved(page);
  expect((await readSaved(page, file.build.id)).live.combat!.economy).toEqual(
    beforeAlly.live.combat!.economy,
  );
  await durableUndo(page, file.build.id, beforeAlly, 'consumeItem');
});
