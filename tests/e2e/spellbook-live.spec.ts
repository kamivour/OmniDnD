import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import { ExportFileSchema, type LiveState, type LogEvent } from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

interface SavedGame {
  live: LiveState;
  events: LogEvent[];
}

const main = (page: Page) => page.getByRole('main');
const hud = (page: Page) => page.getByRole('banner', { name: 'Character HUD', exact: true });
const step = (page: Page, direction: 'Use' | 'Restore', level: number) =>
  main(page).getByRole('button', { name: `${direction} one: Level ${level} spell slots` });
const pip = (page: Page, remaining: number) =>
  main(page).getByRole('button', {
    name: `Set Level 1 spell slots to ${remaining} remaining`,
    exact: true,
  });

async function expectSaved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

async function expectSlots(page: Page, level: number, remaining: number, max: number) {
  await expect(
    main(page).getByLabel(`Level ${level} spell slots: ${remaining} of ${max} left`, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    hud(page).getByRole('img', { name: `L${level}: ${remaining} of ${max} left`, exact: true }),
  ).toBeVisible();
}

async function readSavedGame(page: Page, characterId = 'the-fool'): Promise<SavedGame> {
  return page.evaluate(async (id) => {
    const requestValue = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await requestValue(indexedDB.open('omnidnd'));
    try {
      const transaction = db.transaction(['live', 'events'], 'readonly');
      const [row, events] = await Promise.all([
        requestValue(transaction.objectStore('live').get(id)) as Promise<{ data: LiveState }>,
        requestValue(transaction.objectStore('events').getAll()) as Promise<
          { characterId: string; order: number; data: LogEvent }[]
        >,
      ]);
      return {
        live: row.data,
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

test('saved groups and slot controls fit the character workspace', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/characters/the-fool/spells');
  await expectSaved(page);
  await expect(main(page).getByRole('heading', { name: 'Cantrips', exact: true })).toBeVisible();
  await expectSlots(page, 1, 0, 4);
  await expectSlots(page, 2, 2, 2);
  await expect(step(page, 'Use', 1)).toBeDisabled();
  await expect(step(page, 'Restore', 1)).toBeEnabled();
  await expect(step(page, 'Use', 2)).toBeEnabled();
  await expect(step(page, 'Restore', 2)).toBeDisabled();
  await expect(main(page)).toContainText('Save DC 15');
  await expect(main(page)).toContainText('Attack +7');
  await expect(main(page)).toContainText('Cantrips 2 / 2');
  await expect(main(page)).toContainText('Known 6 / 6');
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
  await page.screenshot({
    path: info.outputPath(`spellbook-live-${isMobile ? '375' : '1440'}.png`),
    fullPage: true,
  });
  if (isMobile) {
    await main(page)
      .getByRole('group', { name: 'Level 1 spell slots', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath('spellbook-slots-375.png'),
      animations: 'disabled',
    });
  }
});

test('both slot steppers share HUD values and keep logged Undo after reload', async ({ page }) => {
  await page.goto('/characters/the-fool/spells');
  await expectSaved(page);
  const initial = await readSavedGame(page);

  await step(page, 'Restore', 1).click();
  await expectSlots(page, 1, 1, 4);
  await step(page, 'Use', 1).click();
  await expectSlots(page, 1, 0, 4);
  await step(page, 'Use', 2).click();
  await expectSlots(page, 2, 1, 2);
  await step(page, 'Restore', 2).click();
  await expectSlots(page, 2, 2, 2);
  await expectSaved(page);
  await expect(page.getByRole('status', { name: 'Command feedback' })).toContainText(
    'L2 slots: 2/2 left',
  );
  const adjusted = await readSavedGame(page);
  expect(adjusted.live).toEqual(initial.live);
  expect(adjusted.events.map((event) => event.command)).toEqual([
    'adjustSlot',
    'adjustSlot',
    'adjustSlot',
    'adjustSlot',
  ]);

  await page.reload();
  await expectSaved(page);
  await expectSlots(page, 1, 0, 4);
  await expectSlots(page, 2, 2, 2);
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await expectSlots(page, 2, 1, 2);
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  await expectSlots(page, 2, 1, 2);
  const undone = await readSavedGame(page);
  expect(undone.live).toEqual({ ...initial.live, slotsUsed: [0, 4, 1, 0, 0, 0, 0, 0, 0, 0] });
  expect(undone.events.map((event) => event.command)).toEqual([
    'adjustSlot',
    'adjustSlot',
    'adjustSlot',
    'adjustSlot',
    'undo',
  ]);
  expect(undone.events[3]?.undoneBy).toBe(undone.events[4]?.id);

  await hud(page).getByRole('button', { name: 'Adjust spell slots', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Spell slots', exact: true })
    .getByRole('button', { name: 'Restore one: Level 1 spell slots' })
    .click();
  await page.keyboard.press('Escape');
  await expectSlots(page, 1, 1, 4);
});

test('pips set remaining slots by click or native Space and remain undoable', async ({ page }) => {
  await page.goto('/characters/the-fool/spells');
  await expectSaved(page);
  await pip(page, 1).click();
  await expectSlots(page, 1, 1, 4);
  await expect(pip(page, 0)).toHaveAttribute('aria-pressed', 'true');
  await pip(page, 0).click();
  await expectSlots(page, 1, 0, 4);
  await pip(page, 3).focus();
  await page.keyboard.press('Space');
  await expectSlots(page, 1, 3, 4);
  await expectSaved(page);
  await expect(page.getByRole('status', { name: 'Command feedback' })).toContainText(
    'L1 slots: 3/4 left',
  );
  await page.reload();
  await expectSaved(page);
  await expectSlots(page, 1, 3, 4);
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await expectSlots(page, 1, 0, 4);
  await expectSaved(page);
  const saved = await readSavedGame(page);
  expect(saved.events.map((event) => event.command)).toEqual([
    'adjustSlot',
    'adjustSlot',
    'adjustSlot',
    'undo',
  ]);
  expect(saved.events[2]?.undoneBy).toBe(saved.events[3]?.id);
});

test('a blank bard shows derived stats and slots without inheriting the Fool spells', async ({
  page,
}) => {
  await page.goto('/campaigns/campaign-273/characters/new');
  await expectSaved(page);
  await page.getByLabel('Name', { exact: true }).fill('First Verse');
  await page.getByLabel('Race', { exact: true }).selectOption('race.human');
  await page.getByLabel('Class', { exact: true }).selectOption('class.bard');
  await page.getByLabel('Background', { exact: true }).selectOption('background.charlatan');
  for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
    await page.getByLabel(`${ability} base`, { exact: true }).fill('10');
  }
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/[^/]+$/);
  await expectSaved(page);
  await page.getByRole('link', { name: 'Spells', exact: true }).filter({ visible: true }).click();
  await expect(hud(page)).toContainText('First Verse');
  await expect(main(page)).toContainText('Save DC 10');
  await expect(main(page)).toContainText('Attack +2');
  await expect(main(page)).toContainText('Cantrips 0 / 2');
  await expect(main(page)).toContainText('Known 0 / 4');
  await expect(main(page).getByRole('heading', { name: 'Cantrips', exact: true })).toHaveCount(0);
  await expect(main(page).getByRole('heading', { name: 'Level 1', exact: true })).toBeVisible();
  await expect(main(page).getByRole('heading', { name: 'Level 2', exact: true })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: /^Healing Word/ })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: /^Vicious Mockery/ })).toHaveCount(0);
  await expectSlots(page, 1, 2, 2);
  await step(page, 'Use', 1).click();
  await expectSlots(page, 1, 1, 2);
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  await expectSlots(page, 1, 1, 2);
});

test('a character imported with concentration marks only its live spell Active', async ({
  page,
}) => {
  await page.goto('/');
  await expectSaved(page);
  const file = ExportFileSchema.parse(seed);
  file.build.id = 'concentrating-bard';
  file.build.name = 'Concentrating Bard';
  file.live.characterId = file.build.id;
  file.live.concentration = { spellId: 'spell.suggestion', slotLevel: 2, endsAt: 57600 };
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: 'concentrating-bard.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await page
    .getByRole('dialog', { name: 'Import character', exact: true })
    .getByRole('button', { name: 'Add character', exact: true })
    .click();
  await expectSaved(page);
  await page.goto('/characters/concentrating-bard/spells');
  const suggestion = main(page).getByRole('button', { name: /^Suggestion/ });
  await expect(suggestion).toContainText('Active');
  await expect(main(page).getByRole('button', { name: /^Faerie Fire/ })).not.toContainText(
    'Active',
  );
  await hud(page)
    .getByRole('button', { name: /End concentration.*Suggestion/ })
    .click();
  await expect(suggestion).not.toContainText('Active');
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  await expect(suggestion).not.toContainText('Active');
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await expect(suggestion).toContainText('Active');
});
