import { readFile } from 'node:fs/promises';
import type { Locator } from '@playwright/test';
import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import { buildRegistry } from '../../src/engine/registry';
import { createCharacter } from '../../src/engine/creation';
import {
  ExportFileSchema,
  RefPackSchema,
  type CharacterBuild,
  type ExportFile,
  type LiveState,
  type LogEvent,
} from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

// Browser fixtures run as Node modules, where Vite's JSON loader is unavailable.
const registry = buildRegistry(
  await Promise.all(
    ['races', 'classes', 'backgrounds', 'items', 'features', 'subclasses', 'spells'].map(
      async (kind) =>
        RefPackSchema.parse(
          JSON.parse(
            await readFile(new URL(`../../data/srd/${kind}.json`, import.meta.url), 'utf8'),
          ),
        ),
    ),
  ),
  [],
  [],
);

interface SavedCharacter {
  build: CharacterBuild;
  live: LiveState;
  events: LogEvent[];
}

const main = (page: Page) => page.getByRole('main');
const hud = (page: Page) => page.getByRole('banner', { name: 'Character HUD', exact: true });
const buildForm = (page: Page) => main(page).getByRole('form', { name: 'Edit character build' });
const overrides = (page: Page) => main(page).getByRole('region', { name: 'Value overrides' });
const valueInput = (page: Page) => overrides(page).getByLabel('Override value', { exact: true });
const noteInput = (page: Page) => overrides(page).getByLabel('Override note', { exact: true });
const editButton = (page: Page) =>
  main(page).getByRole('button', { name: 'Edit character', exact: true });
const stat = (page: Page, label: string) =>
  main(page).getByRole('button', { name: `Show ${label} breakdown`, exact: true });
const marker = (scope: Locator, note: string) =>
  scope.getByRole('img', { name: `Overridden: ${note}`, exact: true });
const undo = (page: Page) =>
  page
    .getByRole('region', { name: 'Character log', exact: true })
    .getByRole('button', { name: 'Undo last command', exact: true });

async function saved(page: Page) {
  // Sheets hide the background toolbar from the accessibility tree.
  await expect(page.locator('[role="status"][aria-label="Local save status"]')).toContainText(
    'Saved locally',
  );
}

async function readSaved(page: Page, characterId = 'the-fool'): Promise<SavedCharacter> {
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
          .sort((first, second) => first.order - second.order)
          .map(({ data }) => data),
      };
    } finally {
      db.close();
    }
  }, characterId);
}

async function goSheet(page: Page, id = 'the-fool') {
  await page.goto(`/characters/${id}/sheet`);
  await saved(page);
  await expect(
    main(page).getByRole('heading', { name: 'Character sheet', exact: true }),
  ).toBeVisible();
}

async function openEdit(page: Page) {
  await editButton(page).evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await editButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(buildForm(page)).toBeVisible();
  await expect(
    buildForm(page).getByRole('button', { name: 'Save changes', exact: true }),
  ).toBeDisabled();
}

async function chooseOverride(page: Page, path: string) {
  if (!(await overrides(page).isVisible()))
    await main(page)
      .locator('summary')
      .filter({ hasText: /^Computed overrides$/ })
      .click();
  await overrides(page).getByLabel('Computed value', { exact: true }).selectOption(path);
}

async function applyOverride(page: Page, path: string, value: number, note: string) {
  await chooseOverride(page, path);
  await valueInput(page).fill(String(value));
  await noteInput(page).fill(note);
  await overrides(page).getByRole('button', { name: 'Apply override', exact: true }).click();
  await saved(page);
  await expect(overrides(page)).toContainText(`Saved note: ${note}`);
}

