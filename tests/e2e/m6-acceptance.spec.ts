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

const INSPIRATION = 'feature.bard.bardic-inspiration';
const main = (page: Page) => page.getByRole('main');
const hud = (page: Page) => page.getByRole('banner', { name: 'Character HUD', exact: true });
const rest = (page: Page, kind: 'Short' | 'Long') =>
  page.getByRole('dialog', { name: `${kind} Rest`, exact: true });
const change = (page: Page, kind: 'Short' | 'Long', label: string) =>
  rest(page, kind)
    .getByRole('region', { name: 'Rest preview', exact: true })
    .getByText(label, { exact: true })
    .locator('..')
    .locator('dd');
const warning = (page: Page) =>
  page.getByRole('dialog', { name: 'Check this action', exact: true });
const clockDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Advance game time', exact: true });

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

/** One import establishes the end of TEST_CHARACTER §6 step 8; all later changes use real controls. */
function afterStepEight(): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = 'm6-linked-acceptance';
  file.live.characterId = file.build.id;
  file.live.hp = 13;
  file.live.slotsUsed = [0, 2, 1, 0, 0, 0, 0, 0, 0, 0];
  file.live.featureUsesSpent = { [INSPIRATION]: 1 };
  file.live.clock.seconds = 8 * 3600 + 12;
  file.live.combat = {
    round: 3,
    turnActive: true,
    economy: {
      actionUsed: true,
      bonusUsed: true,
      reactionUsed: false,
      movementUsed: 0,
      objectInteractionUsed: false,
      bonusActionSpellCast: true,
      otherSpellCast: true,
    },
  };
  // Invisibility was cast on an ally in round 2, so it never creates an effect on The Fool.
  file.live.concentration = {
    spellId: 'spell.invisibility',
    slotLevel: 2,
    endsAt: 9 * 3600 + 6,
  };
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
}

async function expectShared(page: Page, state: SavedCharacter) {
  const { live } = state;
  const l1 = 4 - live.slotsUsed[1]!;
  const l2 = 2 - live.slotsUsed[2]!;
  const inspiration = 5 - (live.featureUsesSpent[INSPIRATION] ?? 0);
  for (const suffix of ['', '/spells', '/combat', '/explore', '/sheet']) {
    await page.goto(`/characters/${state.build.id}${suffix}`);
    await saved(page);
    await expect(
      hud(page).getByRole('button', { name: 'Adjust hit points', exact: true }),
    ).toHaveText(new RegExp(`HP\\s*${live.hp}\\s*/\\s*19`));
    for (const [name, left, max] of [
      ['L1', l1, 4],
      ['L2', l2, 2],
      ['BI', inspiration, 5],
    ] as const)
      await expect(
        hud(page).getByRole('img', { name: `${name}: ${left} of ${max} left`, exact: true }),
      ).toBeVisible();
    if (live.concentration) await expect(hud(page)).toContainText('Invisibility');
    else await expect(hud(page)).not.toContainText('Invisibility');
    if (suffix === '') {
      const resources = main(page).getByRole('region', { name: 'Resources', exact: true });
      for (const [name, left, max] of [
        ['Level 1 spell slots', l1, 4],
        ['Level 2 spell slots', l2, 2],
        ['Bardic Inspiration', inspiration, 5],
        ['d8 Hit Dice', 3 - (live.hitDiceSpent.d8 ?? 0), 3],
      ] as const)
        await expect(
          resources.getByRole('img', { name: `${name}: ${left} of ${max} left`, exact: true }),
        ).toBeVisible();
      await expect(
        main(page).getByRole('region', { name: 'Concentration', exact: true }),
      ).toContainText(live.concentration ? 'Invisibility' : 'None');
      await expect(
        main(page).getByRole('region', { name: 'Effects on you', exact: true }),
      ).toContainText('None');
    }
    if (suffix === '/spells')
      await expect(
        main(page).getByRole('img', { name: `Level 1 spell slots: ${l1} of 4 left`, exact: true }),
      ).toBeVisible();
    await noOverflow(page);
    expect(await readSaved(page, state.build.id)).toEqual(state);
  }
  await page.goto(`/characters/${state.build.id}`);
  await saved(page);
}

