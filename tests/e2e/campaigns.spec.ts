import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import {
  ExportFileSchema,
  type Campaign,
  type CharacterBuild,
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

const campaign = (page: Page, name: string) => page.getByRole('article', { name, exact: true });
const character = (page: Page, name: string) => page.getByRole('article', { name, exact: true });
const hp = (page: Page) =>
  page
    .getByRole('banner', { name: 'Character HUD', exact: true })
    .getByRole('button', { name: 'Adjust hit points', exact: true });

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

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

async function chooseAveragePointBuy(page: Page) {
  await page.getByRole('radio', { name: /^XP/ }).check();
  await page
    .getByRole('group', { name: 'Hit points per level', exact: true })
    .getByRole('radio', { name: /^Average/ })
    .check();
  await page
    .getByRole('group', { name: 'Ability scores', exact: true })
    .getByRole('radio', { name: /^Point buy/ })
    .check();
}

async function fillCharacterBasics(page: Page, name: string) {
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Race', { exact: true }).selectOption('race.half-elf');
  await page.getByLabel('Class', { exact: true }).selectOption('class.bard');
  await page.getByLabel('Background', { exact: true }).selectOption('background.charlatan');
}

test('new campaign saves the 2014 defaults and standard-array creation validates assignments', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expectSaved(page);
  const before = await readDatabase(page);
  await page.getByRole('link', { name: 'New campaign', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'New campaign', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: /^XP/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /^Average/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /^Allow negative/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /^Standard array/ })).toBeChecked();
  await expect(page.getByText('D&D 5e (2014)', { exact: true })).toBeVisible();
  const sources = page.getByRole('group', { name: 'Sources', exact: true });
  await expect(sources.getByRole('checkbox', { checked: true })).toHaveCount(1);
  await expect(sources.getByRole('checkbox', { name: /Player's Handbook/ })).toBeDisabled();
  const rules = page.getByRole('group', { name: 'Optional rules', exact: true });
  await expect(rules.getByRole('checkbox', { checked: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create campaign', exact: true })).toBeDisabled();
  await expect(page).toHaveURL(/\/campaigns\/new$/);
  expect(await readDatabase(page)).toEqual(before);
  await page.getByLabel('Name', { exact: true }).fill('New Horizons');
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('campaign-form.png'), fullPage: true });
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  const card = campaign(page, 'New Horizons');
  await expect(card).toContainText('5e 2014 · XP · HP average · Abilities standard array · PHB');
  const saved = await readDatabase(page);
  const createdCampaign = saved.campaigns.find(({ data }) => data.name === 'New Horizons')!;
  expect(createdCampaign.data).toEqual({
    id: createdCampaign.id,
    schemaVersion: 1,
    name: 'New Horizons',
    ruleset: '5e-2014',
    leveling: 'xp',
    hpMethod: 'average',
    hpLevelFloor: 'none',
    abilityMethod: 'standard-array',
    sources: ['PHB'],
    optionalRules: {},
  });
  expect(saved.campaigns.filter(({ id }) => id !== createdCampaign.id)).toEqual(before.campaigns);
  expect(saved.builds).toEqual(before.builds);
  expect(saved.live).toEqual(before.live);
  expect(saved.events).toEqual(before.events);

  await card.getByRole('link', { name: 'New character', exact: true }).click();
  await fillCharacterBasics(page, 'Array Traveller');
  await page.getByLabel('Level', { exact: true }).fill('2');
  await page.getByLabel('STR racial bonus', { exact: true }).check();
  await page.getByLabel('DEX racial bonus', { exact: true }).check();
  for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
    await expect(page.getByLabel(`${ability} base`, { exact: true })).toHaveJSProperty(
      'tagName',
      'SELECT',
    );
    await page.getByLabel(`${ability} base`, { exact: true }).selectOption('15');
  }
  await expect(page.getByLabel(/Level 2 roll/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Assign each standard-array score once');
  expect(await readDatabase(page)).toEqual(saved);
  const bases = { STR: 15, DEX: 14, CON: 8, INT: 13, WIS: 12, CHA: 10 };
  for (const [ability, value] of Object.entries(bases)) {
    await page.getByLabel(`${ability} base`, { exact: true }).selectOption(String(value));
  }
  await expect(page.getByRole('row', { name: /Max HP/ }).getByRole('cell')).toHaveText('11');
  await expectNoOverflow(page);
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/[^/]+$/);
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  await expect(hp(page)).toHaveText(/11\s*\/\s*11/);
  const final = await readDatabase(page);
  const created = final.builds.find(({ data }) => data.name === 'Array Traveller')!;
  expect(created.data.campaignId).toBe(createdCampaign.id);
  expect(created.data.xp).toBe(300);
  expect(created.data.abilityScores.base).toEqual(bases);
  expect(created.data.hpEntries).toEqual([
    { level: 1, classId: 'class.bard', value: 8, method: 'max', floor: 'none' },
    { level: 2, classId: 'class.bard', value: 5, method: 'average', floor: 'none' },
  ]);
});

test('editing campaign methods preserves existing choices, current HP and history and supports durable Undo', async ({
  page,
}, testInfo) => {
  await page.goto('/characters/the-fool');
  await expectSaved(page);
  await hp(page).click();
  const dialog = page.getByRole('dialog', { name: 'Hit points', exact: true });
  await dialog.getByRole('button', { name: '5', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(hp(page)).toHaveText(/6\s*\/\s*19/);
  await expectSaved(page);
  await page.goto('/');
  await expectSaved(page);
  const before = await readDatabase(page);
  await campaign(page, 'Campaign #273')
    .getByRole('link', { name: 'Campaign settings', exact: true })
    .click();
  await page.getByLabel('Name', { exact: true }).fill('A New Refrain');
  await chooseAveragePointBuy(page);
  const existing = page.getByRole('region', { name: 'Existing character values', exact: true });
  await expect(existing).toContainText('The Fool');
  await expect(existing).toContainText(/HP/);
  await expect(existing).toContainText(/point.buy/i);
  await expect(existing).toContainText(/XP/);
  await expect(existing).toContainText(/not tracked|untracked/i);
  const sources = page.getByRole('group', { name: 'Sources', exact: true });
  await expect(sources.getByRole('checkbox', { checked: true })).toHaveCount(3);
  expect(await readDatabase(page)).toEqual(before);
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('campaign-settings.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  await expect(campaign(page, 'A New Refrain')).toContainText(
    '5e 2014 · XP · HP average · Abilities point buy · PHB, XGE, TCE',
  );
  await expect(character(page, 'The Fool')).toContainText('6/19');
  const saved = await readDatabase(page);
  expect(saved.campaigns).toEqual([
    {
      ...before.campaigns[0],
      data: {
        ...before.campaigns[0]!.data,
        name: 'A New Refrain',
        leveling: 'xp',
        hpMethod: 'average',
        abilityMethod: 'point-buy',
      },
    },
  ]);
  expect(saved.builds).toEqual(before.builds);
  expect(saved.live).toEqual(before.live);
  expect(saved.events).toEqual(before.events);
  await campaign(page, 'A New Refrain')
    .getByRole('link', { name: 'Campaign settings', exact: true })
    .click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('A New Refrain');
  await expect(page.getByRole('radio', { name: /^XP/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /^Average/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /^Point buy/ })).toBeChecked();
  await page.getByRole('link', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Undo management', exact: true }).click();
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

test('saved point-buy and average methods control new inputs, validate the budget and compute XP and HP', async ({
  page,
}) => {
  await page.goto('/');
  await expectSaved(page);
  await campaign(page, 'Campaign #273')
    .getByRole('link', { name: 'Campaign settings', exact: true })
    .click();
  await chooseAveragePointBuy(page);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  const before = await readDatabase(page);
  await campaign(page, 'Campaign #273')
    .getByRole('link', { name: 'New character', exact: true })
    .click();
  await fillCharacterBasics(page, 'Measured Verse');
  await page.getByLabel('Level', { exact: true }).fill('3');
  await page.getByLabel('DEX racial bonus', { exact: true }).check();
  await page.getByLabel('CON racial bonus', { exact: true }).check();
  for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
    const input = page.getByLabel(`${ability} base`, { exact: true });
    await expect(input).toHaveAttribute('type', 'number');
    await expect(input).toHaveAttribute('min', '8');
    await expect(input).toHaveAttribute('max', '15');
    await input.fill('15');
  }
  await expect(page.getByText('Points used: 54 / 27', { exact: true })).toBeVisible();
  await expect(page.getByLabel(/Level [23] roll/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Point-buy base scores cost more than 27 points',
  );
  expect(await readDatabase(page)).toEqual(before);
  const bases = { STR: 8, DEX: 15, CON: 14, INT: 8, WIS: 10, CHA: 15 };
  for (const [ability, value] of Object.entries(bases)) {
    await page.getByLabel(`${ability} base`, { exact: true }).fill(String(value));
  }
  await expect(page.getByText('Points used: 27 / 27', { exact: true })).toBeVisible();
  await expect(page.getByRole('row', { name: /Max HP/ }).getByRole('cell')).toHaveText('24');
  await expectNoOverflow(page);
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/[^/]+$/);
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  await expect(hp(page)).toHaveText(/24\s*\/\s*24/);
  const saved = await readDatabase(page);
  const created = saved.builds.find(({ data }) => data.name === 'Measured Verse')!;
  expect(created.data.abilityScores.base).toEqual(bases);
  expect(created.data.xp).toBe(900);
  expect(created.data.hpEntries).toEqual([
    { level: 1, classId: 'class.bard', value: 8, method: 'max', floor: 'none' },
    { level: 2, classId: 'class.bard', value: 5, method: 'average', floor: 'none' },
    { level: 3, classId: 'class.bard', value: 5, method: 'average', floor: 'none' },
  ]);
  expect(saved.builds.find(({ id }) => id === 'the-fool')).toEqual(before.builds[0]);
  expect(saved.live.find(({ id }) => id === 'the-fool')).toEqual(before.live[0]);
  expect(saved.events).toEqual(before.events);
});

test('changing the low-HP floor keeps legacy negative-CON rolls and HP and applies to new characters', async ({
  page,
}) => {
  await page.goto('/');
  await expectSaved(page);
  const file = ExportFileSchema.parse(seed);
  file.campaign.id = 'scarred-road';
  file.campaign.name = 'Scarred Road';
  file.campaign.optionalRules = { feats: true, multiclassing: false };
  file.build.id = 'weathered-wanderer';
  file.build.name = 'Weathered Wanderer';
  file.build.campaignId = file.campaign.id;
  file.build.abilityScores.base.CON = 3;
  file.build.hpEntries[1]!.value = 1;
  file.build.hpEntries[2]!.value = 1;
  file.live.characterId = file.build.id;
  file.live.hp = 1;
  file.events = [];
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: 'negative-con-character.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  const dialog = page.getByRole('dialog', { name: 'Import character', exact: true });
  await expect(dialog).toContainText('HP 1/1');
  await dialog.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expectSaved(page);
  const before = await readDatabase(page);
  await campaign(page, 'Scarred Road')
    .getByRole('link', { name: 'Campaign settings', exact: true })
    .click();
  await page.getByRole('radio', { name: /^At least 1/ }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  await expect(character(page, 'Weathered Wanderer')).toContainText('1/1');
  const saved = await readDatabase(page);
  const original = before.builds.find(({ id }) => id === file.build.id)!;
  expect(saved.builds.find(({ id }) => id === file.build.id)).toEqual({
    ...original,
    data: {
      ...original.data,
      hpEntries: original.data.hpEntries.map((entry) => ({ ...entry, floor: 'none' })),
    },
  });
  expect(saved.live).toEqual(before.live);
  expect(saved.events).toEqual(before.events);
  expect(saved.campaigns.find(({ id }) => id === file.campaign.id)?.data).toEqual({
    ...file.campaign,
    hpLevelFloor: 'one',
  });
  await page.getByRole('button', { name: 'Undo management', exact: true }).click();
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  expect(await readDatabase(page)).toEqual(before);
  await campaign(page, 'Scarred Road')
    .getByRole('link', { name: 'Campaign settings', exact: true })
    .click();
  await page.getByRole('radio', { name: /^At least 1/ }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expectSaved(page);
  await campaign(page, 'Scarred Road')
    .getByRole('link', { name: 'New character', exact: true })
    .click();
  await fillCharacterBasics(page, 'Fresh Wanderer');
  await page.getByLabel('Level', { exact: true }).fill('3');
  await page.getByLabel('DEX racial bonus', { exact: true }).check();
  await page.getByLabel('CON racial bonus', { exact: true }).check();
  for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
    await page.getByLabel(`${ability} base`, { exact: true }).fill('3');
  }
  await page.getByLabel(/Level 2 roll/).fill('1');
  await page.getByLabel(/Level 3 roll/).fill('1');
  await expect(page.getByRole('row', { name: /Max HP/ }).getByRole('cell')).toHaveText('7');
  await expectNoOverflow(page);
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/[^/]+$/);
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  await expect(hp(page)).toHaveText(/7\s*\/\s*7/);
  const final = await readDatabase(page);
  const created = final.builds.find(({ data }) => data.name === 'Fresh Wanderer')!;
  expect(created.data.hpEntries).toEqual([
    { level: 1, classId: 'class.bard', value: 8, method: 'max', floor: 'one' },
    { level: 2, classId: 'class.bard', value: 1, method: 'rolled', floor: 'one' },
    { level: 3, classId: 'class.bard', value: 1, method: 'rolled', floor: 'one' },
  ]);
  expect(created.data).not.toHaveProperty('xp');
  await page.goto('/');
  await expectSaved(page);
  await expect(character(page, 'Weathered Wanderer')).toContainText('1/1');
  await expect(character(page, 'Fresh Wanderer')).toContainText('7/7');
});
