import { readFile } from 'node:fs/promises';
import type { Locator } from '@playwright/test';
import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import { createCharacter } from '../../src/engine/creation';
import { buildRegistry } from '../../src/engine/registry';
import {
  ExportFileSchema,
  RefPackSchema,
  type Campaign,
  type CharacterBuild,
  type ExportFile,
  type LiveState,
  type LogEvent,
} from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

// Node fixture construction cannot use Vite's JSON loader.
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
const advancement = (page: Page) =>
  main(page).getByRole('region', { name: 'Advancement', exact: true });
const levelButton = (page: Page) =>
  advancement(page).getByRole('button', { name: 'Level up', exact: true });
const form = (page: Page) =>
  advancement(page).getByRole('form', { name: 'Level up character', exact: true });
const preview = (page: Page) =>
  form(page).getByRole('region', { name: 'Level-up preview', exact: true });
const apply = (page: Page) =>
  form(page).getByRole('button', { name: 'Apply level up', exact: true });
const roll = (page: Page) => form(page).getByLabel('Hit Die roll', { exact: true });
const warning = (page: Page) =>
  page.getByRole('dialog', { name: 'Check this action', exact: true });
const undo = (page: Page) =>
  page
    .getByRole('region', { name: 'Character log', exact: true })
    .getByRole('button', { name: 'Undo last command', exact: true });

async function saved(page: Page) {
  // Modal warnings intentionally hide the background toolbar from the accessibility tree.
  await expect(page.locator('[role="status"][aria-label="Local save status"]')).toContainText(
    'Saved locally',
  );
}

async function readSaved(page: Page, characterId: string): Promise<SavedCharacter> {
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

async function importFile(page: Page, file: ExportFile) {
  await page.goto('/');
  await saved(page);
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: 'level-up.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(ExportFileSchema.parse(file))),
  });
  const dialog = page.getByRole('dialog', { name: 'Import character', exact: true });
  await dialog.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(dialog).toBeHidden();
  await saved(page);
}

async function goSheet(page: Page, id: string) {
  await page.goto(`/characters/${id}/sheet`);
  await saved(page);
  await expect(advancement(page)).toBeVisible();
}

async function openLevelUp(page: Page) {
  await levelButton(page).evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await levelButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(form(page)).toBeVisible();
}

async function cancelLevelUp(page: Page) {
  await form(page).getByRole('button', { name: 'Cancel level up', exact: true }).click();
  await expect(form(page)).toHaveCount(0);
  await expect(levelButton(page)).toBeFocused();
}

async function applyLevelUp(page: Page) {
  await apply(page).click();
  await expect(form(page)).toHaveCount(0);
  await saved(page);
}

function pattern(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s*');
}

async function change(page: Page, label: string, before: string, after: string) {
  const row = preview(page).getByText(label, { exact: true }).locator('..');
  await expect(row.locator('dd')).toHaveText(
    new RegExp(`^\\s*${pattern(before)}\\s*(?:✎\\s*)?→\\s*${pattern(after)}\\s*(?:✎)?\\s*$`),
  );
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
  const bounds = await control.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
}

async function oneUndo(page: Page) {
  await expect(page.getByRole('button', { name: /^Undo\b/ })).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: /^Undo\b/, includeHidden: true }).filter({ visible: true }),
  ).toHaveCount(1);
}

function foolFile(id: string): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = id;
  file.build.name = 'The Fool, between sessions';
  file.live.characterId = id;
  file.live.concentration = {
    spellId: 'spell.invisibility',
    endsAt: file.live.clock.seconds + 600,
  };
  file.live.effects = [
    {
      id: 'level-up-ward',
      name: 'Borrowed ward',
      concentration: false,
      conditions: [],
      modifiers: [],
      endsAt: file.live.clock.seconds + 300,
    },
  ];
  file.build.choices['future-choice'] = { keep: true };
  return ExportFileSchema.parse(file);
}