async function openRest(page: Page, kind: 'Short' | 'Long') {
  if (page.viewportSize()!.width < 640) {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'More', exact: true })
      .getByRole('button', { name: `${kind} Rest`, exact: true })
      .click();
  } else
    await page
      .getByRole('button', { name: `${kind} Rest`, exact: true })
      .filter({ visible: true })
      .click();
  await expect(rest(page, kind)).toBeVisible();
}

async function addDie(page: Page, index: number, roll: number) {
  await rest(page, 'Short').getByRole('button', { name: 'Add Hit Die', exact: true }).click();
  await rest(page, 'Short').getByLabel(`d8 roll ${index}`, { exact: true }).fill(String(roll));
}

async function applyRest(page: Page, kind: 'Short' | 'Long') {
  await rest(page, kind)
    .getByRole('button', { name: `Apply ${kind} Rest`, exact: true })
    .click();
  await expect(rest(page, kind)).toBeHidden();
  await expect(warning(page)).toHaveCount(0);
  await saved(page);
}

async function openClock(page: Page) {
  await page
    .getByRole('region', { name: 'Game clock', exact: true })
    .getByRole('button', { name: 'Advance time', exact: true })
    .click();
  await expect(clockDialog(page)).toBeVisible();
}

async function undo(page: Page) {
  await page
    .getByRole('region', { name: 'Character log', exact: true })
    .getByRole('button', { name: 'Undo last command', exact: true })
    .click();
  await saved(page);
}

