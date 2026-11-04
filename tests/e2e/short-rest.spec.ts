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

const rest = (page: Page) => page.getByRole('dialog', { name: 'Short Rest', exact: true });
const preview = (page: Page) =>
  rest(page).getByRole('region', { name: 'Rest preview', exact: true });
const change = (page: Page, label: string) =>
  preview(page).getByText(label, { exact: true }).locator('..').locator('dd');
const apply = (page: Page) =>
  rest(page).getByRole('button', { name: 'Apply Short Rest', exact: true });
const song = (page: Page) =>
  rest(page).getByRole('checkbox', { name: 'Add Song of Rest', exact: true });

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

function restFile(id: string): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = id;
  file.build.name = 'Short rest check';
  file.live.characterId = id;
  file.live.hp = 13;
  file.live.tempHp = 4;
  file.live.slotsUsed = [0, 2, 1, 0, 0, 0, 0, 0, 0, 0];
  file.live.featureUsesSpent = { 'feature.bard.bardic-inspiration': 1 };
  file.live.conditions = ['prone'];
  file.live.exhaustion = 1;
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
  await page.goto(`/characters/${file.build.id}/combat`);
  await saved(page);
}

async function openRest(page: Page) {
  const width = page.viewportSize()!.width;
  const opener =
    width < 640
      ? page.getByRole('button', { name: 'More', exact: true })
      : page.getByRole('button', { name: 'Short Rest', exact: true }).filter({ visible: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  if (width < 640) {
    await page
      .getByRole('dialog', { name: 'More', exact: true })
      .getByRole('button', { name: 'Short Rest', exact: true })
      .click();
    await expect(page.getByRole('dialog', { name: 'More', exact: true })).toBeHidden();
  }
  await expect(rest(page)).toBeVisible();
  return opener;
}

async function addDie(page: Page, roll: number, index = 1) {
  await rest(page).getByRole('button', { name: 'Add Hit Die', exact: true }).click();
  await rest(page).getByLabel(`d8 roll ${index}`, { exact: true }).fill(String(roll));
}

async function noOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
  const bounds = await rest(page).boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
}

async function undoAfterReload(page: Page, id: string, before: SavedCharacter) {
  await page.reload();
  await saved(page);
  await page
    .getByRole('region', { name: 'Character log', exact: true })
    .getByRole('button', { name: 'Undo last command', exact: true })
    .click();
  await saved(page);
  const undone = await readSaved(page, id);
  expect(undone.build).toEqual(before.build);
  expect(undone.live).toEqual(before.live);
  expect(undone.events.map((event) => event.command)).toEqual(['completeShortRest', 'undo']);
  expect(undone.events[0]?.undoneBy).toBe(undone.events[1]?.id);
  await page.reload();
  await saved(page);
  expect(await readSaved(page, id)).toEqual(undone);
}

test('Hit Dice and Song of Rest remain a local draft; Cancel and Escape discard it and restore focus', async ({
  page,
  isMobile,
}) => {
  await page.goto('/characters/the-fool/combat');
  await saved(page);
  const before = await readSaved(page, 'the-fool');
  const opener = await openRest(page);
  await expect(song(page)).toBeDisabled();
  await expect(rest(page)).toContainText(/CON\s*\+1/);
  await addDie(page, 2);
  await expect(rest(page)).toContainText('d8: 2 / 3 left');
  await expect(change(page, 'HP')).toHaveText('11 / 19 → 14 / 19');
  await addDie(page, 1, 2);
  await expect(rest(page)).toContainText('d8: 1 / 3 left');
  await expect(change(page, 'HP')).toHaveText('11 / 19 → 16 / 19');
  await rest(page).getByRole('button', { name: 'Remove d8 roll 1', exact: true }).click();
  await expect(rest(page).getByLabel('d8 roll 1', { exact: true })).toHaveValue('1');
  await expect(rest(page).getByLabel('d8 roll 2', { exact: true })).toHaveCount(0);
  await expect(rest(page)).toContainText('d8: 2 / 3 left');
  await song(page).check();
  await rest(page).getByLabel('Song of Rest roll', { exact: true }).fill('2');
  await expect(change(page, 'HP')).toHaveText('11 / 19 → 15 / 19');
  await expect(rest(page).getByLabel('Song of Rest roll', { exact: true })).toHaveCount(1);
  expect(await readSaved(page, 'the-fool')).toEqual(before);
  await noOverflow(page);
  for (const name of ['Add Hit Die', 'Remove d8 roll 1', 'Apply Short Rest', 'Cancel']) {
    const bounds = await rest(page).getByRole('button', { name, exact: true }).boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({
    path: test.info().outputPath(`short-rest-draft-${isMobile ? 375 : 1440}.png`),
  });
  await rest(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(rest(page)).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await readSaved(page, 'the-fool')).toEqual(before);
  await openRest(page);
  await expect(rest(page).getByLabel('d8 roll 1', { exact: true })).toHaveCount(0);
  await expect(song(page)).not.toBeChecked();
  await addDie(page, 8);
  await page.keyboard.press('Escape');
  await expect(rest(page)).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await readSaved(page, 'the-fool')).toEqual(before);
});

test('the acceptance short rest previews and applies one durable command with exact Undo', async ({
  page,
  isMobile,
}) => {
  const file = restFile('short-rest-scenario');
  await importCharacter(page, file);
  const before = await readSaved(page, file.build.id);
  const opener = await openRest(page);
  await addDie(page, 2);
  await song(page).check();
  await expect(
    rest(page).getByRole('combobox', { name: 'Song of Rest source', exact: true }),
  ).toHaveValue('self');
  await expect(rest(page).getByLabel('Song of Rest roll', { exact: true })).toHaveAttribute(
    'max',
    '6',
  );
  await rest(page).getByLabel('Song of Rest roll', { exact: true }).fill('2');
  await expect(change(page, 'HP')).toHaveText('13 / 19 → 18 / 19');
  await expect(change(page, 'Game clock')).toHaveText('Day 1, 08:00 → Day 1, 09:00');
  await expect(change(page, 'd8 Hit Dice')).toHaveText('3 / 3 → 2 / 3');
  await expect(change(page, 'Level 1 slots')).toHaveText('2 / 4 → 2 / 4');
  await expect(change(page, 'Level 2 slots')).toHaveText('1 / 2 → 1 / 2');
  await expect(change(page, 'Bardic Inspiration')).toHaveText('4 / 5 → 4 / 5');
  await expect(apply(page)).toBeEnabled();
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath(`short-rest-preview-${isMobile ? 375 : 1440}.png`),
  });
  await apply(page).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath(`short-rest-diff-${isMobile ? 375 : 1440}.png`),
  });
  await apply(page).click();
  await expect(rest(page)).toBeHidden();
  await expect(opener).toBeFocused();
  await saved(page);
  const after = await readSaved(page, file.build.id);
  expect(after.build).toEqual(before.build);
  expect(after.live).toEqual({
    ...before.live,
    hp: 18,
    hitDiceSpent: { d8: 1 },
    clock: { seconds: before.live.clock.seconds + 3600 },
  });
  expect(after.events).toHaveLength(1);
  expect(after.events[0]).toMatchObject({
    command: 'completeShortRest',
    gameSeconds: before.live.clock.seconds,
    text: 'Short rest (1 h); 1 Hit Die + Song of Rest: HP 13 → 18',
  });
  expect(after.events[0]?.override).toBeUndefined();
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(after);
  await undoAfterReload(page, file.build.id, before);
});

