import { expect, test, type Page } from '@playwright/test';
import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import {
  ExportFileSchema,
  type CharacterBuild,
  type ExportFile,
  type LiveState,
} from '../../src/engine/schema';

// M9 gate. Native Playwright, like pwa.spec.ts: the offline half needs Chromium's own
// network stack and the installed service worker.
const ID = 'gate-fighter';
const SECOND_WIND = 'feature.fighter.second-wind';

const main = (page: Page) => page.getByRole('main');
const hud = (page: Page) => page.getByRole('banner', { name: 'Character HUD', exact: true });
const ac = (page: Page, value: number) =>
  hud(page).getByRole('button', { name: `AC ${value}`, exact: true });
const card = (page: Page, name: string) => main(page).getByRole('article', { name, exact: true });
const undo = (page: Page) => page.getByRole('button', { name: 'Undo last command', exact: true });

async function saved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

async function readSaved(page: Page): Promise<{ build: CharacterBuild; live: LiveState }> {
  return page.evaluate(async (id) => {
    const value = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await value(indexedDB.open('omnidnd'));
    try {
      const transaction = db.transaction(['builds', 'live'], 'readonly');
      const [build, live] = await Promise.all([
        value(transaction.objectStore('builds').get(id)) as Promise<{ data: CharacterBuild }>,
        value(transaction.objectStore('live').get(id)) as Promise<{ data: LiveState }>,
      ]);
      return { build: build.data, live: live.data };
    } finally {
      db.close();
    }
  }, ID);
}

async function controlled(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state))
    .toBe('activated');
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

/** A level 2 human fighter with no Fool data: heavy armor, shield, longsword. */
function fighter(): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = ID;
  file.build.name = 'Gate Fighter';
  file.build.raceId = 'race.human';
  file.build.backgroundId = 'background.acolyte';
  file.build.alignment = undefined;
  file.build.classes = [{ classId: 'class.fighter', level: 2 }];
  file.build.abilityScores = {
    base: { STR: 15, DEX: 12, CON: 14, INT: 10, WIS: 13, CHA: 8 },
    bonuses: [],
  };
  file.build.hpEntries = [
    { level: 1, classId: 'class.fighter', value: 10, method: 'max' },
    { level: 2, classId: 'class.fighter', value: 6, method: 'rolled' },
  ];
  file.build.proficiencies = {
    saves: ['STR', 'CON'],
    skills: ['athletics', 'perception'],
    expertise: [],
    armor: ['light', 'medium', 'heavy', 'shield'],
    weapons: ['simple', 'martial'],
    tools: [],
    languages: ['Common'],
  };
  file.build.spells = [];
  file.build.favorites = [];
  file.build.featureIds = [];
  file.build.overrides = [];
  file.build.items = [
    { instanceId: 'mail', itemId: 'item.chain-mail' },
    { instanceId: 'shield', itemId: 'item.shield' },
    { instanceId: 'sword', itemId: 'item.longsword' },
  ];
  file.live.characterId = ID;
  file.live.hp = 20;
  file.live.tempHp = 0;
  file.live.effects = [];
  file.live.conditions = [];
  file.live.featureUsesSpent = {};
  file.live.slotsUsed = Array.from({ length: 10 }, () => 0);
  file.live.items = {
    mail: { qty: 1, equipped: true, attuned: false },
    shield: { qty: 1, equipped: true, attuned: false },
    sword: { qty: 1, equipped: true, attuned: false },
  };
  file.events = [];
  return file;
}

test('a non-Fool fighter keeps inventory and feature values in step across screens, offline and through Undo', async ({
  page,
  context,
  isMobile,
}, info) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await saved(page);
  await controlled(page);
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: `${ID}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(ExportFileSchema.parse(fighter()))),
  });
  const importing = page.getByRole('dialog', { name: 'Import character', exact: true });
  await importing.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(importing).toBeHidden();

  // Inventory: chain mail 16 + shield 2. Unequipping the shield changes HUD, Sheet and Undo restores it.
  await page.goto(`/characters/${ID}/inventory`);
  await saved(page);
  await expect(ac(page, 18)).toBeVisible();
  const initial = await readSaved(page);
  await main(page).getByRole('checkbox', { name: 'Equipped: Shield', exact: true }).uncheck();
  await saved(page);
  await expect(ac(page, 16)).toBeVisible();
  await page.goto(`/characters/${ID}/sheet`);
  await saved(page);
  await expect(main(page).getByText('Armor class', { exact: true }).first()).toBeVisible();
  await expect(ac(page, 16)).toBeVisible();
  await undo(page).click();
  await saved(page);
  await expect(ac(page, 18)).toBeVisible();
  expect((await readSaved(page)).live).toEqual(initial.live);

  // Features: fighter uses come from class level, and spending one shows on Home.
  await page.goto(`/characters/${ID}/features`);
  await saved(page);
  await expect(card(page, 'Second Wind')).toContainText('1 of 1 left · Short or long rest');
  await expect(card(page, 'Action Surge')).toContainText('1 of 1 left · Short or long rest');
  await expect(main(page)).not.toContainText(/Bardic Inspiration|Half-Elf|Charlatan/);
  await card(page, 'Second Wind')
    .getByRole('button', { name: 'Use Second Wind', exact: true })
    .click();
  await saved(page);
  await expect(card(page, 'Second Wind')).toContainText('0 of 1 left');
  const spent = await readSaved(page);
  expect(spent.live.featureUsesSpent).toEqual({ [SECOND_WIND]: 1 });
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`m9-gate-features-${isMobile ? 375 : 1440}.png`),
    fullPage: true,
    animations: 'disabled',
  });
  await page.goto(`/characters/${ID}`);
  await saved(page);
  await expect(
    main(page)
      .getByRole('region', { name: 'Resources', exact: true })
      .getByRole('img', { name: 'Second Wind: 0 of 1 left', exact: true }),
  ).toBeVisible();

  // Offline: reload from the worker, values hold, and Undo restores the exact record.
  await context.setOffline(true);
  const offline = await page.goto(`/characters/${ID}/features`);
  expect(offline?.fromServiceWorker()).toBe(true);
  await saved(page);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  await expect(card(page, 'Second Wind')).toContainText('0 of 1 left');
  await expect(ac(page, 18)).toBeVisible();
  expect(await readSaved(page)).toEqual(spent);
  await undo(page).click();
  await saved(page);
  await expect(card(page, 'Second Wind')).toContainText('1 of 1 left');
  expect(await readSaved(page)).toEqual(initial);

  const reloaded = await page.reload();
  expect(reloaded?.fromServiceWorker()).toBe(true);
  await saved(page);
  await expect(card(page, 'Second Wind')).toContainText('1 of 1 left');
  await page.goto(`/characters/${ID}/inventory`);
  await saved(page);
  await expect(
    main(page).getByRole('checkbox', { name: 'Equipped: Shield', exact: true }),
  ).toBeChecked();
  await expect(ac(page, 18)).toBeVisible();
  await noOverflow(page);
  expect(await readSaved(page)).toEqual(initial);
});
