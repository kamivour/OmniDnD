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

const clock = (page: Page) => page.getByRole('region', { name: 'Game clock', exact: true });
const opener = (page: Page) =>
  clock(page).getByRole('button', { name: 'Advance time', exact: true });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Advance game time', exact: true });
const custom = (page: Page) =>
  dialog(page).getByRole('button', { name: 'Advance time', exact: true });
const warning = (page: Page) =>
  page.getByRole('dialog', { name: 'Check this action', exact: true });
const timePreview = (page: Page) =>
  dialog(page).getByRole('region', { name: 'Time preview', exact: true });

async function saved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
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
          .sort((left, right) => left.order - right.order)
          .map(({ data }) => data),
      };
    } finally {
      db.close();
    }
  }, characterId);
}

function clockFile(id: string): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = id;
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
  await page
    .getByRole('dialog', { name: 'Import character', exact: true })
    .getByRole('button', { name: 'Add character', exact: true })
    .click();
  await saved(page);
  await page.goto(`/characters/${file.build.id}`);
  await saved(page);
}

async function openClock(page: Page) {
  await opener(page).focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeVisible();
}

async function undo(page: Page) {
  await page
    .getByRole('region', { name: 'Character log', exact: true })
    .getByRole('button', { name: 'Undo last command', exact: true })
    .click();
  await saved(page);
}

async function noOverflow(page: Page) {
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 21, 33)');
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
  const bounds = await dialog(page).boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
}