async function closeEdit(page: Page) {
  await buildForm(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(buildForm(page)).toHaveCount(0);
  await expect(editButton(page)).toBeFocused();
}

async function noOverflow(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
}

async function touchTarget(control: Locator) {
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
}

async function importFile(page: Page, file: ExportFile) {
  await page.goto('/');
  await saved(page);
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: 'sheet-edit.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(ExportFileSchema.parse(file))),
  });
  const dialog = page.getByRole('dialog', { name: 'Import character', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(dialog).toBeHidden();
  await saved(page);
}

async function openBreakdown(page: Page, label: string, isMobile: boolean) {
  const trigger = stat(page, label);
  await trigger.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  if (isMobile) {
    await trigger.tap();
    return page.getByRole('dialog', { name: label, exact: true });
  }
  await trigger.hover();
  await expect(trigger).toHaveAttribute('aria-describedby', /\S+\s+\S+/);
  const ids = (await trigger.getAttribute('aria-describedby'))!.trim().split(/\s+/);
  return page
    .getByRole('tooltip')
    .and(page.locator(ids.map((id) => `[id=${JSON.stringify(id)}]`).join(', ')));
}

function wizardFile(): ExportFile {
  const campaign = {
    ...ExportFileSchema.parse(seed).campaign,
    id: 'sheet-edit-wizard-campaign',
    name: 'The Other Campaign',
    leveling: 'xp' as const,
  };
  const character = createCharacter(
    {
      id: 'sheet-edit-wizard',
      name: 'Arin the Archivist',
      campaign,
      raceId: 'race.human',
      classId: 'class.wizard',
      backgroundId: 'background.acolyte',
      level: 3,
      abilityBases: { STR: 8, DEX: 14, CON: 12, INT: 16, WIS: 13, CHA: 10 },
      hpRolls: [4, 4],
    },
    registry,
  );
  const prepared = [
    'spell.magic-missile',
    'spell.shield',
    'spell.mage-armor',
    'spell.detect-magic',
    'spell.sleep',
    'spell.thunderwave',
  ];
  character.build.spells = [
    {
      classId: 'class.wizard',
      known: [
        'spell.light',
        'spell.mage-hand',
        'spell.fire-bolt',
        ...prepared,
        'spell.find-familiar',
      ],
      prepared,
    },
  ];
  return ExportFileSchema.parse({
    app: 'omnidnd',
    schemaVersion: 1,
    exportedAt: '2026-11-04T00:00:00.000Z',
    campaign,
    ...character,
  });
}

test('build changes remain a draft until one save, Cancel changes nothing and Undo restores the complete saved character', async ({
  page,
}) => {
  await goSheet(page);
  const before = await readSaved(page);
  const newName = 'The Fool, Keeper of Borrowed Names';
  const tool = registry.get('item', 'item.alchemists-supplies');
  expect(before.build.items.some((item) => item.itemId === tool.id)).toBe(false);
  const stageChoices = async () => {
    await buildForm(page).getByLabel('Character name', { exact: true }).fill(newName);
    await buildForm(page)
      .getByRole('group', { name: 'Skill proficiency', exact: true })
      .getByRole('checkbox', { name: 'Medicine', exact: true })
      .check();
    await buildForm(page)
      .locator('summary')
      .filter({ hasText: /^Tool and instrument proficiency \(/ })
      .click();
    await buildForm(page)
      .getByRole('group', { name: 'Tool and instrument proficiency', exact: true })
      .getByRole('checkbox', { name: tool.name, exact: true })
      .check();
    await buildForm(page)
      .getByLabel('Languages', { exact: true })
      .fill([...before.build.proficiencies.languages, 'Draconic'].join('\n'));
  };
  await openEdit(page);
  await expect(buildForm(page).getByLabel('XP', { exact: true })).toHaveCount(0);
  await stageChoices();
  expect(await readSaved(page)).toEqual(before);
  await noOverflow(page);
  await touchTarget(buildForm(page).getByRole('button', { name: 'Save changes', exact: true }));
  await touchTarget(buildForm(page).getByRole('button', { name: 'Cancel', exact: true }));
  await touchTarget(
    buildForm(page)
      .getByRole('group', { name: 'Skill proficiency', exact: true })
      .getByRole('checkbox', { name: 'Medicine', exact: true })
      .locator('..'),
  );
  await buildForm(page).getByLabel('Character name', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('sheet-edit-build-draft.png') });
  await closeEdit(page);
  expect(await readSaved(page)).toEqual(before);

  await openEdit(page);
  await expect(buildForm(page).getByLabel('Character name', { exact: true })).toHaveValue(
    before.build.name,
  );
  await stageChoices();
  await buildForm(page).getByRole('button', { name: 'Save changes', exact: true }).click();
  await saved(page);
  await expect(editButton(page)).toBeFocused();
  await expect(hud(page)).toContainText(newName);
  await expect(main(page).getByRole('region', { name: 'Identity', exact: true })).toContainText(
    newName,
  );
  await expect(
    main(page).getByRole('region', { name: 'Proficiencies', exact: true }),
  ).toContainText(tool.name);
  const after = await readSaved(page);
  expect(after.build).toEqual({
    ...before.build,
    name: newName,
    proficiencies: {
      ...before.build.proficiencies,
      skills: [...before.build.proficiencies.skills, 'medicine'],
      tools: [...before.build.proficiencies.tools, tool.id],
      languages: [...before.build.proficiencies.languages, 'Draconic'],
    },
  });
  expect(after.live).toEqual(before.live);
  expect(after.events.map((event) => event.command)).toEqual(['editBuild']);
  await page.reload();
  await saved(page);
  expect(await readSaved(page)).toEqual(after);
  await undo(page).click();
  await saved(page);
  const restored = await readSaved(page);
  expect(restored.build).toEqual(before.build);
  expect(restored.live).toEqual(before.live);
  expect(restored.events.map((event) => event.command)).toEqual(['editBuild', 'undo']);
  await noOverflow(page);
});

test('AC overrides require a note, show honest calculation and marker, survive reload and Reset supports exact Undo', async ({
  page,
  isMobile,
}) => {
  await goSheet(page);
  const before = await readSaved(page);
  const note = 'DM approved mage ward';
  await openEdit(page);
  await chooseOverride(page, '/ac');
  await valueInput(page).fill('17');
  await overrides(page).getByRole('button', { name: 'Apply override', exact: true }).click();
  await expect(noteInput(page)).toBeFocused();
  expect(
    await noteInput(page).evaluate((element: HTMLTextAreaElement) => element.validity.valueMissing),
  ).toBe(true);
  expect(await readSaved(page)).toEqual(before);
  await valueInput(page).focus();
  await page.keyboard.press('Tab');
  await expect(noteInput(page)).toBeFocused();
  await noteInput(page).fill(note);
  for (const control of [
    overrides(page).getByLabel('Computed value', { exact: true }),
    valueInput(page),
    noteInput(page),
    overrides(page).getByRole('button', { name: 'Apply override', exact: true }),
  ])
    await touchTarget(control);
  await overrides(page).getByRole('button', { name: 'Apply override', exact: true }).click();
  await saved(page);
  const overridden = await readSaved(page);
  expect(overridden.build).toEqual({
    ...before.build,
    overrides: [{ path: '/ac', value: 17, note }],
  });
  expect(overridden.live).toEqual(before.live);
  await closeEdit(page);
  await expect(stat(page, 'Armor class')).toContainText('17');
  await expect(marker(stat(page, 'Armor class'), note)).toBeVisible();
  await expect(hud(page).getByRole('button', { name: /^AC/ })).toContainText('17');
  const detail = await openBreakdown(page, 'Armor class', isMobile);
  await expect(detail).toBeVisible();
  await expect(detail).toContainText(`Override: ${note}`);
  await expect(detail).toContainText('Calculated 13; using 17.');
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('sheet-edit-ac-breakdown.png') });
  await page.keyboard.press('Escape');
  if (!isMobile) await page.mouse.move(0, 0);
  await expect(detail).toBeHidden();
  await page.reload();
  await saved(page);
  await expect(marker(stat(page, 'Armor class'), note)).toBeVisible();
  expect(await readSaved(page)).toEqual(overridden);
  await openEdit(page);
  await chooseOverride(page, '/ac');
  await overrides(page).getByRole('button', { name: 'Reset override', exact: true }).click();
  await saved(page);
  await expect(valueInput(page)).toHaveValue('13');
  await closeEdit(page);
  await expect(stat(page, 'Armor class')).toContainText('13');
  await expect(marker(stat(page, 'Armor class'), note)).toHaveCount(0);
  await undo(page).click();
  await saved(page);
  const restored = await readSaved(page);
  expect(restored.build).toEqual(overridden.build);
  expect(restored.live).toEqual(overridden.live);
  expect(restored.events.map((event) => event.command)).toEqual([
    'setValueOverride',
    'resetValueOverride',
    'undo',
  ]);
  await expect(marker(stat(page, 'Armor class'), note)).toBeVisible();
});

