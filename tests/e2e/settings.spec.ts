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
  settings: Stored<unknown>[];
}

const hp = (page: Page) =>
  page
    .getByRole('banner', { name: 'Character HUD', exact: true })
    .getByRole('button', { name: 'Adjust hit points', exact: true });
const reducedMotion = (page: Page) =>
  page.getByRole('checkbox', { name: 'Always reduce motion', exact: true });
const automation = (page: Page, name: 'Assisted' | 'Manual') =>
  page.getByRole('radio', { name: new RegExp(`^${name}`) });
const undo = (page: Page) => page.getByRole('button', { name: 'Undo management', exact: true });

async function expectSaved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
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
      const names = ['builds', 'live', 'campaigns', 'events', 'settings'];
      const transaction = db.transaction(names, 'readonly');
      const [builds, live, campaigns, events, settings] = await Promise.all(
        names.map((name) => requestValue(transaction.objectStore(name).getAll())),
      );
      return { builds, live, campaigns, events, settings } as DatabaseSnapshot;
    } finally {
      db.close();
    }
  });
}

function characterData({ builds, live, campaigns, events }: DatabaseSnapshot) {
  return { builds, live, campaigns, events };
}

function settingData(snapshot: DatabaseSnapshot, id: string) {
  return snapshot.settings.find((setting) => setting.id === id)?.data;
}

async function expectStoredPreferences(page: Page, mode: string, motion: boolean) {
  await expectSaved(page);
  const saved = await readDatabase(page);
  expect(settingData(saved, 'automation')).toBe(mode);
  expect(settingData(saved, 'reducedMotion')).toBe(motion);
}

async function openCharacterSettings(page: Page, isMobile: boolean) {
  await page.goto('/characters/the-fool');
  await expectSaved(page);
  if (isMobile) {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    const more = page.getByRole('dialog', { name: 'More', exact: true });
    await more.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(more).toHaveCount(0);
  } else {
    await page
      .getByRole('navigation', { name: 'Main', exact: true })
      .filter({ visible: true })
      .getByRole('link', { name: 'Settings', exact: true })
      .click();
  }
  await expect(page).toHaveURL('/characters/the-fool/settings');
  await expect(
    page.getByRole('heading', { name: 'Settings', level: 1, exact: true }),
  ).toBeVisible();
}

async function enterHp(page: Page, kind: 'Damage' | 'Temp HP', amount: number) {
  await hp(page).click();
  const dialog = page.getByRole('dialog', { name: 'Hit points', exact: true });
  await dialog.getByRole('tab', { name: kind, exact: true }).click();
  for (const digit of String(amount)) {
    await dialog.getByRole('button', { name: digit, exact: true }).click();
  }
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
}

async function selectImport(page: Page, contents: string) {
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await choosing;
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: 'character.json',
    mimeType: 'application/json',
    buffer: Buffer.from(contents),
  });
}

async function downloadCharacter(page: Page): Promise<ExportFile> {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const download = await downloading;
  const file = ExportFileSchema.parse(JSON.parse(await readFile((await download.path())!, 'utf8')));
  expect(download.suggestedFilename()).toBe(`${file.build.name.replaceAll(' ', '-')}.json`);
  expect(Number.isNaN(Date.parse(file.exportedAt))).toBe(false);
  expect(file).not.toHaveProperty('automation');
  expect(file).not.toHaveProperty('reducedMotion');
  expect(file).not.toHaveProperty('bookmarks');
  return file;
}

function expectExportedCharacter(file: ExportFile, snapshot: DatabaseSnapshot, id: string) {
  const build = snapshot.builds.find((record) => record.id === id)!.data;
  expect(file.build).toEqual(build);
  expect(file.live).toEqual(snapshot.live.find((record) => record.id === id)!.data);
  expect(file.campaign).toEqual(
    snapshot.campaigns.find((record) => record.id === build.campaignId)!.data,
  );
  expect(file.events).toEqual(
    snapshot.events.filter((event) => event.characterId === id).map((event) => event.data),
  );
}

async function motionTokens(page: Page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return ['hover', 'preview', 'sheet', 'pip', 'bar', 'dim'].map((name) => {
      const value = style.getPropertyValue(`--omni-motion-${name}`).trim();
      return Number.parseFloat(value) * (value.endsWith('ms') ? 1 : 1000);
    });
  });
}

