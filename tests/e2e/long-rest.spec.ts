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

const rest = (page: Page) => page.getByRole('dialog', { name: 'Long Rest', exact: true });
const preview = (page: Page) =>
  rest(page).getByRole('region', { name: 'Rest preview', exact: true });
const change = (page: Page, label: string) =>
  preview(page).getByText(label, { exact: true }).locator('..').locator('dd');
const apply = (page: Page) =>
  rest(page).getByRole('button', { name: 'Apply Long Rest', exact: true });
const warning = (page: Page) =>
  page.getByRole('dialog', { name: 'Check this action', exact: true });
const review = (page: Page) =>
  rest(page).getByRole('checkbox', { name: 'Review prepared spells after resting', exact: true });
const manage = (page: Page) => page.getByRole('dialog', { name: 'Manage spells', exact: true });

async function saved(page: Page) {
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
  file.build.name = 'Long rest check';
  file.live.characterId = id;
  file.live.hp = 18;
  file.live.hitDiceSpent = { d8: 1 };
  file.live.slotsUsed = [0, 2, 1, 0, 0, 0, 0, 0, 0, 0];
  file.live.featureUsesSpent = { 'feature.bard.bardic-inspiration': 1 };
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
  await expect(page.getByRole('dialog', { name: 'Import character', exact: true })).toBeHidden();
  await saved(page);
  await page.goto(`/characters/${file.build.id}/combat`);
  await saved(page);
}

async function openRest(page: Page) {
  const mobile = page.viewportSize()!.width < 640;
  const opener = mobile
    ? page.getByRole('button', { name: 'More', exact: true })
    : page.getByRole('button', { name: 'Long Rest', exact: true }).filter({ visible: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  if (mobile) {
    await page
      .getByRole('dialog', { name: 'More', exact: true })
      .getByRole('button', { name: 'Long Rest', exact: true })
      .click();
    await expect(page.getByRole('dialog', { name: 'More', exact: true })).toBeHidden();
  }
  await expect(rest(page)).toBeVisible();
  return opener;
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
    .getByRole('region', { name: 'Combat log', exact: true })
    .getByRole('button', { name: 'Undo last combat command', exact: true })
    .click();
  await saved(page);
  const undone = await readSaved(page, id);
  expect(undone.build).toEqual(before.build);
  expect(undone.live).toEqual(before.live);
  expect(undone.events.map((event) => event.command)).toEqual(['completeLongRest', 'undo']);
  expect(undone.events[0]?.undoneBy).toBe(undone.events[1]?.id);
  await page.reload();
  await saved(page);
  expect(await readSaved(page, id)).toEqual(undone);
}

async function manualMode(page: Page, id: string) {
  await page.goto(`/characters/${id}/settings`);
  await saved(page);
  await page.getByRole('radio', { name: /^Manual/ }).check();
  await saved(page);
  await page.goto(`/characters/${id}/combat`);
  await saved(page);
}

async function managerFocusTrap(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => setTimeout(resolve, 0));
      }),
  );
  expect(await manage(page).evaluate((element) => element.contains(document.activeElement))).toBe(
    true,
  );
  const close = manage(page).getByRole('button', { name: 'Close', exact: true });
  const done = manage(page).getByRole('button', { name: 'Done', exact: true });
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(done).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
}

test('opening and cancelling the complete preview changes nothing and restores keyboard focus', async ({
  page,
  isMobile,
}) => {
  await page.goto('/characters/the-fool/combat');
  await saved(page);
  const before = await readSaved(page, 'the-fool');
  const opener = await openRest(page);
  await expect(change(page, 'HP')).toHaveText('11 / 19 → 19 / 19');
  await expect(change(page, 'Level 1 slots')).toHaveText('0 / 4 → 4 / 4');
  await expect(change(page, 'Bardic Inspiration')).toHaveText('3 / 5 → 5 / 5');
  await expect(review(page)).toHaveCount(0);
  await expect(apply(page)).toBeEnabled();
  expect(await readSaved(page, 'the-fool')).toEqual(before);
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath(`long-rest-preview-${isMobile ? 375 : 1440}.png`),
  });
  for (const name of ['Apply Long Rest', 'Cancel', 'Close']) {
    const bounds = await rest(page).getByRole('button', { name, exact: true }).boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
  }
  await rest(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(rest(page)).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await readSaved(page, 'the-fool')).toEqual(before);
  await openRest(page);
  await page.keyboard.press('Escape');
  await expect(rest(page)).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await readSaved(page, 'the-fool')).toEqual(before);
});