test('an upstream CHA modifier changes casting and class resource formulas across screens without rewriting spending', async ({
  page,
}) => {
  await goSheet(page);
  const before = await readSaved(page);
  await openEdit(page);
  await applyOverride(page, '/abilities/CHA/mod', 7, 'Campaign boon to CHA checks and casting');
  await closeEdit(page);
  await expect(stat(page, 'Bard spell save DC')).toContainText('17');
  await expect(stat(page, 'Bard spell attack')).toContainText('+9');
  await page.goto('/characters/the-fool/spells');
  await saved(page);
  await expect(main(page)).toContainText(/Save DC 17\s*· Attack \+9/);
  await noOverflow(page);
  await page.goto('/characters/the-fool');
  await saved(page);
  await expect(
    main(page)
      .getByRole('region', { name: 'Resources' })
      .getByRole('img', { name: 'Bardic Inspiration: 5 of 7 left', exact: true }),
  ).toBeVisible();
  expect((await readSaved(page)).live).toEqual(before.live);
  await undo(page).click();
  await saved(page);
  const restored = await readSaved(page);
  expect(restored.build).toEqual(before.build);
  expect(restored.live).toEqual(before.live);
  await expect(
    main(page)
      .getByRole('region', { name: 'Resources' })
      .getByRole('img', { name: 'Bardic Inspiration: 3 of 5 left', exact: true }),
  ).toBeVisible();
  await page.goto('/characters/the-fool/spells');
  await saved(page);
  await expect(main(page)).toContainText(/Save DC 15\s*· Attack \+7/);
});