function friendFile(
  id: string,
  options: {
    classId?: string;
    level?: number;
    leveling?: Campaign['leveling'];
    floor?: Campaign['hpLevelFloor'];
    con?: number;
  } = {},
): ExportFile {
  const campaign: Campaign = {
    ...ExportFileSchema.parse(seed).campaign,
    id: `${id}-campaign`,
    name: `${id} campaign`,
    sources: ['PHB'],
    hpMethod: 'average',
    abilityMethod: 'rolled',
    leveling: options.leveling ?? 'milestone',
    hpLevelFloor: options.floor ?? 'none',
  };
  const character = createCharacter(
    {
      id,
      name: options.classId === 'class.wizard' ? 'Mira the Archivist' : 'Taren Ashfield',
      campaign,
      raceId: 'race.human',
      classId: options.classId ?? 'class.fighter',
      backgroundId: 'background.acolyte',
      level: options.level ?? 3,
      abilityBases: { STR: 10, DEX: 10, CON: options.con ?? 10, INT: 10, WIS: 10, CHA: 10 },
    },
    registry,
  );
  return ExportFileSchema.parse({
    app: 'omnidnd',
    schemaVersion: 1,
    exportedAt: '2026-11-05T00:00:00.000Z',
    campaign,
    ...character,
  });
}

test('The Fool previews a rolled fifth HP result, cancels without a command and applies one exact undoable level', async ({
  page,
}) => {
  const file = foolFile('level-up-fool');
  await importFile(page, file);
  await goSheet(page, file.build.id);
  const before = await readSaved(page, file.build.id);
  await expect(advancement(page)).not.toContainText('XP');
  await expect(main(page).getByText('XP', { exact: true })).toHaveCount(0);
  await oneUndo(page);
  await touchTarget(levelButton(page));
  await openLevelUp(page);
  await expect(form(page).getByRole('radio', { name: 'Roll HP', exact: true })).toBeChecked();
  await expect(apply(page)).toBeDisabled();
  await roll(page).fill('9');
  await expect(apply(page)).toBeDisabled();
  await roll(page).fill('2.5');
  await expect(apply(page)).toBeDisabled();
  await roll(page).fill('5');
  await change(page, 'Current HP', '11', '17');
  await change(page, 'Maximum HP', '19', '25');
  await change(page, 'd8 Hit Dice', '3 / 3', '4 / 4');
  await change(page, 'Level 2 spell slots', '2 / 2', '3 / 3');
  await change(page, 'Bard cantrip limit', '2', '3');
  await change(page, 'Bard known spells limit', '6', '7');
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await noOverflow(page);
  await touchTarget(roll(page));
  await touchTarget(apply(page));
  await oneUndo(page);
  await preview(page).evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: test.info().outputPath('level-up-fool-preview.png') });
  await cancelLevelUp(page);
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await openLevelUp(page);
  await roll(page).fill('5');
  await applyLevelUp(page);
  const changed = await readSaved(page, file.build.id);
  expect(changed.build).toEqual({
    ...before.build,
    classes: before.build.classes.map((entry) => ({ ...entry, level: 4 })),
    hpEntries: [
      ...before.build.hpEntries,
      { level: 4, classId: 'class.bard', value: 5, method: 'rolled', floor: 'none' },
    ],
  });
  expect(changed.live).toEqual({ ...before.live, hp: 17 });
  expect(changed.events).toHaveLength(before.events.length + 1);
  expect(changed.events.at(-1)?.command).toBe('levelUp');
  expect(changed.events.at(-1)?.override).toBeUndefined();
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(changed);
  await page.goto(`/characters/${file.build.id}/spells`);
  await saved(page);
  await expect(main(page)).toContainText(/Cantrips 2\s*\/\s*3/);
  await expect(main(page)).toContainText(/Known 6\s*\/\s*7/);
  await undo(page).click();
  await saved(page);
  const restored = await readSaved(page, file.build.id);
  expect(restored.build).toEqual(before.build);
  expect(restored.live).toEqual(before.live);
  await oneUndo(page);
});

