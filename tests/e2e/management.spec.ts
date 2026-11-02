import { readFile } from 'node:fs/promises';
import seed from '../../data/characters/the-fool.json' with { type: 'json' };
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

interface StoredEvent extends Stored<LogEvent> {
  characterId: string;
  order: number;
}

interface DatabaseSnapshot {
  builds: Stored<CharacterBuild>[];
  live: Stored<LiveState>[];
  campaigns: Stored<Campaign>[];
  events: StoredEvent[];
}

const hud = (page: Page) => page.getByRole('banner', { name: 'Character HUD', exact: true });
const hp = (page: Page) => hud(page).getByRole('button', { name: 'Adjust hit points' });
const character = (page: Page, name: string) => page.getByRole('article', { name, exact: true });

async function expectSaved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

async function readDatabase(page: Page): Promise<DatabaseSnapshot> {
  return page.evaluate(async () => {
    const requestValue = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await requestValue(indexedDB.open('omnidnd'));
    try {
      const transaction = db.transaction(['builds', 'live', 'campaigns', 'events'], 'readonly');
      const [builds, live, campaigns, events] = await Promise.all(
        ['builds', 'live', 'campaigns', 'events'].map((name) =>
          requestValue(transaction.objectStore(name).getAll()),
        ),
      );
      return { builds, live, campaigns, events } as DatabaseSnapshot;
    } finally {
      db.close();
    }
  });
}

async function takeFiveDamage(page: Page) {
  await page.goto('/characters/the-fool');
  await expectSaved(page);
  await hp(page).click();
  const dialog = page.getByRole('dialog', { name: 'Hit points', exact: true });
  await dialog.getByRole('button', { name: '5', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(hp(page)).toHaveText(/6\s*\/\s*19/);
  await expectSaved(page);
  await expect(page.getByRole('status', { name: 'Command feedback', exact: true })).toContainText(
    'Took 5 damage',
  );
  await page.goto('/');
  await expectSaved(page);
}

async function selectImport(page: Page, contents: string) {
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: 'character.json',
    mimeType: 'application/json',
    buffer: Buffer.from(contents),
  });
}