test('another campaign’s Wizard uses an INT override for casting and actual prepared-spell limits in Manage', async ({
  page,
}) => {
  const file = wizardFile();
  await importFile(page, file);
  const foolBefore = await readSaved(page);
  await goSheet(page, file.build.id);
  const before = await readSaved(page, file.build.id);
  await openEdit(page);
  await expect(buildForm(page).getByLabel('XP', { exact: true })).toHaveValue('900');
  await applyOverride(page, '/abilities/INT/mod', 5, 'Scholar pact approved by this campaign');
  await closeEdit(page);
  await expect(stat(page, 'Wizard spell save DC')).toContainText('15');
  await expect(stat(page, 'Wizard spell attack')).toContainText('+7');
  await page.goto(`/characters/${file.build.id}/spells`);
  await saved(page);
  await expect(main(page)).toContainText(/Prepared 6\s*\/\s*8/);
  await main(page).getByRole('button', { name: 'Manage', exact: true }).click();
  const manager = page.getByRole('dialog', { name: 'Manage spells', exact: true });
  const counts = manager.locator('[aria-label="Spell selection counts"]');
  await expect(counts).toContainText('6 / 8 prepared');
  await manager
    .getByRole('searchbox', { name: 'Search available spells', exact: true })
    .fill('Find Familiar');
  await manager.getByRole('checkbox', { name: 'Prepare Find Familiar', exact: true }).check();
  await saved(page);
  await expect(page.getByRole('dialog', { name: 'Check this action', exact: true })).toHaveCount(0);
  await expect(counts).toContainText('7 / 8 prepared');
  const prepared = await readSaved(page, file.build.id);
  expect(prepared.build.spells[0]?.prepared).toEqual([
    ...before.build.spells[0]!.prepared!,
    'spell.find-familiar',
  ]);
  expect(prepared.live).toEqual(before.live);
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('sheet-edit-prepared-wizard.png') });
  await manager.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await saved(page);
  await expect(counts).toContainText('6 / 8 prepared');
  await manager.getByRole('button', { name: 'Done', exact: true }).click();
  await undo(page).click();
  await saved(page);
  const restored = await readSaved(page, file.build.id);
  expect(restored.build).toEqual(before.build);
  expect(restored.live).toEqual(before.live);
  expect(await readSaved(page)).toEqual(foolBefore);
  await page.reload();
  await saved(page);
  await expect(main(page)).toContainText(/Prepared 6\s*\/\s*6/);
});