test('the acceptance long rest applies one durable command with exact reload and Undo', async ({
  page,
  isMobile,
}) => {
  const file = restFile('long-rest-scenario');
  await importCharacter(page, file);
  const before = await readSaved(page, file.build.id);
  const opener = await openRest(page);
  await expect(change(page, 'HP')).toHaveText('18 / 19 → 19 / 19');
  await expect(change(page, 'Game clock')).toHaveText('Day 1, 08:00 → Day 1, 16:00');
  await expect(change(page, 'd8 Hit Dice')).toHaveText('2 / 3 → 3 / 3');
  await expect(change(page, 'Level 1 slots')).toHaveText('2 / 4 → 4 / 4');
  await expect(change(page, 'Level 2 slots')).toHaveText('1 / 2 → 2 / 2');
  await expect(change(page, 'Bardic Inspiration')).toHaveText('4 / 5 → 5 / 5');
  await expect(change(page, 'Last long rest')).toHaveText('Never → Day 1, 16:00');
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await apply(page).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath(`long-rest-actions-${isMobile ? 375 : 1440}.png`),
  });
  await apply(page).click();
  await expect(rest(page)).toBeHidden();
  await expect(opener).toBeFocused();
  await saved(page);
  const after = await readSaved(page, file.build.id);
  expect(after.build).toEqual(before.build);
  expect(after.live).toEqual({
    ...before.live,
    hp: 19,
    slotsUsed: Array<number>(10).fill(0),
    featureUsesSpent: {},
    hitDiceSpent: {},
    clock: { seconds: before.live.clock.seconds + 8 * 3600 },
    lastLongRestEnd: before.live.clock.seconds + 8 * 3600,
  });
  expect(after.events).toHaveLength(1);
  expect(after.events[0]).toMatchObject({
    command: 'completeLongRest',
    gameSeconds: before.live.clock.seconds,
    text: 'Long rest (8 h); HP 18 → 19; restored spell slots, Bardic Inspiration; 1 Hit Die back',
  });
  expect(after.events[0]?.override).toBeUndefined();
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(after);
  await undoAfterReload(page, file.build.id, before);
});