for (const [label, seconds, display] of [
  ['+1 min', 60, 'Day 1, 08:01'],
  ['+10 min', 600, 'Day 1, 08:10'],
  ['+1 h', 3600, 'Day 1, 09:00'],
  ['+8 h', 28800, 'Day 1, 16:00'],
] as const) {
  test(`${label} advances only game time, logs its original timestamp, survives reload and exactly undoes`, async ({
    page,
  }) => {
    await page.goto('/characters/the-fool');
    await saved(page);
    const before = await readSaved(page, 'the-fool');
    await expect(clock(page)).toContainText('Day 1, 08:00');
    await openClock(page);
    await dialog(page).getByRole('button', { name: label, exact: true }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(opener(page)).toBeFocused();
    await saved(page);
    const after = await readSaved(page, 'the-fool');
    expect(after.build).toEqual(before.build);
    expect(after.live).toEqual({
      ...before.live,
      clock: { seconds: before.live.clock.seconds + seconds },
    });
    expect(after.events).toHaveLength(before.events.length + 1);
    expect(after.events.at(-1)).toMatchObject({
      command: 'advanceTime',
      gameSeconds: before.live.clock.seconds,
    });
    expect(after.events.at(-1)?.override).toBeUndefined();
    await expect(clock(page)).toContainText(display);
    await page.reload();
    await saved(page);
    expect(await readSaved(page, 'the-fool')).toEqual(after);
    await undo(page);
    const undone = await readSaved(page, 'the-fool');
    expect(undone.build).toEqual(before.build);
    expect(undone.live).toEqual(before.live);
    expect(undone.events.at(-2)?.undoneBy).toBe(undone.events.at(-1)?.id);
    await expect(clock(page)).toContainText('Day 1, 08:00');
    await page.reload();
    await saved(page);
    expect(await readSaved(page, 'the-fool')).toEqual(undone);
  });
}

test('custom drafts validate whole units, remain read-only, and Cancel or Escape restores focus', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/characters/the-fool');
  await saved(page);
  const before = await readSaved(page, 'the-fool');
  await openClock(page);
  await expect(dialog(page).getByLabel('Days', { exact: true })).toHaveValue('0');
  await expect(dialog(page).getByLabel('Hours', { exact: true })).toHaveValue('1');
  await expect(dialog(page).getByLabel('Minutes', { exact: true })).toHaveValue('0');
  await expect(timePreview(page)).toContainText('Day 1, 08:00');
  await expect(timePreview(page)).toContainText('Day 1, 09:00');
  await dialog(page).getByLabel('Hours', { exact: true }).fill('0');
  await expect(custom(page)).toBeDisabled();
  await expect(dialog(page)).toContainText('Choose a positive amount of game time.');
  for (const invalid of ['-1', '0.5']) {
    await dialog(page).getByLabel('Minutes', { exact: true }).fill(invalid);
    await expect(custom(page)).toBeDisabled();
    await expect(dialog(page)).toContainText(
      'Use non-negative whole numbers for days, hours and minutes.',
    );
  }
  await dialog(page).getByLabel('Minutes', { exact: true }).fill('');
  await expect(custom(page)).toBeDisabled();
  for (const label of ['+1 min', '+10 min', '+1 h', '+8 h'])
    await expect(dialog(page).getByRole('button', { name: label, exact: true })).toBeEnabled();
  await dialog(page).getByLabel('Days', { exact: true }).fill('1');
  await dialog(page).getByLabel('Hours', { exact: true }).fill('2');
  await dialog(page).getByLabel('Minutes', { exact: true }).fill('3');
  await expect(custom(page)).toBeEnabled();
  await expect(timePreview(page)).toContainText('Day 2, 10:03');
  expect(await readSaved(page, 'the-fool')).toEqual(before);
  await noOverflow(page);
  for (const name of ['+1 min', '+10 min', '+1 h', '+8 h', 'Advance time', 'Cancel', 'Close']) {
    const bounds = await dialog(page).getByRole('button', { name, exact: true }).boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({
    path: info.outputPath(`game-clock-draft-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(opener(page)).toBeFocused();
  expect(await readSaved(page, 'the-fool')).toEqual(before);
  await openClock(page);
  await expect(dialog(page).getByLabel('Hours', { exact: true })).toHaveValue('1');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(opener(page)).toBeFocused();
  expect(await readSaved(page, 'the-fool')).toEqual(before);
});

test('custom time crosses midnight and expires only due concentration and effects with durable exact Undo', async ({
  page,
  isMobile,
}, info) => {
  const file = clockFile('clock-midnight-expiry');
  file.live.clock.seconds = 23 * 3600 + 45 * 60;
  const deadline = file.live.clock.seconds + 15 * 60;
  file.live.concentration = { spellId: 'spell.invisibility', slotLevel: 2, endsAt: deadline };
  file.live.effects = [
    {
      id: 'effect.due',
      name: 'Midnight ward',
      endsAt: deadline,
      concentration: false,
      conditions: [],
      modifiers: [],
    },
    {
      id: 'effect.later',
      name: 'Later ward',
      endsAt: deadline + 1,
      concentration: false,
      conditions: [],
      modifiers: [],
    },
  ];
  await importCharacter(page, file);
  const before = await readSaved(page, file.build.id);
  await openClock(page);
  await dialog(page).getByLabel('Hours', { exact: true }).fill('0');
  await dialog(page).getByLabel('Minutes', { exact: true }).fill('15');
  await expect(timePreview(page)).toContainText('Day 1, 23:45');
  await expect(timePreview(page)).toContainText('Day 2, 00:00');
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await custom(page).click();
  await expect(dialog(page)).toBeHidden();
  await saved(page);
  const after = await readSaved(page, file.build.id);
  const expected = {
    ...before.live,
    clock: { seconds: deadline },
    effects: before.live.effects.filter(({ id }) => id === 'effect.later'),
  };
  delete expected.concentration;
  expect(after.build).toEqual(before.build);
  expect(after.live).toEqual(expected);
  expect(after.events).toHaveLength(1);
  expect(after.events[0]).toMatchObject({
    command: 'advanceTime',
    gameSeconds: before.live.clock.seconds,
  });
  expect(after.events[0]?.text).toContain('Invisibility ended');
  expect(after.events[0]?.text).toContain('Midnight ward ended');
  expect(after.events[0]?.text).not.toContain('Later ward ended');
  await expect(clock(page)).toContainText('Day 2, 00:00');
  await expect(
    page.getByRole('main').getByRole('region', { name: 'Concentration', exact: true }),
  ).toContainText('None');
  await expect(
    page.getByRole('main').getByRole('region', { name: 'Effects on you', exact: true }),
  ).toContainText('Later ward');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 21, 33)');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: info.outputPath(`game-clock-expiry-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(after);
  await undo(page);
  const undone = await readSaved(page, file.build.id);
  expect(undone.build).toEqual(before.build);
  expect(undone.live).toEqual(before.live);
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(undone);
});

test('combat warning Cancel retains the custom draft and keyboard focus; explicit override preserves combat state', async ({
  page,
  isMobile,
}, info) => {
  const file = clockFile('clock-combat-warning');
  file.live.combat = {
    round: 2,
    turnActive: false,
    economy: {
      actionUsed: true,
      bonusUsed: false,
      reactionUsed: true,
      movementUsed: 10,
      objectInteractionUsed: false,
      bonusActionSpellCast: false,
      otherSpellCast: false,
    },
  };
  await importCharacter(page, file);
  const before = await readSaved(page, file.build.id);
  await openClock(page);
  await dialog(page).getByLabel('Hours', { exact: true }).fill('2');
  await dialog(page).getByLabel('Minutes', { exact: true }).fill('5');
  await expect(dialog(page)).toContainText('In combat: Start Turn advances the clock');
  await custom(page).focus();
  await page.keyboard.press('Enter');
  await expect(warning(page)).toContainText('In combat: Start Turn advances the clock');
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(custom(page)).toBeFocused();
  await expect(dialog(page).getByLabel('Hours', { exact: true })).toHaveValue('2');
  await expect(dialog(page).getByLabel('Minutes', { exact: true })).toHaveValue('5');
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`game-clock-warning-cancel-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  await custom(page).click();
  await warning(page).getByRole('button', { name: 'Do anyway', exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(opener(page)).toBeFocused();
  await saved(page);
  const after = await readSaved(page, file.build.id);
  expect(after.live).toEqual({
    ...before.live,
    clock: { seconds: before.live.clock.seconds + 7500 },
  });
  expect(after.events.at(-1)).toMatchObject({ command: 'advanceTime', override: true });
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(after);
  await undo(page);
  expect((await readSaved(page, file.build.id)).live).toEqual(before.live);
});

test('Manual mode bypasses the combat warning while unsafe clock advances stay blocked', async ({
  page,
}) => {
  const file = clockFile('clock-manual');
  file.live.combat = {
    round: 0,
    turnActive: false,
    economy: {
      actionUsed: false,
      bonusUsed: false,
      reactionUsed: false,
      movementUsed: 0,
      objectInteractionUsed: false,
      bonusActionSpellCast: false,
      otherSpellCast: false,
    },
  };
  await importCharacter(page, file);
  await page.goto(`/characters/${file.build.id}/settings`);
  await saved(page);
  await page.getByRole('radio', { name: /^Manual/ }).check();
  await saved(page);
  await page.goto(`/characters/${file.build.id}`);
  await saved(page);
  const before = await readSaved(page, file.build.id);
  await openClock(page);
  await expect(dialog(page)).not.toContainText('In combat: Start Turn advances the clock');
  await dialog(page).getByRole('button', { name: '+1 min', exact: true }).click();
  await expect(warning(page)).toHaveCount(0);
  await expect(dialog(page)).toBeHidden();
  await saved(page);
  const after = await readSaved(page, file.build.id);
  expect(after.live).toEqual({
    ...before.live,
    clock: { seconds: before.live.clock.seconds + 60 },
  });
  expect(after.events.at(-1)?.override).toBeUndefined();
  await openClock(page);
  await dialog(page).getByLabel('Days', { exact: true }).fill(String(Number.MAX_SAFE_INTEGER));
  await expect(custom(page)).toBeDisabled();
  expect(await readSaved(page, file.build.id)).toEqual(after);
});

test('an imported near-limit clock disables every overflowing preset and custom advance without a command', async ({
  page,
}) => {
  const file = clockFile('clock-safe-integer-limit');
  file.live.clock.seconds = Number.MAX_SAFE_INTEGER - 30;
  await importCharacter(page, file);
  const before = await readSaved(page, file.build.id);
  await openClock(page);
  for (const label of ['+1 min', '+10 min', '+1 h', '+8 h'])
    await expect(dialog(page).getByRole('button', { name: label, exact: true })).toBeDisabled();
  await expect(custom(page)).toBeDisabled();
  await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await readSaved(page, file.build.id)).toEqual(before);
});