test('noted Hit Dice correction permits normal rest spending, expires its marker and Undo restores the exact correction', async ({
  page,
}) => {
  await goSheet(page);
  const before = await readSaved(page);
  const note = 'Corrected one die spent before the session';
  await openEdit(page);
  await chooseOverride(page, '/hitDice/d8/remaining');
  await overrides(page).getByLabel('Remaining', { exact: true }).fill('2');
  await noteInput(page).fill(note);
  await overrides(page).getByRole('button', { name: 'Correct remaining', exact: true }).click();
  await saved(page);
  const corrected = await readSaved(page);
  expect(corrected.live).toEqual({ ...before.live, hitDiceSpent: { d8: 1 } });
  await closeEdit(page);
  await expect(stat(page, 'd8 Hit Dice remaining')).toContainText('2/3');
  await expect(marker(stat(page, 'd8 Hit Dice remaining'), note)).toBeVisible();
  if (page.viewportSize()!.width < 640) {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'More', exact: true })
      .getByRole('button', { name: 'Short Rest', exact: true })
      .click();
  } else {
    await page
      .getByRole('button', { name: 'Short Rest', exact: true })
      .filter({ visible: true })
      .click();
  }
  const rest = page.getByRole('dialog', { name: 'Short Rest', exact: true });
  await rest.getByRole('button', { name: 'Add Hit Die', exact: true }).click();
  await rest.getByLabel('d8 roll 1', { exact: true }).fill('2');
  await rest.getByRole('button', { name: 'Apply Short Rest', exact: true }).click();
  await expect(rest).toBeHidden();
  await saved(page);
  const rested = await readSaved(page);
  expect(rested.live.hitDiceSpent).toEqual({ d8: 2 });
  expect(rested.live.hp).toBe(14);
  expect(rested.live.clock.seconds).toBe(before.live.clock.seconds + 3600);
  expect(rested.build.overrides.some((entry) => entry.path === '/hitDice/d8/remaining')).toBe(
    false,
  );
  await expect(stat(page, 'd8 Hit Dice remaining')).toContainText('1/3');
  await expect(marker(stat(page, 'd8 Hit Dice remaining'), note)).toHaveCount(0);
  await undo(page).click();
  await saved(page);
  const restored = await readSaved(page);
  expect(restored.build).toEqual(corrected.build);
  expect(restored.live).toEqual(corrected.live);
  await expect(marker(stat(page, 'd8 Hit Dice remaining'), note)).toBeVisible();
  await openEdit(page);
  await chooseOverride(page, '/hitDice/d8/remaining');
  await overrides(page).getByRole('button', { name: 'Reset override', exact: true }).click();
  await saved(page);
  const reset = await readSaved(page);
  expect(reset.build).toEqual(before.build);
  expect(reset.live).toEqual(before.live);
  await closeEdit(page);
  await undo(page).click();
  await saved(page);
  const resetUndone = await readSaved(page);
  expect(resetUndone.build).toEqual(corrected.build);
  expect(resetUndone.live).toEqual(corrected.live);
  await expect(marker(stat(page, 'd8 Hit Dice remaining'), note)).toBeVisible();
  await noOverflow(page);
});

test('a typed override draft survives global Undo and requires explicit review of the changed value', async ({
  page,
}) => {
  await goSheet(page);
  await openEdit(page);
  await applyOverride(page, '/ac', 17, 'First ward ruling');
  await valueInput(page).fill('19');
  await noteInput(page).fill('A new ruling still being reviewed');
  await undo(page).click();
  await saved(page);
  await expect(overrides(page).getByRole('alert')).toContainText(
    'This value changed while you were editing',
  );
  await expect(valueInput(page)).toHaveValue('19');
  await expect(noteInput(page)).toHaveValue('A new ruling still being reviewed');
  await expect(
    overrides(page).getByRole('button', { name: 'Apply override', exact: true }),
  ).toBeDisabled();
  expect((await readSaved(page)).events.map((event) => event.command)).toEqual([
    'setValueOverride',
    'undo',
  ]);
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('sheet-edit-stale-override.png') });
  await overrides(page).getByRole('button', { name: 'Reload value', exact: true }).click();
  await expect(valueInput(page)).toHaveValue('13');
  await expect(noteInput(page)).toHaveValue('');
  await expect(overrides(page).getByLabel('Computed value', { exact: true })).toBeFocused();
  await valueInput(page).fill('19');
  await noteInput(page).fill('Reviewed after Undo');
  await overrides(page).getByRole('button', { name: 'Apply override', exact: true }).click();
  await saved(page);
  await expect(overrides(page).getByRole('alert')).toHaveCount(0);
  await closeEdit(page);
  await expect(stat(page, 'Armor class')).toContainText('19');
  await expect(marker(stat(page, 'Armor class'), 'Reviewed after Undo')).toBeVisible();
});