test('preferences save automatically, are shared by both Settings routes and support durable Undo', async ({
  page,
  isMobile,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/characters/the-fool');
  await expectSaved(page);
  await enterHp(page, 'Damage', 5);
  await expect(hp(page)).toHaveText(/6\s*\/\s*19/);
  await expectSaved(page);
  const before = characterData(await readDatabase(page));
  await page.goto('/');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL('/settings');
  await expect(automation(page, 'Assisted')).toBeChecked();
  await expect(reducedMotion(page)).not.toBeChecked();
  await expect(undo(page)).toBeDisabled();
  await expectStoredPreferences(page, 'assisted', false);

  await automation(page, 'Manual').check();
  await expectStoredPreferences(page, 'manual', false);
  await expect(automation(page, 'Manual')).toBeFocused();
  await reducedMotion(page).check();
  await expectStoredPreferences(page, 'manual', true);
  await expect(reducedMotion(page)).toBeFocused();
  await expectNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('settings-preferences.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await openCharacterSettings(page, isMobile);
  await expect(automation(page, 'Manual')).toBeChecked();
  await expect(reducedMotion(page)).toBeChecked();
  await expect(hp(page)).toHaveText(/6\s*\/\s*19/);
  await expectNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('character-settings.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await automation(page, 'Assisted').check();
  await expectStoredPreferences(page, 'assisted', true);
  await page.reload();
  await expectSaved(page);
  await expect(automation(page, 'Assisted')).toBeChecked();
  await expect(reducedMotion(page)).toBeChecked();
  expect(characterData(await readDatabase(page))).toEqual(before);

  await undo(page).click();
  await expectStoredPreferences(page, 'manual', true);
  await page.reload();
  await expectSaved(page);
  await expect(automation(page, 'Manual')).toBeChecked();
  await expect(reducedMotion(page)).toBeChecked();
  await undo(page).click();
  await expectStoredPreferences(page, 'manual', false);
  await page.goto('/settings');
  await expectSaved(page);
  await expect(automation(page, 'Manual')).toBeChecked();
  await expect(reducedMotion(page)).not.toBeChecked();
  await undo(page).click();
  await expectStoredPreferences(page, 'assisted', false);
  await page.reload();
  await expectSaved(page);
  await expect(automation(page, 'Assisted')).toBeChecked();
  await expect(reducedMotion(page)).not.toBeChecked();
  await expect(undo(page)).toBeDisabled();
  expect(characterData(await readDatabase(page))).toEqual(before);
});

test('legacy saves default motion off while app and OS preferences independently reduce all motion tokens', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/settings');
  await expectSaved(page);
  const before = characterData(await readDatabase(page));
  // A pre-Settings workspace has no reducedMotion record. Preserve all of its other rows.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('omnidnd');
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('settings', 'readwrite');
        transaction.objectStore('settings').delete('reducedMotion');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  });
  await page.reload();
  await expectSaved(page);
  await expect(reducedMotion(page)).not.toBeChecked();
  const normal = [120, 120, 180, 150, 200, 120];
  const reduced = Array<number>(6).fill(0);
  await expect.poll(() => motionTokens(page)).toEqual(normal);
  const legacy = await readDatabase(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => motionTokens(page)).toEqual(reduced);
  await expect(reducedMotion(page)).not.toBeChecked();
  expect(await readDatabase(page)).toEqual(legacy);

  await reducedMotion(page).check();
  await expectStoredPreferences(page, 'assisted', true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(() => motionTokens(page)).toEqual(reduced);
  await page.reload();
  await expectSaved(page);
  await expect(reducedMotion(page)).toBeChecked();
  await expect.poll(() => motionTokens(page)).toEqual(reduced);
  await reducedMotion(page).uncheck();
  await expectStoredPreferences(page, 'assisted', false);
  await expect.poll(() => motionTokens(page)).toEqual(normal);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => motionTokens(page)).toEqual(reduced);
  await page.reload();
  await expectSaved(page);
  await expect(reducedMotion(page)).not.toBeChecked();
  await expect.poll(() => motionTokens(page)).toEqual(reduced);
  expect(characterData(await readDatabase(page))).toEqual(before);
});