test('the full recovery preview includes temp HP, exhaustion, death saves, expiry and pending checks', async ({
  page,
  isMobile,
}) => {
  const file = restFile('long-rest-full-recovery');
  file.live.hp = 9;
  file.live.tempHp = 4;
  file.live.exhaustion = 4;
  file.live.deathSaves = { success: 1, fail: 1 };
  file.live.hitDiceSpent = { d8: 3 };
  file.live.conditions = ['prone'];
  const now = file.live.clock.seconds;
  file.live.concentration = {
    spellId: 'spell.invisibility',
    slotLevel: 2,
    endsAt: now + 3600,
    effectId: 'effect.self',
    pendingSaves: [{ id: 'earlier-damage', dc: 11 }],
  };
  file.live.effects = [
    {
      id: 'effect.self',
      name: 'Invisibility',
      sourceId: 'spell.invisibility',
      concentration: true,
      conditions: ['invisible'],
      modifiers: [],
    },
    {
      id: 'effect.due',
      name: 'Due ward',
      endsAt: now + 8 * 3600,
      concentration: false,
      conditions: [],
      modifiers: [],
    },
    {
      id: 'effect.later',
      name: 'Surviving ward',
      endsAt: now + 8 * 3600 + 1,
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
  await expect(change(page, 'HP')).toHaveText('9 / 9 → 19 / 19');
  await expect(change(page, 'Temporary HP')).toHaveText('4 → 0');
  await expect(change(page, 'Exhaustion')).toHaveText('4 → 3');
  await expect(change(page, 'Death saves')).toHaveText(
    '1 success / 1 failure → 0 successes / 0 failures',
  );
  await expect(change(page, 'd8 Hit Dice')).toHaveText('0 / 3 → 1 / 3');
  await expect(change(page, 'Concentration')).toHaveText('Invisibility → None');
  await expect(change(page, 'Pending concentration checks')).toHaveText('1 → 0');
  await expect(change(page, 'Due ward')).toHaveText('Active → Ended');
  await expect(change(page, 'Surviving ward')).toHaveText('Active → Active');
  await expect(change(page, 'Untimed ward')).toHaveText('Active → Active');
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath(`long-rest-full-top-${isMobile ? 375 : 1440}.png`),
  });
  await change(page, 'Pending concentration checks').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath(`long-rest-full-diff-${isMobile ? 375 : 1440}.png`),
  });
  await apply(page).click();
  await saved(page);
  const after = await readSaved(page, file.build.id);
  const expected = {
    ...before.live,
    hp: 19,
    tempHp: 0,
    exhaustion: 3,
    deathSaves: { success: 0, fail: 0 },
    hitDiceSpent: { d8: 2 },
    slotsUsed: Array<number>(10).fill(0),
    featureUsesSpent: {},
    effects: before.live.effects.filter((effect) =>
      ['effect.later', 'effect.untimed'].includes(effect.id),
    ),
    clock: { seconds: now + 8 * 3600 },
    lastLongRestEnd: now + 8 * 3600,
  };
  delete expected.concentration;
  expect(after.build).toEqual(before.build);
  expect(after.live).toEqual(expected);
  expect(after.events).toHaveLength(1);
  expect(after.events[0]?.text).toContain('Invisibility ended');
  expect(after.events[0]?.text).toContain('Due ward ended');
  await expect(page.getByRole('region', { name: 'Concentration saves', exact: true })).toHaveCount(
    0,
  );
  await undoAfterReload(page, file.build.id, before);
});

test('surviving concentration and pending checks remain after a shorter linked effect expires', async ({
  page,
}) => {
  const file = restFile('long-rest-surviving-concentration');
  const now = file.live.clock.seconds;
  file.live.concentration = {
    spellId: 'spell.invisibility',
    slotLevel: 3,
    endsAt: now + 8 * 3600 + 1,
    effectId: 'effect.short-self',
    pendingSaves: [{ id: 'pending-damage', dc: 10 }],
  };
  file.live.effects = [
    {
      id: 'effect.short-self',
      name: 'Short self effect',
      sourceId: 'spell.invisibility',
      endsAt: now + 1,
      concentration: true,
      conditions: ['invisible'],
      modifiers: [],
    },
  ];
  await importCharacter(page, file);
  const before = await readSaved(page, file.build.id);
  await openRest(page);
  await expect(change(page, 'Concentration')).toHaveText('Invisibility → Invisibility');
  await expect(change(page, 'Pending concentration checks')).toHaveText('1 → 1');
  await expect(change(page, 'Short self effect')).toHaveText('Active → Ended');
  await apply(page).click();
  await saved(page);
  const after = await readSaved(page, file.build.id);
  const concentration = { ...before.live.concentration! };
  delete concentration.effectId;
  expect(after.live.concentration).toEqual(concentration);
  expect(after.live.effects).toEqual([]);
  expect(after.events).toHaveLength(1);
  await undoAfterReload(page, file.build.id, before);
});