test('character export and import preserve a noted override and opaque legacy records, including explicit reset of only the supported value', async ({
  page,
}) => {
  const file = ExportFileSchema.parse(seed);
  file.build.id = 'sheet-override-transfer';
  file.build.name = 'Override traveller';
  file.live.characterId = file.build.id;
  const legacy = {
    path: '/legacy/future-rule',
    value: { opaque: ['keep', 42], nested: { owner: 'another content pack' } },
    note: 'Retain this unsupported rule',
  };
  file.build.overrides = [legacy];
  await importFile(page, file);
  await goSheet(page, file.build.id);
  await openEdit(page);
  await applyOverride(page, '/ac', 18, 'Portable ward ruling');
  await expect(overrides(page)).toContainText('inactive or unsupported');
  await closeEdit(page);
  const before = await readSaved(page, file.build.id);
  expect(before.build.overrides).toEqual([
    legacy,
    { path: '/ac', value: 18, note: 'Portable ward ruling' },
  ]);
  await page.goto(`/characters/${file.build.id}/settings`);
  await saved(page);
  const downloading = page.waitForEvent('download');
  await main(page).getByRole('button', { name: 'Export JSON', exact: true }).click();
  const download = await downloading;
  const exported = ExportFileSchema.parse(
    JSON.parse(await readFile((await download.path())!, 'utf8')),
  );
  expect(exported.build).toEqual(before.build);
  expect(exported.live).toEqual(before.live);
  expect(exported.events).toEqual(before.events);
  await importFile(page, exported);
  const copyName = `${exported.build.name} (imported copy)`;
  const link = page.getByRole('article', { name: copyName, exact: true }).getByRole('link');
  const href = await link.getAttribute('href');
  expect(href).toMatch(/^\/characters\//);
  const copyId = decodeURIComponent(href!.split('/')[2]!);
  await goSheet(page, copyId);
  const imported = await readSaved(page, copyId);
  expect(imported.build).toEqual({ ...exported.build, id: copyId, name: copyName });
  expect(imported.live).toEqual({ ...exported.live, characterId: copyId });
  expect(imported.events).toEqual([]);
  await expect(marker(stat(page, 'Armor class'), 'Portable ward ruling')).toBeVisible();
  await openEdit(page);
  await chooseOverride(page, '/ac');
  await overrides(page).getByRole('button', { name: 'Reset override', exact: true }).click();
  await saved(page);
  expect((await readSaved(page, copyId)).build.overrides).toEqual([legacy]);
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await closeEdit(page);
  await noOverflow(page);
});

test('large noted capacities stay usable with concentration at phone and desktop widths without unbounded pips', async ({
  page,
}) => {
  const file = ExportFileSchema.parse(seed);
  file.build.id = 'sheet-large-overrides';
  file.build.name = 'Large capacities';
  file.live.characterId = file.build.id;
  const maximum = Number.MAX_SAFE_INTEGER;
  file.build.overrides = [
    '/maxHp',
    '/ac',
    '/slots/max/1',
    '/slots/max/2',
    '/features/feature.bard.bardic-inspiration/uses/max',
  ].map((path) => ({ path, value: maximum, note: 'Large capacity ruling' }));
  file.live.concentration = { spellId: 'spell.faerie-fire', endsAt: file.live.clock.seconds + 60 };
  await importFile(page, file);
  await goSheet(page, file.build.id);
  for (const route of ['sheet', 'spells', '', 'combat']) {
    await page.goto(`/characters/${file.build.id}${route ? `/${route}` : ''}`);
    await saved(page);
    await noOverflow(page);
    const header = await hud(page).boundingBox();
    expect(header!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await expect(
      hud(page).getByRole('button', { name: 'Adjust hit points', exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await expect(
      hud(page).getByRole('button', { name: 'End concentration on Faerie Fire', exact: true }),
    ).toBeInViewport({ ratio: 1 });
  }
  await hud(page).getByRole('button', { name: 'Adjust spell slots', exact: true }).click();
  const slots = page.getByRole('dialog', { name: 'Spell slots', exact: true });
  await expect(slots).toBeVisible();
  await expect(
    slots.getByRole('img', {
      name: `Level 1 spell slots: ${maximum - file.live.slotsUsed[1]!} of ${maximum} left`,
      exact: true,
    }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('sheet-edit-large-values.png') });
  await page.keyboard.press('Escape');
  expect((await readSaved(page, file.build.id)).build.overrides).toEqual(file.build.overrides);
});