test('M6 acceptance steps 9–14 remain linked through clock controls, both rests, reload, exact Undo and manual corrections', async ({
  page,
  isMobile,
}, info) => {
  test.setTimeout(90_000);
  const file = afterStepEight();
  const id = file.build.id;
  await importCharacter(page, file);
  const initial = await readSaved(page, id);
  await expectShared(page, initial);

  // 9. End combat, advance an hour without resting, then spend one Hit Die and Song of Rest.
  await page.goto(`/characters/${id}/combat`);
  await saved(page);
  await main(page).getByRole('button', { name: 'End combat', exact: true }).click();
  await saved(page);
  const ended = await readSaved(page, id);
  const withoutCombat = { ...initial.live, clock: { seconds: 8 * 3600 + 18 } };
  delete withoutCombat.combat;
  expect(ended.live).toEqual(withoutCombat);
  expect(ended.events.at(-1)?.command).toBe('endCombat');
  await expectShared(page, ended);
  await openClock(page);
  await clockDialog(page).getByRole('button', { name: '+1 h', exact: true }).click();
  await expect(clockDialog(page)).toBeHidden();
  await saved(page);
  const expired = await readSaved(page, id);
  const withoutConcentration = { ...ended.live, clock: { seconds: 9 * 3600 + 18 } };
  delete withoutConcentration.concentration;
  expect(expired.live).toEqual(withoutConcentration);
  expect(expired.events.at(-1)).toMatchObject({
    command: 'advanceTime',
    gameSeconds: ended.live.clock.seconds,
  });
  expect(expired.events.at(-1)?.text).toContain('Invisibility ended');
  await expect(page.getByRole('region', { name: 'Character log', exact: true })).toContainText(
    'Invisibility ended',
  );
  await expectShared(page, expired);
  await openRest(page, 'Short');
  await addDie(page, 1, 2);
  await rest(page, 'Short')
    .getByRole('checkbox', { name: 'Add Song of Rest', exact: true })
    .check();
  await rest(page, 'Short').getByLabel('Song of Rest roll', { exact: true }).fill('2');
  await expect(change(page, 'Short', 'HP')).toHaveText('13 / 19 → 18 / 19');
  await expect(change(page, 'Short', 'd8 Hit Dice')).toHaveText('3 / 3 → 2 / 3');
  await expect(change(page, 'Short', 'Level 1 slots')).toHaveText('2 / 4 → 2 / 4');
  await expect(change(page, 'Short', 'Level 2 slots')).toHaveText('1 / 2 → 1 / 2');
  await expect(change(page, 'Short', 'Bardic Inspiration')).toHaveText('4 / 5 → 4 / 5');
  expect(await readSaved(page, id)).toEqual(expired);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`m6-step9-preview-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  await applyRest(page, 'Short');
  const short = await readSaved(page, id);
  expect(short.live).toEqual({
    ...expired.live,
    hp: 18,
    hitDiceSpent: { d8: 1 },
    clock: { seconds: 10 * 3600 + 18 },
  });
  await expectShared(page, short);

  // 10. The complete preview is read-only; applying restores every depleted long-rest resource.
  await openRest(page, 'Long');
  for (const [label, expected] of [
    ['HP', '18 / 19 → 19 / 19'],
    ['Level 1 slots', '2 / 4 → 4 / 4'],
    ['Level 2 slots', '1 / 2 → 2 / 2'],
    ['Bardic Inspiration', '4 / 5 → 5 / 5'],
    ['d8 Hit Dice', '2 / 3 → 3 / 3'],
    ['Game clock', 'Day 1, 10:00 → Day 1, 18:00'],
  ])
    await expect(change(page, 'Long', label!)).toHaveText(expected!);
  expect(await readSaved(page, id)).toEqual(short);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`m6-step10-preview-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  await applyRest(page, 'Long');
  const firstLong = await readSaved(page, id);
  expect(firstLong.live).toEqual({
    ...short.live,
    hp: 19,
    slotsUsed: Array<number>(10).fill(0),
    featureUsesSpent: {},
    hitDiceSpent: {},
    clock: { seconds: 18 * 3600 + 18 },
    lastLongRestEnd: 18 * 3600 + 18,
  });
  await expectShared(page, firstLong);

  // 11. An immediate second rest warns; cancelling both dialogs has no side effects.
  await openRest(page, 'Long');
  await rest(page, 'Long').getByRole('button', { name: 'Apply Long Rest', exact: true }).click();
  await expect(warning(page)).toContainText('Less than 24 h since last long rest');
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(rest(page, 'Long')).toBeVisible();
  await rest(page, 'Long').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await readSaved(page, id)).toEqual(firstLong);
  await expectShared(page, firstLong);

  // 12. Spend all three dice after 15 damage; advance to 24 h after the previous rest through custom time.
  await hud(page).getByRole('button', { name: 'Adjust hit points', exact: true }).click();
  const hp = page.getByRole('dialog', { name: 'Hit points', exact: true });
  await hp.getByRole('tab', { name: 'Damage', exact: true }).click();
  for (const digit of ['1', '5'])
    await hp.getByRole('button', { name: digit, exact: true }).click();
  await hp.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(hp).toBeHidden();
  await saved(page);
  expect((await readSaved(page, id)).live).toEqual({ ...firstLong.live, hp: 4 });
  await openRest(page, 'Short');
  for (let index = 1; index <= 3; index++) await addDie(page, index, 1);
  await expect(change(page, 'Short', 'HP')).toHaveText('4 / 19 → 10 / 19');
  await expect(change(page, 'Short', 'd8 Hit Dice')).toHaveText('3 / 3 → 0 / 3');
  await applyRest(page, 'Short');
  const spent = await readSaved(page, id);
  expect(spent.live).toEqual({
    ...firstLong.live,
    hp: 10,
    hitDiceSpent: { d8: 3 },
    clock: { seconds: 19 * 3600 + 18 },
  });
  await openClock(page);
  await clockDialog(page).getByLabel('Hours', { exact: true }).fill('23');
  await expect(
    clockDialog(page).getByRole('region', { name: 'Time preview', exact: true }),
  ).toContainText('Day 2, 18:00');
  expect(await readSaved(page, id)).toEqual(spent);
  await clockDialog(page).getByRole('button', { name: 'Advance time', exact: true }).click();
  await expect(clockDialog(page)).toBeHidden();
  await saved(page);
  const beforeLastRest = await readSaved(page, id);
  expect(beforeLastRest.live).toEqual({ ...spent.live, clock: { seconds: 42 * 3600 + 18 } });
  expect(beforeLastRest.live.clock.seconds - beforeLastRest.live.lastLongRestEnd!).toBe(24 * 3600);
  await openRest(page, 'Long');
  await expect(change(page, 'Long', 'd8 Hit Dice')).toHaveText('0 / 3 → 1 / 3');
  await applyRest(page, 'Long');
  const capped = await readSaved(page, id);
  expect(capped.live).toEqual({
    ...beforeLastRest.live,
    hp: 19,
    hitDiceSpent: { d8: 2 },
    clock: { seconds: 50 * 3600 + 18 },
    lastLongRestEnd: 50 * 3600 + 18,
  });
  expect(capped.events.at(-1)?.text).toContain('1 Hit Die back');
  await page.reload();
  await saved(page);
  expect(await readSaved(page, id)).toEqual(capped);
  await expectShared(page, capped);
  await page.screenshot({
    path: info.outputPath(`m6-step12-capped-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
    fullPage: true,
  });

  // 13. Undo after that reload restores the complete pre-rest build and live state.
  await undo(page);
  const undoneRest = await readSaved(page, id);
  expect(undoneRest.build).toEqual(beforeLastRest.build);
  expect(undoneRest.live).toEqual(beforeLastRest.live);
  expect(undoneRest.events.at(-2)?.undoneBy).toBe(undoneRest.events.at(-1)?.id);
  await expectShared(page, undoneRest);
  await page.reload();
  await saved(page);
  expect(await readSaved(page, id)).toEqual(undoneRest);

  // 14. Each minus press is one logged correction; Undo restores each exact previous state.
  const useSlot = main(page)
    .getByRole('region', { name: 'Resources', exact: true })
    .getByRole('button', { name: 'Use one: Level 1 spell slots', exact: true });
  await useSlot.click();
  await saved(page);
  const oneUsed = await readSaved(page, id);
  await useSlot.click();
  await saved(page);
  const corrected = await readSaved(page, id);
  expect(corrected.build).toEqual(undoneRest.build);
  expect(corrected.live).toEqual({
    ...undoneRest.live,
    slotsUsed: undoneRest.live.slotsUsed.map((used, level) => (level === 1 ? 2 : used)),
  });
  expect(corrected.events.slice(-2).map(({ command }) => command)).toEqual([
    'adjustSlot',
    'adjustSlot',
  ]);
  expect(corrected.events.at(-1)?.text).toBe('L1 slots: 2/4 left');
  await expect(page.getByRole('region', { name: 'Character log', exact: true })).toContainText(
    'L1 slots: 2/4 left',
  );
  await expectShared(page, corrected);
  await undo(page);
  expect((await readSaved(page, id)).live).toEqual(oneUsed.live);
  await undo(page);
  const restored = await readSaved(page, id);
  expect(restored.build).toEqual(undoneRest.build);
  expect(restored.live).toEqual(undoneRest.live);
  expect(restored.events.map(({ command }) => command)).toEqual([
    'endCombat',
    'advanceTime',
    'completeShortRest',
    'completeLongRest',
    'applyDamage',
    'completeShortRest',
    'advanceTime',
    'completeLongRest',
    'undo',
    'adjustSlot',
    'adjustSlot',
    'undo',
    'undo',
  ]);
  expect(restored.events.every(({ override }) => !override)).toBe(true);
  await page.reload();
  await saved(page);
  expect(await readSaved(page, id)).toEqual(restored);
  await expectShared(page, restored);
});