test('short-rest feature pools and Pact Magic recover while the clock crosses dawn', async ({
  page,
}) => {
  const file = restFile('long-rest-recharge');
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
  file.live.clock.seconds = 23 * 3600;
  file.live.pactSlotsUsed = 2;
  file.live.featureUsesSpent = { 'feature.bard.bardic-inspiration': 2 };
  await importCharacter(page, file);
  const before = await readSaved(page, file.build.id);
  await openRest(page);
  await expect(change(page, 'Game clock')).toHaveText('Day 1, 23:00 → Day 2, 07:00');
  await expect(change(page, 'Pact slots (level 1)')).toHaveText('0 / 2 → 2 / 2');
  await expect(change(page, 'Bardic Inspiration')).toHaveText('3 / 5 → 5 / 5');
  await expect(change(page, 'Level 1 slots')).toHaveText('2 / 4 → 4 / 4');
  await apply(page).click();
  await saved(page);
  const after = await readSaved(page, file.build.id);
  expect(after.live.pactSlotsUsed).toBeUndefined();
  expect(after.live.slotsUsed).toEqual(Array<number>(10).fill(0));
  expect(after.live.featureUsesSpent).toEqual({});
  expect(after.live.items).toEqual(before.live.items);
  expect(after.live.currency).toEqual(before.live.currency);
  expect(after.events).toHaveLength(1);
  expect(after.events[0]?.command).toBe('completeLongRest');
});

