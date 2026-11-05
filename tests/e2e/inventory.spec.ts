import seed from '../../data/characters/the-fool.json' with { type: 'json' };
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
const hud = (page: Page) => page.getByRole('banner', { name: 'Character HUD', exact: true });
const item = (page: Page, name: string, instanceId: string) =>
  main(page)
    .getByRole('article', { name, exact: true })
    .and(page.locator(`[data-instance-id="${instanceId}"]`));
const undo = (page: Page) => page.getByRole('button', { name: 'Undo last command', exact: true });
const warning = (page: Page) =>
  page.getByRole('dialog', { name: 'Check this action', exact: true });

async function saved(page: Page) {
  await expect(page.locator('[role="status"][aria-label="Local save status"]')).toContainText(
    'Saved locally',
  );
}

async function readCharacter(page: Page, characterId = 'the-fool'): Promise<SavedCharacter> {
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
  }, characterId);
}

async function navigate(page: Page, name: string) {
  const link = page.getByRole('link', { name, exact: true }).filter({ visible: true });
  if ((await link.count()) === 0)
    await page.getByRole('button', { name: 'More', exact: true }).click();
  await link.click();
  await saved(page);
}

function characterFile(id: string): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = id;
  file.build.name = id;
  file.live.characterId = id;
  file.events = [];
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
  const dialog = page.getByRole('dialog', { name: 'Import character', exact: true });
  await dialog.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(dialog).toBeHidden();
  await saved(page);
  await page.goto(`/characters/${file.build.id}/inventory`);
  await saved(page);
}