test('an average campaign defaults to its class average and keeps the alternate roll through warning Cancel and Escape', async ({
  page,
}) => {
  const file = friendFile('level-up-average', { classId: 'class.wizard' });
  file.live.hp = 9;
  file.live.hitDiceSpent = { d6: 1 };
  file.live.slotsUsed[1] = 2;
  await importFile(page, file);
  await goSheet(page, file.build.id);
  const before = await readSaved(page, file.build.id);
  await openLevelUp(page);
  await expect(form(page).getByRole('radio', { name: 'Take average', exact: true })).toBeChecked();
  await expect(roll(page)).toHaveCount(0);
  await change(page, 'Maximum HP', '14', '18');
  await change(page, 'Current HP', '9', '13');
  await form(page).getByRole('radio', { name: 'Roll HP', exact: true }).check();
  await roll(page).fill('3');
  await change(page, 'Maximum HP', '14', '17');
  await apply(page).click();
  await expect(warning(page)).toContainText('Campaign uses average HP');
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(warning(page)).toBeHidden();
  await expect(roll(page)).toHaveValue('3');
  await expect(form(page).getByRole('radio', { name: 'Roll HP', exact: true })).toBeChecked();
  await apply(page).click();
  await expect(warning(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(warning(page)).toBeHidden();
  await expect(roll(page)).toHaveValue('3');
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await noOverflow(page);
  await apply(page).click();
  await warning(page).getByRole('button', { name: 'Do anyway', exact: true }).click();
  await expect(form(page)).toHaveCount(0);
  await saved(page);
  const changed = await readSaved(page, file.build.id);
  expect(changed.build.hpEntries.slice(0, -1)).toEqual(before.build.hpEntries);
  expect(changed.build.hpEntries.at(-1)).toEqual({
    level: 4,
    classId: 'class.wizard',
    value: 3,
    method: 'rolled',
    floor: 'none',
  });
  expect(changed.live).toEqual({ ...before.live, hp: 12 });
  expect(changed.events).toHaveLength(before.events.length + 1);
  expect(changed.events.at(-1)?.override).toBe(true);
  await undo(page).click();
  await saved(page);
  expect((await readSaved(page, file.build.id)).build).toEqual(before.build);
  expect((await readSaved(page, file.build.id)).live).toEqual(before.live);
});

test('XP readiness distinguishes missing and below-threshold XP and advances only once at the threshold', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const missing = friendFile('level-up-xp-missing', { leveling: 'xp' });
  delete missing.build.xp;
  await importFile(page, missing);
  await goSheet(page, missing.build.id);
  await expect(levelButton(page)).toBeDisabled();
  await expect(advancement(page)).toContainText('Record XP in Edit mode');
  await expect(form(page)).toHaveCount(0);
  const below = friendFile('level-up-xp-below', { leveling: 'xp' });
  below.build.xp = 2699;
  await importFile(page, below);
  await goSheet(page, below.build.id);
  await expect(levelButton(page)).toBeDisabled();
  await expect(advancement(page)).toContainText('1 XP needed before the next level.');
  expect((await readSaved(page, below.build.id)).events).toEqual([]);
  const ready = friendFile('level-up-xp-ready', { leveling: 'xp' });
  ready.build.xp = 2700;
  await importFile(page, ready);
  await goSheet(page, ready.build.id);
  const before = await readSaved(page, ready.build.id);
  await expect(advancement(page)).toContainText('Ready to advance to recorded level 4.');
  await openLevelUp(page);
  await applyLevelUp(page);
  const changed = await readSaved(page, ready.build.id);
  expect(changed.build.classes).toEqual([{ classId: 'class.fighter', level: 4 }]);
  expect(changed.build.xp).toBe(2700);
  expect(changed.live).toEqual({ ...before.live, hp: 28 });
  await expect(levelButton(page)).toBeDisabled();
  await expect(advancement(page)).toContainText('3800 XP needed before the next level.');
  await undo(page).click();
  await saved(page);
  expect((await readSaved(page, ready.build.id)).build).toEqual(before.build);
  expect((await readSaved(page, ready.build.id)).live).toEqual(before.live);
});

test('recorded levels control the cap while a direct XP threshold and fixed HP and Hit Dice overrides remain explicit', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const capped = friendFile('level-up-recorded-cap', { level: 20, leveling: 'xp' });
  capped.build.xp = 999999;
  capped.build.overrides = [
    { path: '/level', value: 1, note: 'Effective level only' },
    { path: '/nextLevelXp', value: 1, note: 'Low threshold' },
  ];
  await importFile(page, capped);
  await goSheet(page, capped.build.id);
  await expect(advancement(page)).toContainText('Recorded character level 20');
  await expect(advancement(page)).toContainText('Maximum recorded character level');
  await expect(levelButton(page)).toBeDisabled();
  const file = foolFile('level-up-threshold-override');
  file.campaign.leveling = 'xp';
  file.build.xp = 1000;
  file.live.hitDiceSpent = { d8: 2 };
  file.build.overrides = [
    { path: '/level', value: 20, note: 'Effective level only' },
    { path: '/nextLevelXp', value: 1000, note: 'DM advancement threshold' },
    { path: '/maxHp', value: 30, note: 'Fixed ward maximum' },
    { path: '/hitDice/d8/max', value: 6, note: 'Fixed Hit Dice capacity' },
  ];
  await importFile(page, file);
  await goSheet(page, file.build.id);
  const before = await readSaved(page, file.build.id);
  await expect(advancement(page)).toContainText('Recorded character level 3');
  await expect(levelButton(page)).toBeEnabled();
  await openLevelUp(page);
  await roll(page).fill('5');
  await change(page, 'Maximum HP', '30', '30');
  await change(page, 'Current HP', '11', '11');
  await change(page, 'd8 Hit Dice', '4 / 6', '4 / 6');
  await expect(preview(page)).toContainText('Fixed ward maximum');
  await expect(preview(page)).toContainText('Fixed Hit Dice capacity');
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('level-up-fixed-overrides.png') });
  await applyLevelUp(page);
  const changed = await readSaved(page, file.build.id);
  expect(changed.build.classes[0]?.level).toBe(4);
  expect(changed.build.overrides).toEqual(before.build.overrides);
  expect(changed.build.hpEntries).toHaveLength(before.build.hpEntries.length + 1);
  expect(changed.live).toEqual(before.live);
  await undo(page).click();
  await saved(page);
  expect((await readSaved(page, file.build.id)).build).toEqual(before.build);
  expect((await readSaved(page, file.build.id)).live).toEqual(before.live);
});