test('hub uses saved HP and duplicate keeps choices and current values with its own history', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expectSaved(page);
  await expect(character(page, 'The Fool')).toContainText('11/19');
  await expect(page.getByRole('button', { name: 'Undo management' })).toBeDisabled();
  await takeFiveDamage(page);
  const original = await readDatabase(page);
  await expect(character(page, 'The Fool')).toContainText('6/19');

  await page.getByRole('button', { name: 'Duplicate The Fool', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Duplicate character', exact: true });
  await expect(dialog.getByLabel('Copy name', { exact: true })).toHaveValue('The Fool (copy)');
  await dialog.getByLabel('Copy name', { exact: true }).fill('The Second Fool');
  await dialog.getByRole('button', { name: 'Create copy', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  await expect(character(page, 'The Second Fool')).toContainText('6/19');
  await page.screenshot({ path: testInfo.outputPath('live-campaigns.png'), fullPage: true });
  const saved = await readDatabase(page);
  const copy = saved.builds.find(({ data }) => data.name === 'The Second Fool')!;
  expect(copy.id).not.toBe('the-fool');
  expect(copy.data).toEqual({ ...original.builds[0]!.data, id: copy.id, name: 'The Second Fool' });
  expect(saved.live.find(({ id }) => id === copy.id)?.data).toEqual({
    ...original.live[0]!.data,
    characterId: copy.id,
  });
  expect(saved.events.filter(({ characterId }) => characterId === copy.id)).toEqual([]);
  expect(saved.events.filter(({ characterId }) => characterId === 'the-fool')).toEqual(
    original.events,
  );
  await character(page, 'The Second Fool').getByRole('link').click();
  await expect(hp(page)).toHaveText(/6\s*\/\s*19/);
  await expect(page.getByRole('button', { name: 'Undo last command', exact: true })).toBeDisabled();
});

test('delete requires confirmation and management Undo restores the character and game history after reload', async ({
  page,
}) => {
  await takeFiveDamage(page);
  const before = await readDatabase(page);
  await page.getByRole('button', { name: 'Delete The Fool', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete character?', exact: true });
  await expect(dialog).toContainText('Delete The Fool from this browser?');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete The Fool', exact: true })).toBeFocused();
  await expect(character(page, 'The Fool')).toBeVisible();
  expect(await readDatabase(page)).toEqual(before);

  await page.getByRole('button', { name: 'Delete The Fool', exact: true }).click();
  await dialog.getByRole('button', { name: 'Delete character', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#hub-workspace')).toBeFocused();
  await expectSaved(page);
  await expect(character(page, 'The Fool')).toHaveCount(0);
  await page.reload();
  await expectSaved(page);
  await expect(character(page, 'The Fool')).toHaveCount(0);
  const removed = await readDatabase(page);
  expect(removed.builds).toEqual([]);
  expect(removed.live).toEqual([]);
  expect(removed.events).toEqual([]);
  expect(removed.campaigns).toEqual(before.campaigns);

  await page.getByRole('button', { name: 'Undo management', exact: true }).click();
  await expect(character(page, 'The Fool')).toContainText('6/19');
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  expect(await readDatabase(page)).toEqual(before);
  await character(page, 'The Fool').getByRole('link').click();
  await expect(hp(page)).toHaveText(/6\s*\/\s*19/);
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await expect(hp(page)).toHaveText(/11\s*\/\s*19/);
  await expectSaved(page);
});

test('export downloads a valid JSON file containing the live character, campaign and history', async ({
  page,
}) => {
  await takeFiveDamage(page);
  const before = await readDatabase(page);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export The Fool', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('The-Fool.json');
  const file = ExportFileSchema.parse(JSON.parse(await readFile((await download.path())!, 'utf8')));
  expect(file.app).toBe('omnidnd');
  expect(file.schemaVersion).toBe(1);
  expect(Number.isNaN(Date.parse(file.exportedAt))).toBe(false);
  expect(file.build).toEqual(before.builds[0]!.data);
  expect(file.campaign).toEqual(before.campaigns[0]!.data);
  expect(file.live).toEqual(before.live[0]!.data);
  expect(file.live.hp).toBe(6);
  expect(file.events).toEqual(before.events.map(({ data }) => data));
  expect(await readDatabase(page)).toEqual(before);
});

test('import previews a separate copy for collisions and preserves conflicting campaign rules', async ({
  page,
}) => {
  await takeFiveDamage(page);
  const before = await readDatabase(page);
  await selectImport(page, JSON.stringify(seed));
  const dialog = page.getByRole('dialog', { name: 'Import character', exact: true });
  await expect(dialog).toContainText('The Fool (imported copy)');
  await expect(dialog).toContainText('adds a separate copy');
  await expect(dialog).toContainText('HP 11/19');
  expect(await readDatabase(page)).toEqual(before);
  await dialog.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  await expect(character(page, 'The Fool (imported copy)')).toContainText('11/19');
  const collision = await readDatabase(page);
  expect(collision.builds).toHaveLength(2);
  expect(collision.campaigns).toEqual(before.campaigns);
  expect(collision.builds.find(({ id }) => id === 'the-fool')).toEqual(before.builds[0]);
  expect(collision.live.find(({ id }) => id === 'the-fool')).toEqual(before.live[0]);
  expect(collision.events).toEqual(before.events);
  await expect(character(page, 'The Fool')).toContainText('6/19');
  const copy = collision.builds.find(({ id }) => id !== 'the-fool')!;
  expect(copy.data.campaignId).toBe('campaign-273');
  expect(collision.live.find(({ id }) => id === copy.id)?.data.characterId).toBe(copy.id);

  const conflicting: ExportFile = ExportFileSchema.parse(seed);
  conflicting.build.id = 'travelling-fool';
  conflicting.build.name = 'Travelling Fool';
  conflicting.live.characterId = 'travelling-fool';
  conflicting.campaign.hpLevelFloor = 'one';
  await selectImport(page, JSON.stringify(conflicting));
  await expect(dialog).toContainText('Campaign rules differ');
  await expect(dialog).toContainText('Campaign #273 (imported)');
  await dialog.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  const importedCampaign = page.getByRole('article', {
    name: 'Campaign #273 (imported)',
    exact: true,
  });
  await expect(importedCampaign.getByRole('article', { name: 'Travelling Fool' })).toContainText(
    '11/19',
  );
  const saved = await readDatabase(page);
  expect(saved.campaigns).toHaveLength(2);
  expect(saved.campaigns.find(({ id }) => id === 'campaign-273')).toEqual(before.campaigns[0]);
  const campaign = saved.campaigns.find(({ id }) => id !== 'campaign-273')!;
  expect(campaign.data.hpLevelFloor).toBe('one');
  expect(saved.builds.find(({ id }) => id === 'travelling-fool')?.data.campaignId).toBe(
    campaign.id,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('malformed and unsupported JSON imports leave saved characters untouched', async ({
  page,
}) => {
  await takeFiveDamage(page);
  const before = await readDatabase(page);
  for (const contents of ['{invalid JSON', JSON.stringify({ ...seed, schemaVersion: 999 })]) {
    await selectImport(page, contents);
    await expect(page.getByRole('alert')).toContainText('Import failed:');
    await expect(page.getByRole('dialog', { name: 'Import character', exact: true })).toHaveCount(
      0,
    );
    await expect(character(page, 'The Fool')).toContainText('6/19');
    expect(await readDatabase(page)).toEqual(before);
  }
  await page.reload();
  await expectSaved(page);
  await expect(character(page, 'The Fool')).toContainText('6/19');
  expect(await readDatabase(page)).toEqual(before);
});

test('imported character and campaign IDs with URL characters keep navigation and saved settings', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  await expectSaved(page);
  const file = ExportFileSchema.parse(seed);
  file.build.id = 'fool/traveller?day#one';
  file.live.characterId = file.build.id;
  file.build.name = 'Encoded Traveller';
  file.campaign.id = 'campaign/roads?day#one';
  file.build.campaignId = file.campaign.id;
  file.campaign.name = 'Roads and Riddles';
  file.campaign.leveling = 'xp';
  file.build.xp = 900;
  file.campaign.hpLevelFloor = 'one';
  file.events = [];
  await selectImport(page, JSON.stringify(file));
  const dialog = page.getByRole('dialog', { name: 'Import character', exact: true });
  await expect(dialog).toContainText('Encoded Traveller');
  await expect(dialog).toContainText('Roads and Riddles');
  await dialog.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expectSaved(page);
  await character(page, 'Encoded Traveller').getByRole('link').click();
  await expect(hud(page)).toContainText('Encoded Traveller');
  expect(new URL(page.url()).pathname).toBe(`/characters/${encodeURIComponent(file.build.id)}`);
  for (const name of ['Spells', 'Home']) {
    await page.getByRole('link', { name, exact: true }).filter({ visible: true }).click();
    await expect(hud(page)).toContainText('Encoded Traveller');
  }
  await page.reload();
  await expectSaved(page);
  await expect(hud(page)).toContainText('Encoded Traveller');
  if (isMobile) await page.getByRole('button', { name: 'More', exact: true }).click();
  await page
    .getByRole('link', { name: 'All campaigns', exact: true })
    .filter({ visible: true })
    .click();
  await page
    .getByRole('article', { name: 'Roads and Riddles', exact: true })
    .getByRole('link', {
      name: 'Campaign settings',
      exact: true,
    })
    .click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Roads and Riddles');
  expect(new URL(page.url()).pathname).toBe(
    `/campaigns/${encodeURIComponent(file.campaign.id)}/settings`,
  );
  await expect(page.getByRole('radio', { name: /^XP/ })).toBeChecked();
  await expect(
    page.getByRole('group', { name: 'Hit points per level', exact: true }).getByRole('radio', {
      name: /^Rolled/,
    }),
  ).toBeChecked();
  await expect(page.getByRole('radio', { name: /^At least 1/ })).toBeChecked();
});

test('new blank character validates racial choices and opens a saved HUD with computed values', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expectSaved(page);
  await page
    .getByRole('article', { name: 'Campaign #273', exact: true })
    .getByRole('link', {
      name: 'New character',
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/campaigns\/campaign-273\/characters\/new$/);
  for (const label of ['Name', 'Race', 'Class', 'Background']) {
    await expect(page.getByLabel(label, { exact: true })).toHaveAttribute('required', '');
  }
  await page.getByLabel('Name', { exact: true }).fill('First Verse');
  await page.getByLabel('Race', { exact: true }).selectOption('race.half-elf');
  await page.getByLabel('Class', { exact: true }).selectOption('class.bard');
  await page.getByLabel('Background', { exact: true }).selectOption('background.charlatan');
  for (const [ability, score] of Object.entries({
    STR: 11,
    DEX: 14,
    CON: 12,
    INT: 12,
    WIS: 12,
    CHA: 18,
  })) {
    await page.getByLabel(`${ability} base`, { exact: true }).fill(String(score));
  }
  await expect(page.getByLabel('Level', { exact: true })).toHaveValue('1');
  await expect(page.getByLabel(/Level 2 roll/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Choose 2 different eligible racial bonus abilities',
  );
  expect((await readDatabase(page)).builds).toHaveLength(1);

  await page.getByLabel('DEX racial bonus', { exact: true }).check();
  await page.getByLabel('CON racial bonus', { exact: true }).check();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('row', { name: /Max HP/ }).getByRole('cell')).toHaveText('9');
  await expect(page.getByLabel('CHA bonus', { exact: true })).toHaveText('+2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('new-character.png'), fullPage: true });
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/[^/]+$/);
  await expect(hud(page)).toContainText('First Verse');
  await expect(hp(page)).toHaveText(/9\s*\/\s*9/);
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  await expect(hp(page)).toHaveText(/9\s*\/\s*9/);
  const saved = await readDatabase(page);
  const created = saved.builds.find(({ data }) => data.name === 'First Verse')!;
  expect(created.data.classes).toEqual([{ classId: 'class.bard', level: 1 }]);
  expect(created.data.hpEntries).toEqual([
    { level: 1, classId: 'class.bard', value: 8, method: 'max', floor: 'none' },
  ]);
  expect(created.data.spells).toEqual([]);
  expect(created.data.items).toEqual([]);
  expect(created.data).not.toHaveProperty('xp');
  expect(saved.events.filter(({ characterId }) => characterId === created.id)).toEqual([]);
  await page.goto('/');
  await expectSaved(page);
  await expect(character(page, 'First Verse')).toContainText('Half-Elf · Bard 1');
  await expect(character(page, 'First Verse')).toContainText('9/9');
});