function addOwnedItem(file: ExportFile, instanceId: string, itemId: string, equipped = false) {
  file.build.items.push({ instanceId, itemId });
  file.live.items[instanceId] = { qty: 1, equipped, attuned: false };
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

test('Inventory shows separate owned instances and responsive live details without changing state', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/characters/the-fool/inventory');
  await saved(page);
  const before = await readCharacter(page);
  await expect(main(page).getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
  await expect(main(page).getByRole('article')).toHaveCount(16);
  const elegant = item(page, 'Disguise Kit', 'disguise-kit-1');
  const bear = item(page, 'Disguise Kit', 'disguise-kit-2');
  await expect(elegant).toContainText("Nobleman's elegant suit");
  await expect(bear).toContainText('Brown bear costume (looks very real)');
  await expect(elegant.getByLabel('Quantity: Disguise Kit', { exact: true })).toHaveText('1');
  await expect(bear.getByLabel('Quantity: Disguise Kit', { exact: true })).toHaveText('1');
  await expect(main(page)).toContainText('49');
  await expect(main(page)).toContainText('gp');
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveCount(1);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`inventory-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });

  const opener = item(page, 'Rapier', 'rapier-1').getByRole('button', {
    name: 'Details: Rapier',
    exact: true,
  });
  await opener.click();
  const detail = isMobile
    ? page.getByRole('dialog', { name: 'Rapier', exact: true })
    : page.getByRole('complementary', { name: 'Pinned detail', exact: true });
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('Rapier');
  await expect(detail).toContainText(/finesse/i);
  await page.screenshot({
    path: info.outputPath(`inventory-detail-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  expect(await readCharacter(page)).toEqual(before);
  if (!isMobile) {
    // Finish the hover/focus preview before testing Escape on the pinned panel itself.
    await page.mouse.move(0, 0);
    await detail.getByRole('button', { name: 'Close details', exact: true }).focus();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  }
  await page.keyboard.press('Escape');
  await expect(detail).toBeHidden();
  await expect(opener).toBeFocused();
});

test('nested containers and legacy bad links remain readable, and an empty character stays empty', async ({
  page,
}) => {
  const file = characterFile('inventory-containers');
  const entry = (id: string) => file.build.items.find(({ instanceId }) => instanceId === id)!;
  entry('bedroll-1').container = 'backpack-1';
  entry('pouch-1').container = 'backpack-1';
  entry('candle-1').container = 'pouch-1';
  entry('disguise-kit-1').container = 'backpack-1';
  entry('costume-1').container = 'costume-1';
  entry('fine-clothes-1').container = 'bedroll-1';
  await importCharacter(page, file);
  const before = await readCharacter(page, file.build.id);
  const backpack = main(page).getByRole('region', { name: 'Backpack', exact: true });
  const pouch = main(page).getByRole('region', { name: 'Backpack › Pouch', exact: true });
  const review = main(page).getByRole('region', { name: 'Review container links', exact: true });
  await expect(backpack).toContainText('Bedroll');
  await expect(backpack).toContainText("Nobleman's elegant suit");
  await expect(pouch).toContainText('Candle');
  await expect(review).toContainText('Clothes, costume');
  await expect(review).toContainText('Clothes, fine');
  await noOverflow(page);
  expect(await readCharacter(page, file.build.id)).toEqual(before);
  await page.reload();
  await saved(page);
  expect(await readCharacter(page, file.build.id)).toEqual(before);

  const empty = characterFile('inventory-empty');
  empty.build.items = [];
  empty.live.items = {};
  await importCharacter(page, empty);
  await expect(
    main(page).getByRole('heading', { name: 'No items recorded', exact: true }),
  ).toBeVisible();
  expect((await readCharacter(page, empty.build.id)).live.items).toEqual({});
});

test('quantity edits stay independent, stop at zero and undo exactly after reload', async ({
  page,
}) => {
  await page.goto('/characters/the-fool/inventory');
  await saved(page);
  const before = await readCharacter(page);
  const elegant = item(page, 'Disguise Kit', 'disguise-kit-1');
  const bear = item(page, 'Disguise Kit', 'disguise-kit-2');
  await elegant.getByRole('button', { name: 'Remove one: Disguise Kit', exact: true }).click();
  await saved(page);
  await expect(elegant.getByLabel('Quantity: Disguise Kit', { exact: true })).toHaveText('0');
  await expect(
    elegant.getByRole('button', { name: 'Remove one: Disguise Kit', exact: true }),
  ).toBeDisabled();
  await expect(
    elegant.getByRole('checkbox', { name: 'Equipped: Disguise Kit', exact: true }),
  ).toBeDisabled();
  await expect(bear.getByLabel('Quantity: Disguise Kit', { exact: true })).toHaveText('1');
  const after = await readCharacter(page);
  expect(after.build).toEqual(before.build);
  expect(after.live).toEqual({
    ...before.live,
    items: {
      ...before.live.items,
      'disguise-kit-1': { ...before.live.items['disguise-kit-1']!, qty: 0 },
    },
  });
  expect(after.events.at(-1)?.command).toBe('adjustItemQuantity');
  await page.reload();
  await saved(page);
  expect(await readCharacter(page)).toEqual(after);
  await undo(page).click();
  await saved(page);
  const restored = await readCharacter(page);
  expect(restored.build).toEqual(before.build);
  expect(restored.live).toEqual(before.live);
  expect(restored.events.map(({ command }) => command)).toEqual(['adjustItemQuantity', 'undo']);
  expect(restored.events[0]?.undoneBy).toBe(restored.events[1]?.id);
});

test('recorded weapon equipment updates Sheet and Combat and keeps one durable Undo', async ({
  page,
}) => {
  await page.goto('/characters/the-fool/inventory');
  await saved(page);
  const before = await readCharacter(page);
  await item(page, 'Rapier', 'rapier-1')
    .getByRole('checkbox', { name: 'Equipped: Rapier', exact: true })
    .uncheck();
  await saved(page);
  await expect(hud(page).getByRole('button', { name: 'AC 13', exact: true })).toBeVisible();
  await navigate(page, 'Sheet');
  await expect(
    main(page).getByRole('button', { name: 'Show Rapier attack breakdown', exact: true }),
  ).toHaveCount(0);
  await expect(
    main(page).getByRole('button', { name: 'Show Dagger attack breakdown', exact: true }),
  ).toBeVisible();
  await navigate(page, 'Combat');
  await expect(main(page).getByRole('button', { name: /^Rapier\b/ })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: /^Dagger\b/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveCount(1);
  await page.reload();
  await saved(page);
  await undo(page).click();
  await saved(page);
  await expect(main(page).getByRole('button', { name: /^Rapier\b/ })).toBeVisible();
  const restored = await readCharacter(page);
  expect(restored.build).toEqual(before.build);
  expect(restored.live).toEqual(before.live);
  expect(restored.events.map(({ command }) => command)).toEqual(['equipItem', 'undo']);
});

test('armor and shield choices replace only their slot while time, economy and resources stay recorded', async ({
  page,
}) => {
  const file = characterFile('inventory-fighter');
  file.build.classes = [{ classId: 'class.fighter', level: 3 }];
  file.build.hpEntries = [10, 6, 6].map((value, index) => ({
    level: index + 1,
    classId: 'class.fighter',
    value,
    method: index === 0 ? ('max' as const) : ('rolled' as const),
  }));
  file.build.spells = [];
  file.build.proficiencies.armor = ['light', 'medium', 'heavy', 'shield'];
  file.build.proficiencies.weapons = ['simple', 'martial'];
  file.live.featureUsesSpent = {};
  file.live.combat = {
    round: 3,
    turnActive: true,
    economy: {
      actionUsed: true,
      bonusUsed: false,
      reactionUsed: true,
      movementUsed: 15,
      objectInteractionUsed: true,
      bonusActionSpellCast: false,
      otherSpellCast: false,
    },
  };
  addOwnedItem(file, 'chain-1', 'item.chain-mail');
  addOwnedItem(file, 'shield-1', 'item.shield', true);
  addOwnedItem(file, 'shield-2', 'item.shield');
  await importCharacter(page, file);
  const before = await readCharacter(page, file.build.id);
  const fool = await readCharacter(page);
  await expect(hud(page).getByRole('button', { name: 'AC 15', exact: true })).toBeVisible();
  await item(page, 'Chain Mail', 'chain-1')
    .getByRole('checkbox', { name: 'Equipped: Chain Mail', exact: true })
    .check();
  await saved(page);
  await expect(hud(page).getByRole('button', { name: 'AC 18', exact: true })).toBeVisible();
  await expect(
    item(page, 'Leather Armor', 'leather-armor-1').getByRole('checkbox'),
  ).not.toBeChecked();
  await expect(item(page, 'Shield', 'shield-1').getByRole('checkbox')).toBeChecked();
  const chain = await readCharacter(page, file.build.id);
  expect(chain.build).toEqual(before.build);
  expect(chain.live).toEqual({
    ...before.live,
    items: {
      ...before.live.items,
      'leather-armor-1': { ...before.live.items['leather-armor-1']!, equipped: false },
      'chain-1': { ...before.live.items['chain-1']!, equipped: true },
    },
  });
  await expect(main(page)).toContainText(/Record any elapsed time or action separately/);
  await item(page, 'Shield', 'shield-2')
    .getByRole('checkbox', { name: 'Equipped: Shield', exact: true })
    .check();
  await saved(page);
  await expect(item(page, 'Shield', 'shield-1').getByRole('checkbox')).not.toBeChecked();
  await expect(item(page, 'Chain Mail', 'chain-1').getByRole('checkbox')).toBeChecked();
  const shield = await readCharacter(page, file.build.id);
  expect(shield.live).toEqual({
    ...chain.live,
    items: {
      ...chain.live.items,
      'shield-1': { ...chain.live.items['shield-1']!, equipped: false },
      'shield-2': { ...chain.live.items['shield-2']!, equipped: true },
    },
  });
  await navigate(page, 'Sheet');
  await expect(
    main(page).getByRole('button', { name: 'Show Armor class breakdown', exact: true }),
  ).toContainText('18');
  await page.reload();
  await saved(page);
  await undo(page).click();
  await saved(page);
  expect((await readCharacter(page, file.build.id)).live).toEqual(chain.live);
  await undo(page).click();
  await saved(page);
  expect((await readCharacter(page, file.build.id)).live).toEqual(before.live);
  expect(await readCharacter(page)).toEqual(fool);
});

test('unproficient armor warns before recording and before casting without spending on Cancel', async ({
  page,
}) => {
  const file = characterFile('inventory-wizard');
  file.build.classes = [{ classId: 'class.wizard', level: 3 }];
  file.build.hpEntries = [6, 4, 4].map((value, index) => ({
    level: index + 1,
    classId: 'class.wizard',
    value,
    method: index === 0 ? ('max' as const) : ('rolled' as const),
  }));
  file.build.spells = [
    {
      classId: 'class.wizard',
      known: ['spell.fire-bolt', 'spell.magic-missile'],
      prepared: ['spell.magic-missile'],
    },
  ];
  file.build.proficiencies.armor = [];
  file.live.featureUsesSpent = {};
  file.live.slotsUsed = Array<number>(10).fill(0);
  file.live.items['leather-armor-1']!.equipped = false;
  addOwnedItem(file, 'chain-1', 'item.chain-mail');
  await importCharacter(page, file);
  const before = await readCharacter(page, file.build.id);
  const chain = item(page, 'Chain Mail', 'chain-1').getByRole('checkbox', {
    name: 'Equipped: Chain Mail',
    exact: true,
  });
  await chain.click();
  await expect(warning(page)).toContainText(/Not proficient.*Chain Mail/);
  expect(await readCharacter(page, file.build.id)).toEqual(before);
  await expect(warning(page)).toContainText(/cannot cast spells/i);
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(chain).not.toBeChecked();
  expect(await readCharacter(page, file.build.id)).toEqual(before);
  await chain.click();
  await warning(page).getByRole('button', { name: 'Do anyway', exact: true }).click();
  await saved(page);
  await expect(chain).toBeChecked();
  const equipped = await readCharacter(page, file.build.id);
  expect(equipped.events.at(-1)).toMatchObject({ command: 'equipItem', override: true });
  await expect(main(page)).toContainText(/cannot cast spells/i);
  await navigate(page, 'Spells');
  const spell = main(page).getByRole('button', { name: /^Magic Missile\b/ });
  await spell.locator('..').getByRole('button', { name: 'Cast', exact: true }).click();
  const casting = page.getByRole('dialog', { name: 'Cast Magic Missile', exact: true });
  await casting.getByRole('button', { name: 'Cast Magic Missile (L1)', exact: true }).click();
  await expect(warning(page)).toContainText(/armor|Chain Mail/i);
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await readCharacter(page, file.build.id)).toEqual(equipped);
});