test('an imported three-class character previews new slot capacity and advances only the selected Hit Die pool', async ({
  page,
}) => {
  const file = friendFile('level-up-multiclass', { classId: 'class.bard', level: 5 });
  file.build.classes = [
    { classId: 'class.bard', subclassId: 'subclass.bard.lore', level: 2 },
    { classId: 'class.wizard', level: 2 },
    { classId: 'class.fighter', level: 1 },
  ];
  file.build.hpEntries = [
    { level: 1, classId: 'class.bard', value: 8, method: 'max', floor: 'none' },
    { level: 2, classId: 'class.bard', value: 5, method: 'average', floor: 'none' },
    { level: 3, classId: 'class.wizard', value: 4, method: 'average', floor: 'none' },
    { level: 4, classId: 'class.wizard', value: 4, method: 'average', floor: 'none' },
    { level: 5, classId: 'class.fighter', value: 6, method: 'average', floor: 'none' },
  ];
  file.live.hp = 20;
  file.live.hitDiceSpent = { d8: 1, d6: 1 };
  file.live.slotsUsed[1] = 1;
  file.live.slotsUsed[2] = 1;
  await importFile(page, file);
  await goSheet(page, file.build.id);
  const before = await readSaved(page, file.build.id);
  await openLevelUp(page);
  const choice = form(page).getByLabel('Class to advance', { exact: true });
  await touchTarget(choice);
  await choice.selectOption('class.bard');
  await change(page, 'Recorded character level', '5', '6');
  await change(page, 'Bard class level', '2', '3');
  await change(page, 'Maximum HP', '27', '32');
  await change(page, 'Current HP', '20', '25');
  await change(page, 'd8 Hit Dice', '1 / 2', '2 / 3');
  await change(page, 'd6 Hit Dice', '1 / 2', '1 / 2');
  await change(page, 'd10 Hit Dice', '1 / 1', '1 / 1');
  await change(page, 'Level 3 spell slots', '0 / 0', '2 / 2');
  await change(page, 'Bard known spells limit', '5', '6');
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('level-up-multiclass-preview.png') });
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await applyLevelUp(page);
  const changed = await readSaved(page, file.build.id);
  expect(changed.build.classes).toEqual([
    { ...before.build.classes[0], level: 3 },
    before.build.classes[1],
    before.build.classes[2],
  ]);
  expect(changed.build.hpEntries.slice(0, -1)).toEqual(before.build.hpEntries);
  expect(changed.build.hpEntries.at(-1)).toEqual({
    level: 6,
    classId: 'class.bard',
    value: 5,
    method: 'average',
    floor: 'none',
  });
  expect(changed.live).toEqual({ ...before.live, hp: 25 });
  expect(changed.build.spells).toEqual(before.build.spells);
  expect(changed.build.abilityScores).toEqual(before.build.abilityScores);
  await page.reload();
  await saved(page);
  await undo(page).click();
  await saved(page);
  expect((await readSaved(page, file.build.id)).build).toEqual(before.build);
  expect((await readSaved(page, file.build.id)).live).toEqual(before.live);
});