test('Assisted warns before replacing temp HP and saved Manual mode replaces it immediately', async ({
  page,
  isMobile,
}) => {
  await page.goto('/characters/the-fool');
  await expectSaved(page);
  await enterHp(page, 'Temp HP', 10);
  await expect(hp(page)).toContainText('+10');
  await expectSaved(page);
  const before = await readDatabase(page);
  await enterHp(page, 'Temp HP', 5);
  const warning = page.getByRole('dialog', { name: 'Check this action', exact: true });
  await expect(warning).toContainText("Temp HP don't stack");
  expect(await readDatabase(page)).toEqual(before);
  await warning.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(hp(page)).toBeFocused();
  await expect(hp(page)).toContainText('+10');
  await openCharacterSettings(page, isMobile);
  await automation(page, 'Manual').check();
  await expectStoredPreferences(page, 'manual', false);
  expect(characterData(await readDatabase(page))).toEqual(characterData(before));
  await page.reload();
  await expectSaved(page);
  await expect(automation(page, 'Manual')).toBeChecked();
  await enterHp(page, 'Temp HP', 5);
  await expect(warning).toHaveCount(0);
  await expect(hp(page)).toContainText('+5');
  await expectSaved(page);
  const replaced = await readDatabase(page);
  expect(replaced.events.at(-1)?.data.command).toBe('setTempHp');
  expect(replaced.events.at(-1)?.data.override).not.toBe(true);
  await hp(page).click();
  const adjustment = page.getByRole('dialog', { name: 'Hit points', exact: true });
  await adjustment.getByRole('tab', { name: 'Damage', exact: true }).click();
  await expect(adjustment.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await adjustment.getByRole('button', { name: '0', exact: true }).click();
  await expect(adjustment.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  expect(await readDatabase(page)).toEqual(replaced);
});

test('hub exports the selected character and character Settings exports its active character', async ({
  page,
  isMobile,
}) => {
  await page.goto('/settings');
  await expectSaved(page);
  const traveller = ExportFileSchema.parse(seed);
  traveller.build.id = 'travelling-fool';
  traveller.build.name = 'Travelling Fool';
  traveller.live.characterId = traveller.build.id;
  traveller.events = [];
  await selectImport(page, JSON.stringify(traveller));
  const dialog = page.getByRole('dialog', { name: 'Import character', exact: true });
  await dialog.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  const saved = await readDatabase(page);
  await page.getByLabel('Character', { exact: true }).selectOption('travelling-fool');
  expectExportedCharacter(await downloadCharacter(page), saved, 'travelling-fool');
  expect(await readDatabase(page)).toEqual(saved);
  await openCharacterSettings(page, isMobile);
  await expect(page.getByLabel('Character', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Character JSON', exact: true })).toContainText(
    'The Fool',
  );
  expectExportedCharacter(await downloadCharacter(page), saved, 'the-fool');
  expect(await readDatabase(page)).toEqual(saved);
});

test('Settings import validates, previews collision copies, restores dismissal focus and supports durable Undo', async ({
  page,
}, testInfo) => {
  await page.goto('/characters/the-fool');
  await expectSaved(page);
  await enterHp(page, 'Damage', 5);
  await expectSaved(page);
  await page.goto('/settings');
  await expectSaved(page);
  const before = await readDatabase(page);
  for (const contents of ['{invalid JSON', JSON.stringify({ ...seed, schemaVersion: 999 })]) {
    await selectImport(page, contents);
    await expect(page.getByRole('alert')).toContainText('Import failed:');
    await expect(page.getByRole('dialog', { name: 'Import character', exact: true })).toHaveCount(
      0,
    );
    expect(await readDatabase(page)).toEqual(before);
  }
  const dialog = page.getByRole('dialog', { name: 'Import character', exact: true });
  const importButton = page.getByRole('button', { name: 'Import JSON', exact: true });
  for (const dismiss of ['Close', 'Escape']) {
    await selectImport(page, JSON.stringify(seed));
    await expect(dialog).toContainText('The Fool (imported copy)');
    await expect(dialog).toContainText('adds a separate copy');
    await expect(dialog).toContainText('HP 11/19');
    expect(await readDatabase(page)).toEqual(before);
    if (dismiss === 'Close')
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    else await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(importButton).toBeFocused();
    expect(await readDatabase(page)).toEqual(before);
  }
  await selectImport(page, JSON.stringify(seed));
  await expectNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('settings-import-preview.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(importButton).toBeFocused();
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  await expect(
    page
      .getByLabel('Character', { exact: true })
      .getByRole('option', { name: 'The Fool (imported copy)', exact: true }),
  ).toHaveCount(1);
  const added = await readDatabase(page);
  expect(added.builds).toHaveLength(2);
  expect(added.builds.find((record) => record.id === 'the-fool')).toEqual(before.builds[0]);
  expect(added.live.find((record) => record.id === 'the-fool')).toEqual(before.live[0]);
  expect(added.events).toEqual(before.events);
  expect(added.campaigns).toEqual(before.campaigns);
  for (const id of ['automation', 'reducedMotion', 'bookmarks']) {
    expect(settingData(added, id)).toEqual(settingData(before, id));
  }
  await undo(page).click();
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  await expect(page.getByLabel('Character', { exact: true }).getByRole('option')).toHaveCount(1);
  await expect(undo(page)).toBeDisabled();
  expect(characterData(await readDatabase(page))).toEqual(characterData(before));
});