test('a second long rest keeps its preview and focus through warning Cancel, Escape, and explicit override', async ({
  page,
  isMobile,
}) => {
  const file = restFile('long-rest-warning');
  file.live.lastLongRestEnd = file.live.clock.seconds;
  await importCharacter(page, file);
  const before = await readSaved(page, file.build.id);
  const opener = await openRest(page);
  await expect(rest(page).getByRole('note')).toContainText('Less than 24 h since last long rest');
  await expect(change(page, 'HP')).toHaveText('18 / 19 → 19 / 19');
  await expect(apply(page)).toBeEnabled();
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await apply(page).click();
  await expect(warning(page)).toBeVisible();
  await expect(warning(page)).toContainText('Less than 24 h since last long rest');
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await page.screenshot({
    path: test.info().outputPath(`long-rest-warning-${isMobile ? 375 : 1440}.png`),
  });
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(warning(page)).toBeHidden();
  await expect(rest(page)).toBeVisible();
  await expect(apply(page)).toBeFocused();
  await expect(change(page, 'HP')).toHaveText('18 / 19 → 19 / 19');
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await apply(page).click();
  await expect(warning(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(warning(page)).toBeHidden();
  await expect(rest(page)).toBeVisible();
  await expect(apply(page)).toBeFocused();
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await apply(page).click();
  await warning(page).getByRole('button', { name: 'Do anyway', exact: true }).click();
  await expect(warning(page)).toBeHidden();
  await expect(rest(page)).toBeHidden();
  await expect(opener).toBeFocused();
  await saved(page);
  const after = await readSaved(page, file.build.id);
  expect(after.events).toHaveLength(1);
  expect(after.events[0]).toMatchObject({ command: 'completeLongRest', override: true });
  expect(after.live.clock.seconds).toBe(before.live.clock.seconds + 8 * 3600);
  await undoAfterReload(page, file.build.id, before);
});

test('a nightly rest is allowed exactly 24 hours from the previous rest end to the new end', async ({
  page,
}) => {
  const file = restFile('long-rest-interval-boundary');
  file.live.clock.seconds += 24 * 3600;
  file.live.lastLongRestEnd = file.live.clock.seconds - 16 * 3600;
  await importCharacter(page, file);
  await openRest(page);
  await expect(rest(page).getByRole('note')).toHaveCount(0);
  await expect(apply(page)).toBeEnabled();
  await apply(page).click();
  await expect(warning(page)).toBeHidden();
  await saved(page);
  const after = await readSaved(page, file.build.id);
  expect(after.events).toHaveLength(1);
  expect(after.events[0]?.override).toBeUndefined();
  expect(after.live.lastLongRestEnd! - file.live.lastLongRestEnd).toBe(24 * 3600);
});

for (const blockedBy of ['zero HP', 'combat', 'death'] as const) {
  test(`${blockedBy} blocks the rest and leaves every value unchanged`, async ({ page }) => {
    const file = restFile(`long-rest-blocked-${blockedBy.replaceAll(' ', '-')}`);
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
      file.live.deathSaves = { success: 0, fail: blockedBy === 'death' ? 3 : 0 };
      file.live.conditions = ['unconscious'];
    }
    await importCharacter(page, file);
    const before = await readSaved(page, file.build.id);
    const opener = await openRest(page);
    await expect(apply(page)).toBeDisabled();
    await expect(rest(page).getByRole('alert')).toContainText(
      blockedBy === 'combat'
        ? 'End combat before resting'
        : blockedBy === 'death'
          ? 'You are dead'
          : "Can't long rest at 0 HP",
    );
    await expect(warning(page)).toHaveCount(0);
    expect(await readSaved(page, file.build.id)).toEqual(before);
    await rest(page).getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(opener).toBeFocused();
    expect(await readSaved(page, file.build.id)).toEqual(before);
  });
}

test('Manual suppresses the interval warning while health, combat and death remain Blocks', async ({
  page,
}) => {
  const file = restFile('long-rest-manual-warning');
  file.live.lastLongRestEnd = file.live.clock.seconds;
  await importCharacter(page, file);
  await manualMode(page, file.build.id);
  await openRest(page);
  await expect(rest(page).getByRole('note')).toHaveCount(0);
  await expect(change(page, 'HP')).toHaveText('18 / 19 → 19 / 19');
  await apply(page).click();
  await expect(warning(page)).toHaveCount(0);
  await expect(rest(page)).toBeHidden();
  await saved(page);
  const after = await readSaved(page, file.build.id);
  expect(after.events).toHaveLength(1);
  expect(after.events[0]?.override).toBeUndefined();
  for (const blockedBy of ['zero HP', 'combat', 'exhaustion death'] as const) {
    const blocked = restFile(`long-rest-manual-${blockedBy.replaceAll(' ', '-')}`);
    blocked.live.lastLongRestEnd = blocked.live.clock.seconds;
    if (blockedBy === 'combat') {
      blocked.live.combat = {
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
    } else if (blockedBy === 'zero HP') {
      blocked.live.hp = 0;
      blocked.live.conditions = ['unconscious'];
    } else {
      blocked.live.exhaustion = 6;
    }
    await importCharacter(page, blocked);
    const before = await readSaved(page, blocked.build.id);
    await openRest(page);
    await expect(apply(page)).toBeDisabled();
    await expect(rest(page).getByRole('alert')).toContainText(
      blockedBy === 'combat'
        ? 'End combat before resting'
        : blockedBy === 'zero HP'
          ? "Can't long rest at 0 HP"
          : 'You are dead',
    );
    expect(await readSaved(page, blocked.build.id)).toEqual(before);
    await rest(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  }
});

for (const pool of ['odd total', 'single die', 'mixed sizes'] as const) {
  test(`Hit Dice recovery respects the half cap for ${pool}`, async ({ page }) => {
    const file = restFile(`long-rest-hit-dice-${pool.replaceAll(' ', '-')}`);
    let expected: LiveState['hitDiceSpent'] = { d8: 2 };
    file.live.hitDiceSpent = { d8: 3 };
    if (pool === 'single die') {
      file.build.classes = [{ classId: 'class.bard', level: 1 }];
      file.build.hpEntries = file.build.hpEntries.slice(0, 1);
      file.live.hp = 5;
      file.live.hitDiceSpent = { d8: 1 };
      expected = {};
    } else if (pool === 'mixed sizes') {
      file.build.classes.push({ classId: 'class.fighter', level: 2 });
      file.build.hpEntries.push(
        { level: 4, classId: 'class.fighter', value: 6, method: 'rolled' },
        { level: 5, classId: 'class.fighter', value: 6, method: 'rolled' },
      );
      file.live.hitDiceSpent = { d8: 3, d10: 2 };
      expected = { d8: 3 };
    }
    await importCharacter(page, file);
    const before = await readSaved(page, file.build.id);
    await openRest(page);
    if (pool === 'mixed sizes') {
      await expect(change(page, 'd10 Hit Dice')).toHaveText('0 / 2 → 2 / 2');
      await expect(change(page, 'd8 Hit Dice')).toHaveText('0 / 3 → 0 / 3');
    } else {
      await expect(change(page, 'd8 Hit Dice')).toHaveText(
        pool === 'single die' ? '0 / 1 → 1 / 1' : '0 / 3 → 1 / 3',
      );
    }
    expect(await readSaved(page, file.build.id)).toEqual(before);
    await apply(page).click();
    await saved(page);
    const after = await readSaved(page, file.build.id);
    expect(after.live.hitDiceSpent).toEqual(expected);
    expect(after.events).toHaveLength(1);
    expect(after.events[0]?.text).toContain(
      pool === 'mixed sizes' ? '2 Hit Dice back' : '1 Hit Die back',
    );
    await undoAfterReload(page, file.build.id, before);
  });
}

test('prepared-caster review opens the existing manager on the first prepared class after the rest', async ({
  page,
  isMobile,
}) => {
  const file = restFile('long-rest-prepared-review');
  file.build.classes.push({ classId: 'class.cleric', level: 3 });
  file.build.hpEntries.push(
    { level: 4, classId: 'class.cleric', value: 4, method: 'rolled' },
    { level: 5, classId: 'class.cleric', value: 4, method: 'rolled' },
    { level: 6, classId: 'class.cleric', value: 4, method: 'rolled' },
  );
  file.build.spells.push({
    classId: 'class.cleric',
    known: ['spell.guidance'],
    prepared: ['spell.bless'],
  });
  await importCharacter(page, file);
  const before = await readSaved(page, file.build.id);
  const opener = await openRest(page);
  await expect(review(page)).toBeChecked();
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await apply(page).click();
  await expect(rest(page)).toBeHidden();
  await expect(manage(page)).toBeVisible();
  await expect(
    manage(page).getByRole('combobox', { name: 'Casting class', exact: true }),
  ).toHaveValue('class.cleric');
  await expect(manage(page).locator('[aria-label="Spell selection counts"]')).toContainText(
    '1 / 4 prepared',
  );
  await expect
    .poll(() => manage(page).evaluate((element) => element.contains(document.activeElement)))
    .toBe(true);
  await managerFocusTrap(page);
  await saved(page);
  const after = await readSaved(page, file.build.id);
  expect(after.build).toEqual(before.build);
  expect(after.events.map((event) => event.command)).toEqual(['completeLongRest']);
  await page.screenshot({
    path: test.info().outputPath(`long-rest-prepared-${isMobile ? 375 : 1440}.png`),
  });
  await manage(page).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(manage(page)).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await readSaved(page, file.build.id)).toEqual(after);
  await undoAfterReload(page, file.build.id, before);
});

test('a warned repeated rest retains focus inside prepared review after the warning unmounts', async ({
  page,
  isMobile,
}) => {
  const file = restFile('long-rest-prepared-warning');
  file.build.classes = [{ classId: 'class.cleric', level: 3 }];
  file.build.hpEntries = file.build.hpEntries.map((entry) => ({
    ...entry,
    classId: 'class.cleric',
  }));
  file.build.spells = [
    { classId: 'class.cleric', known: ['spell.guidance'], prepared: ['spell.bless'] },
  ];
  await importCharacter(page, file);
  const before = await readSaved(page, file.build.id);
  const opener = await openRest(page);
  await apply(page).click();
  await expect(manage(page)).toBeVisible();
  await managerFocusTrap(page);
  await manage(page).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(opener).toBeFocused();
  await saved(page);
  const first = await readSaved(page, file.build.id);
  await openRest(page);
  await expect(review(page)).toBeChecked();
  await apply(page).click();
  await expect(warning(page)).toBeVisible();
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(review(page)).toBeChecked();
  await expect(apply(page)).toBeFocused();
  expect(await readSaved(page, file.build.id)).toEqual(first);
  await apply(page).click();
  await warning(page).getByRole('button', { name: 'Do anyway', exact: true }).click();
  await expect(warning(page)).toBeHidden();
  await expect(rest(page)).toBeHidden();
  await expect(manage(page)).toBeVisible();
  await managerFocusTrap(page);
  await saved(page);
  const after = await readSaved(page, file.build.id);
  expect(after.build).toEqual(before.build);
  expect(after.live.clock.seconds).toBe(before.live.clock.seconds + 16 * 3600);
  expect(after.events.map((event) => event.command)).toEqual([
    'completeLongRest',
    'completeLongRest',
  ]);
  expect(after.events[0]?.override).toBeUndefined();
  expect(after.events[1]?.override).toBe(true);
  await page.screenshot({
    path: test.info().outputPath(`long-rest-prepared-warning-${isMobile ? 375 : 1440}.png`),
  });
  await manage(page).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(opener).toBeFocused();
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(after);
  await page
    .getByRole('region', { name: 'Combat log', exact: true })
    .getByRole('button', { name: 'Undo last combat command', exact: true })
    .click();
  await saved(page);
  const undone = await readSaved(page, file.build.id);
  expect(undone.build).toEqual(first.build);
  expect(undone.live).toEqual(first.live);
});

test('unchecking prepared review closes normally and leaves all prepared choices unchanged', async ({
  page,
}) => {
  const file = restFile('long-rest-prepared-unchecked');
  file.build.classes = [{ classId: 'class.cleric', level: 3 }];
  file.build.hpEntries = file.build.hpEntries.map((entry) => ({
    ...entry,
    classId: 'class.cleric',
  }));
  file.build.spells = [
    { classId: 'class.cleric', known: ['spell.guidance'], prepared: ['spell.bless'] },
  ];
  await importCharacter(page, file);
  const before = await readSaved(page, file.build.id);
  const opener = await openRest(page);
  await expect(review(page)).toBeChecked();
  await review(page).uncheck();
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await apply(page).click();
  await expect(rest(page)).toBeHidden();
  await expect(manage(page)).toHaveCount(0);
  await expect(opener).toBeFocused();
  await saved(page);
  const after = await readSaved(page, file.build.id);
  expect(after.build).toEqual(before.build);
  expect(after.events).toHaveLength(1);
});

test('a first-level Paladin and an unowned imported preparation list do not offer prepared review', async ({
  page,
}) => {
  for (const classId of ['class.paladin', 'class.bard']) {
    const file = restFile(`long-rest-no-preparation-${classId}`);
    if (classId === 'class.paladin') {
      file.build.classes = [{ classId, level: 1 }];
      file.build.hpEntries = [{ level: 1, classId, value: 10, method: 'max' }];
      file.live.hp = 5;
      file.live.hitDiceSpent = { d10: 1 };
    }
    file.build.spells.push({ classId: 'class.cleric', known: [], prepared: ['spell.bless'] });
    await importCharacter(page, file);
    await openRest(page);
    await expect(review(page)).toHaveCount(0);
    await apply(page).click();
    await expect(rest(page)).toBeHidden();
    await expect(manage(page)).toHaveCount(0);
    await saved(page);
  }
});

test('the tablet toolbar opens the shared dialog with usable focus and no horizontal overflow', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Tablet layout is checked once with desktop browser input.');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/characters/the-fool/combat');
  await saved(page);
  const before = await readSaved(page, 'the-fool');
  const opener = await openRest(page);
  await expect(change(page, 'HP')).toHaveText('11 / 19 → 19 / 19');
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('long-rest-tablet-768.png') });
  await page.keyboard.press('Escape');
  await expect(rest(page)).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await readSaved(page, 'the-fool')).toEqual(before);
});