test('damage and Undo retain the level-up class, HP mode and roll until the changed character is explicitly reviewed', async ({
  page,
}) => {
  await goSheet(page, 'the-fool');
  const before = await readSaved(page, 'the-fool');
  await openLevelUp(page);
  await roll(page).fill('5');
  await page
    .getByRole('banner', { name: 'Character HUD', exact: true })
    .getByRole('button', { name: 'Adjust hit points', exact: true })
    .click();
  const hp = page.getByRole('dialog', { name: 'Hit points', exact: true });
  await hp.getByRole('tab', { name: 'Damage', exact: true }).click();
  await hp.getByRole('button', { name: '2', exact: true }).click();
  await hp.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(hp).toBeHidden();
  await saved(page);
  await expect(roll(page)).toHaveValue('5');
  await expect(form(page).getByRole('radio', { name: 'Roll HP', exact: true })).toBeChecked();
  await expect(apply(page)).toBeDisabled();
  const review = () =>
    form(page).getByRole('button', { name: 'Review updated character', exact: true });
  await review().click();
  await change(page, 'Current HP', '9', '15');
  await expect(apply(page)).toBeEnabled();
  await undo(page).click();
  await saved(page);
  await expect(roll(page)).toHaveValue('5');
  await expect(apply(page)).toBeDisabled();
  await expect(form(page)).toContainText('Your class, HP choice and roll are kept');
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('level-up-stale-draft.png') });
  await review().click();
  await change(page, 'Current HP', '11', '17');
  await applyLevelUp(page);
  expect((await readSaved(page, 'the-fool')).live).toEqual({ ...before.live, hp: 17 });
  await undo(page).click();
  await saved(page);
  const restored = await readSaved(page, 'the-fool');
  expect(restored.build).toEqual(before.build);
  expect(restored.live).toEqual(before.live);
  await oneUndo(page);
});