test('the complete preview includes timed concentration and effect expiry before a rest without dice', async ({
  page,
}) => {
  const file = restFile('short-rest-expiry');
  const now = file.live.clock.seconds;
  file.live.concentration = {
    spellId: 'spell.invisibility',
    slotLevel: 2,
    endsAt: now + 1800,
    effectId: 'effect.self',
    pendingSaves: [{ id: 'previous-damage', dc: 10 }],
  };
  file.live.effects = [
    {
      id: 'effect.self',
      name: 'Invisibility',
      sourceId: 'spell.invisibility',
      endsAt: now + 1800,
      concentration: true,
      conditions: ['invisible'],
      modifiers: [],
    },
    {
      id: 'effect.due',
      name: 'Due ward',
      endsAt: now + 3600,
      concentration: false,
      conditions: [],
      modifiers: [],
    },
    {
      id: 'effect.later',
      name: 'Surviving ward',
      endsAt: now + 3601,
      concentration: false,
      conditions: [],
      modifiers: [],
    },
    {
      id: 'effect.untimed',
      name: 'Untimed ward',
      concentration: false,
      conditions: [],
      modifiers: [],
    },
  ];
  await importCharacter(page, file);
  const before = await readSaved(page, file.build.id);
  await openRest(page);
  await expect(preview(page)).toContainText('Invisibility');
  await expect(change(page, 'Concentration')).toHaveText('Invisibility → None');
  await expect(change(page, 'Pending concentration checks')).toHaveText('1 → 0');
  await expect(change(page, 'Due ward')).toHaveText('Active → Ended');
  await expect(change(page, 'Surviving ward')).toHaveText('Active → Active');
  await expect(apply(page)).toBeEnabled();
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await apply(page).click();
  await saved(page);
  const after = await readSaved(page, file.build.id);
  const expected = {
    ...before.live,
    clock: { seconds: now + 3600 },
    effects: before.live.effects.filter((effect) =>
      ['effect.later', 'effect.untimed'].includes(effect.id),
    ),
  };
  delete expected.concentration;
  expect(after.live).toEqual(expected);
  expect(after.events).toHaveLength(1);
  expect(after.events[0]?.text).toContain('Invisibility ended');
  expect(after.events[0]?.text).toContain('Due ward ended');
  await expect(page.getByRole('region', { name: 'Concentration saves', exact: true })).toHaveCount(
    0,
  );
  await undoAfterReload(page, file.build.id, before);
});