test('a Bard reaching fifth level previews the scaled feature die and a new spell-slot level without restoring spending', async ({
  page,
}) => {
  const file = friendFile('level-up-bard-scaling', { classId: 'class.bard', level: 4 });
  file.live.featureUsesSpent = { 'feature.bard.bardic-inspiration': 1 };
  await importFile(page, file);
  await goSheet(page, file.build.id);
  const before = await readSaved(page, file.build.id);
  await openLevelUp(page);
  await change(page, 'Bardic Inspiration die', 'd6', 'd8');
  await change(page, 'Level 3 spell slots', '0 / 0', '2 / 2');
  await change(page, 'd8 Hit Dice', '4 / 4', '5 / 5');
  await change(page, 'Maximum HP', '23', '28');
  await applyLevelUp(page);
  const changed = await readSaved(page, file.build.id);
  expect(changed.live).toEqual({ ...before.live, hp: 28 });
  expect(changed.build.classes).toEqual([{ classId: 'class.bard', level: 5 }]);
  await page.goto(`/characters/${file.build.id}`);
  await saved(page);
  await expect(
    main(page).getByRole('button', { name: 'Bardic Inspiration (d8)', exact: true }),
  ).toBeVisible();
  await expect(
    main(page).getByRole('img', { name: 'Bardic Inspiration: 0 of 1 left', exact: true }),
  ).toBeVisible();
  await undo(page).click();
  await saved(page);
  const restored = await readSaved(page, file.build.id);
  expect(restored.build).toEqual(before.build);
  expect(restored.live).toEqual(before.live);
});

test('Manual mode applies an alternate roll without a warning and zero HP and death state survive negative CON with either floor', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/settings');
  await saved(page);
  await page.getByRole('radio', { name: /^Manual/ }).check();
  await saved(page);
  for (const floor of ['none', 'one'] as const) {
    const file = friendFile(`level-up-dead-${floor}`, { floor, con: 3 });
    file.live.hp = 0;
    file.live.deathSaves = { success: 0, fail: 3 };
    file.live.conditions = ['unconscious'];
    file.live.hitDiceSpent = { d10: 1 };
    await importFile(page, file);
    await goSheet(page, file.build.id);
    const before = await readSaved(page, file.build.id);
    await openLevelUp(page);
    await form(page).getByRole('radio', { name: 'Roll HP', exact: true }).check();
    await roll(page).fill('1');
    await change(page, 'Maximum HP', '13', floor === 'none' ? '11' : '14');
    await change(page, 'Current HP', '0', '0');
    await expect(preview(page)).toContainText('Leveling does not clear death saves or death state');
    await applyLevelUp(page);
    await expect(warning(page)).toHaveCount(0);
    const changed = await readSaved(page, file.build.id);
    expect(changed.live).toEqual(before.live);
    expect(changed.build.hpEntries.slice(0, -1)).toEqual(before.build.hpEntries);
    expect(changed.build.hpEntries.at(-1)).toEqual({
      level: 4,
      classId: 'class.fighter',
      value: 1,
      method: 'rolled',
      floor,
    });
    expect(changed.events).toHaveLength(before.events.length + 1);
    expect(changed.events.at(-1)?.override).toBeUndefined();
    await undo(page).click();
    await saved(page);
    expect((await readSaved(page, file.build.id)).build).toEqual(before.build);
    expect((await readSaved(page, file.build.id)).live).toEqual(before.live);
    await noOverflow(page);
  }
});