test('short-rest features and Pact Magic recover while ordinary slots and HP stay unchanged', async ({
  page,
}) => {
  const file = restFile('short-rest-recharge');
  file.build.classes = [
    { classId: 'class.bard', subclassId: 'subclass.bard.lore', level: 5 },
    { classId: 'class.warlock', level: 2 },
  ];
  file.build.hpEntries = Array.from({ length: 7 }, (_, index) => ({
    level: index + 1,
    classId: index < 5 ? 'class.bard' : 'class.warlock',
    value: index === 0 ? 8 : 4,
    method: index === 0 ? 'max' : 'rolled',
  }));
  file.live.featureUsesSpent = { 'feature.bard.bardic-inspiration': 2 };
  file.live.pactSlotsUsed = 2;
  await importCharacter(page, file);
  const before = await readSaved(page, file.build.id);
  await openRest(page);
  await expect(change(page, 'Bardic Inspiration')).toHaveText('3 / 5 → 5 / 5');
  await expect(change(page, 'Pact slots (level 1)')).toHaveText('0 / 2 → 2 / 2');
  await expect(change(page, 'Level 1 slots')).toHaveText('2 / 4 → 2 / 4');
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await apply(page).click();
  await saved(page);
  const after = await readSaved(page, file.build.id);
  const expected = {
    ...before.live,
    clock: { seconds: before.live.clock.seconds + 3600 },
    featureUsesSpent: {},
  };
  delete expected.pactSlotsUsed;
  expect(after.live).toEqual(expected);
  expect(after.events).toHaveLength(1);
  expect(after.events[0]?.command).toBe('completeShortRest');
  expect(after.events[0]?.text).toContain('restored Bardic Inspiration, pact slots');
});

test('invalid Hit Die and Song rolls block Apply; another bard is an explicit source with its own range', async ({
  page,
}) => {
  await page.goto('/characters/the-fool/combat');
  await saved(page);
  const before = await readSaved(page, 'the-fool');
  await openRest(page);
  await addDie(page, 9);
  await expect(apply(page)).toBeDisabled();
  await expect(rest(page).getByRole('alert')).toContainText('1 to 8');
  const roll = rest(page).getByLabel('d8 roll 1', { exact: true });
  await roll.fill('1.5');
  await expect(apply(page)).toBeDisabled();
  await roll.fill('');
  await expect(apply(page)).toBeDisabled();
  await roll.fill('2');
  await song(page).check();
  const songRoll = rest(page).getByLabel('Song of Rest roll', { exact: true });
  await songRoll.fill('7');
  await expect(apply(page)).toBeDisabled();
  await expect(rest(page).getByRole('alert')).toContainText('1 to 6');
  await rest(page)
    .getByRole('combobox', { name: 'Song of Rest source', exact: true })
    .selectOption({ label: 'Another bard' });
  await songRoll.fill('12');
  await expect(apply(page)).toBeEnabled();
  await songRoll.fill('13');
  await expect(apply(page)).toBeDisabled();
  await expect(rest(page).getByRole('alert')).toContainText('1 to 12');
  await songRoll.fill('12');
  await expect(apply(page)).toBeEnabled();
  expect(await readSaved(page, 'the-fool')).toEqual(before);
  await rest(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await readSaved(page, 'the-fool')).toEqual(before);
});

test('a zero-healing Hit Die does not enable Song of Rest', async ({ page }) => {
  const file = restFile('short-rest-zero-healing');
  file.build.abilityScores.base.CON = 7;
  file.live.hp = 5;
  await importCharacter(page, file);
  const before = await readSaved(page, file.build.id);
  await openRest(page);
  await expect(rest(page)).toContainText(/CON\s*−1|CON\s*-1/);
  await addDie(page, 1);
  await expect(song(page)).toBeDisabled();
  await expect(apply(page)).toBeEnabled();
  await rest(page).getByLabel('d8 roll 1', { exact: true }).fill('2');
  await expect(song(page)).toBeEnabled();
  await song(page).check();
  await rest(page).getByLabel('Song of Rest roll', { exact: true }).fill('2');
  await expect(apply(page)).toBeEnabled();
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await rest(page).getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('exhausted Hit Dice disable spending and Song but still allow an hour of rest', async ({
  page,
}) => {
  const file = restFile('short-rest-no-dice');
  file.live.hitDiceSpent = { d8: 3 };
  await importCharacter(page, file);
  const before = await readSaved(page, file.build.id);
  await openRest(page);
  await expect(rest(page)).toContainText('d8: 0 / 3 left');
  await expect(rest(page).getByRole('button', { name: 'Add Hit Die', exact: true })).toBeDisabled();
  await expect(song(page)).toBeDisabled();
  await expect(apply(page)).toBeEnabled();
  await apply(page).click();
  await saved(page);
  const after = await readSaved(page, file.build.id);
  expect(after.live).toEqual({
    ...before.live,
    clock: { seconds: before.live.clock.seconds + 3600 },
  });
  expect(after.events).toHaveLength(1);
  expect(after.events[0]?.command).toBe('completeShortRest');
});

test('removing a mixed-pool roll keeps keyboard focus usable when the selected pool is depleted', async ({
  page,
}) => {
  const file = restFile('short-rest-mixed-pool-focus');
  file.build.classes.push({ classId: 'class.fighter', level: 1 });
  file.build.hpEntries.push({ level: 4, classId: 'class.fighter', value: 6, method: 'rolled' });
  await importCharacter(page, file);
  const before = await readSaved(page, file.build.id);
  await openRest(page);
  const die = rest(page).getByRole('combobox', { name: 'Hit Die', exact: true });
  await die.selectOption('d10');
  await rest(page).getByRole('button', { name: 'Add Hit Die', exact: true }).click();
  await rest(page).getByLabel('d10 roll 1', { exact: true }).fill('2');
  await die.selectOption('d8');
  for (const index of [2, 3, 4]) await addDie(page, 2, index);
  await expect(rest(page).getByRole('button', { name: 'Add Hit Die', exact: true })).toBeDisabled();
  await rest(page).getByRole('button', { name: 'Remove d10 roll 1', exact: true }).click();
  await expect(die).toBeFocused();
  await expect(rest(page)).toContainText('d8: 0 / 3 left');
  await expect(rest(page)).toContainText('d10: 1 / 1 left');
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await rest(page).getByRole('button', { name: 'Cancel', exact: true }).click();
});

for (const blockedBy of ['combat', 'death'] as const) {
  test(`${blockedBy} blocks the rest before any change can apply`, async ({ page }) => {
    const file = restFile(`short-rest-blocked-${blockedBy}`);
    if (blockedBy === 'combat') {
      file.live.combat = {
        round: 1,
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
    } else {
      file.live.hp = 0;
      file.live.deathSaves = { success: 0, fail: 3 };
      file.live.conditions = ['unconscious'];
    }
    await importCharacter(page, file);
    const before = await readSaved(page, file.build.id);
    const opener = await openRest(page);
    await expect(apply(page)).toBeDisabled();
    await expect(rest(page).getByRole('alert')).toContainText(
      blockedBy === 'combat' ? 'End combat before resting' : /dead/i,
    );
    expect(await readSaved(page, file.build.id)).toEqual(before);
    await rest(page).getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(opener).toBeFocused();
    expect(await readSaved(page, file.build.id)).toEqual(before);
  });
}

test('the tablet toolbar opens the shared Short Rest dialog with keyboard focus restoration', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Tablet layout is checked once with desktop browser input.');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/characters/the-fool/combat');
  await saved(page);
  const before = await readSaved(page, 'the-fool');
  const opener = await openRest(page);
  await addDie(page, 2);
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('short-rest-tablet-768.png') });
  await page.keyboard.press('Escape');
  await expect(rest(page)).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await readSaved(page, 'the-fool')).toEqual(before);
});