test('The Fool takes an ability score improvement and new spells in one undoable level', async ({
  page,
  isMobile,
}) => {
  const file = foolFile('level-up-fool-choices');
  await importFile(page, file);
  await goSheet(page, file.build.id);
  const before = await readSaved(page, file.build.id);
  await openLevelUp(page);
  await roll(page).fill('5');
  const asi = form(page).getByRole('group', { name: 'Ability score improvement' });
  await asi.getByRole('radio', { name: 'Raise ability scores' }).check();
  await asi.getByRole('radio', { name: '+2 to one ability' }).check();
  await asi.getByLabel('Ability', { exact: true }).selectOption('DEX');
  const cantrips = form(page).getByRole('group', { name: /^Cantrips \(0 \/ 1\)/ });
  // A spell name shows its card before picking: popover on desktop, sheet on phones.
  const about = cantrips.getByRole('button', { name: /^About / }).first();
  const spellName = (await about.textContent())!.trim();
  await about.click();
  const card = isMobile
    ? page.getByRole('dialog', { name: spellName, exact: true })
    : page.getByRole('tooltip');
  await expect(card).toContainText(spellName);
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath(`level-up-spell-card-${isMobile ? 375 : 1440}.png`),
  });
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(cantrips.getByRole('checkbox', { checked: true })).toHaveCount(0);
  await cantrips.getByRole('checkbox').first().check();
  const spells = form(page).getByRole('group', { name: /^Spells known/ });
  await spells.getByRole('checkbox').first().check();
  await expect(spells.getByRole('checkbox', { checked: false }).first()).toBeDisabled();
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('level-up-choices.png') });
  await applyLevelUp(page);
  const changed = await readSaved(page, file.build.id);
  expect(changed.build.abilityScores.bonuses.at(-1)).toMatchObject({ ability: 'DEX', value: 2 });
  expect(changed.build.spells[0]!.known).toHaveLength(before.build.spells[0]!.known.length + 2);
  expect(changed.events).toHaveLength(before.events.length + 1);
  await undo(page).click();
  await saved(page);
  expect((await readSaved(page, file.build.id)).build).toEqual(before.build);
});

test('The Fool takes the Resilient feat with an ability pick instead of an improvement', async ({
  page,
}) => {
  const file = foolFile('level-up-fool-feat');
  file.campaign.optionalRules = { ...file.campaign.optionalRules, feats: true };
  await importFile(page, file);
  await goSheet(page, file.build.id);
  await openLevelUp(page);
  await roll(page).fill('5');
  const asi = form(page).getByRole('group', { name: 'Ability score improvement' });
  await asi.getByRole('radio', { name: 'Take a feat' }).check();
  await asi.getByLabel('Feat', { exact: true }).selectOption({ label: 'Resilient' });
  await asi.getByLabel('Ability Resilient raises by 1').selectOption('WIS');
  await noOverflow(page);
  await applyLevelUp(page);
  const changed = await readSaved(page, file.build.id);
  expect(changed.build.featureIds).toContain('feature.feat.resilient');
  expect(changed.build.proficiencies.saves).toContain('WIS');
  expect(changed.build.abilityScores.bonuses.at(-1)).toMatchObject({ ability: 'WIS', value: 1 });
});

test('a Fighter starts Wizard through the wizard with spellbook picks', async ({ page }) => {
  const file = friendFile('level-up-new-class', { classId: 'class.fighter', level: 3 });
  file.campaign.optionalRules = { ...file.campaign.optionalRules, multiclassing: true };
  file.build.abilityScores.base.INT = 14;
  file.build.abilityScores.base.STR = 13;
  await importFile(page, file);
  await goSheet(page, file.build.id);
  const before = await readSaved(page, file.build.id);
  await openLevelUp(page);
  await form(page).getByLabel('Class to advance', { exact: true }).selectOption('class.wizard');
  await change(page, 'Wizard class level', '0', '1');
  await expect(form(page).getByRole('group', { name: /^Spells to copy/ })).toBeVisible();
  const book = form(page).getByRole('group', {
    name: /^Spells to copy/,
  });
  for (let index = 0; index < 6; index += 1) await book.getByRole('checkbox').nth(index).check();
  await noOverflow(page);
  await applyLevelUp(page);
  const changed = await readSaved(page, file.build.id);
  expect(changed.build.classes).toContainEqual({ classId: 'class.wizard', level: 1 });
  expect(changed.build.spells.find((row) => row.classId === 'class.wizard')?.known).toHaveLength(6);
  await undo(page).click();
  await saved(page);
  expect((await readSaved(page, file.build.id)).build).toEqual(before.build);
});
