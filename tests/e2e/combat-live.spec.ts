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

const turn = (page: Page) => page.getByRole('status', { name: 'Combat status', exact: true });
const start = (page: Page) =>
  page.getByRole('main').getByRole('button', { name: 'Start combat', exact: true });

async function expectSaved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

async function expectNoOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
}

async function readSavedCharacter(page: Page, characterId = 'the-fool'): Promise<SavedCharacter> {
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

async function importCharacter(page: Page, file: ExportFile) {
  await page.goto('/');
  await expectSaved(page);
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: `${file.build.id}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(ExportFileSchema.parse(file))),
  });
  await page
    .getByRole('dialog', { name: 'Import character', exact: true })
    .getByRole('button', { name: 'Add character', exact: true })
    .click();
  await expectSaved(page);
  await page.goto(`/characters/${file.build.id}/combat`);
  await expectSaved(page);
}

test('Start combat is logged once, preserves play resources, and supports reload and Undo', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/characters/the-fool/combat');
  await expectSaved(page);
  const initial = await readSavedCharacter(page);
  await expect(turn(page)).toContainText('No active combat');
  await expect(turn(page)).toContainText('Initiative +3');
  await expect(turn(page).getByText(/^Round /)).toHaveCount(0);
  await expect(page.getByText('Turn order', { exact: true })).toHaveCount(0);
  await expect(turn(page).getByRole('spinbutton')).toHaveCount(0);
  const bounds = await start(page).boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  await start(page).focus();
  await page.keyboard.press('Enter');
  await expect(turn(page)).toContainText('Round 1');
  await expect(turn(page)).toContainText('Before your first turn');
  await expect(start(page)).toHaveCount(0);
  await expect
    .poll(() => turn(page).evaluate((element) => element.contains(document.activeElement)))
    .toBe(true);
  await expectSaved(page);
  const started = await readSavedCharacter(page);
  expect(started.build).toEqual(initial.build);
  expect(started.live).toEqual({
    ...initial.live,
    combat: {
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
    },
  });
  expect(started.events.map((event) => event.command)).toEqual(['startCombat']);
  expect(started.events[0]?.override).toBeUndefined();
  await expectNoOverflow(page);
  await page.screenshot({
    path: info.outputPath(`combat-started-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });
  await page.getByRole('link', { name: 'Spells', exact: true }).click();
  await expect(
    page.getByRole('main').getByRole('heading', { name: 'Spells', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Combat', exact: true }).click();
  await expect(turn(page)).toContainText('Before your first turn');
  expect(await readSavedCharacter(page)).toEqual(started);
  await page.reload();
  await expectSaved(page);
  await expect(turn(page)).toContainText('Round 1');
  await expect(turn(page)).toContainText('Before your first turn');
  expect(await readSavedCharacter(page)).toEqual(started);
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await expectSaved(page);
  await expect(turn(page)).toContainText('No active combat');
  await expect(start(page)).toBeVisible();
  const undone = await readSavedCharacter(page);
  expect(undone.build).toEqual(initial.build);
  expect(undone.live).toEqual(initial.live);
  expect(undone.events.map((event) => event.command)).toEqual(['startCombat', 'undo']);
  expect(undone.events[0]?.undoneBy).toBe(undone.events[1]?.id);
  await page.reload();
  await expectSaved(page);
  await expect(turn(page)).toContainText('No active combat');
  expect(await readSavedCharacter(page)).toEqual(undone);
});

for (const turnActive of [false, true]) {
  test(`imported round seven reads ${turnActive ? 'active' : 'waiting'} turn and actual initiative`, async ({
    page,
  }) => {
    const file = ExportFileSchema.parse(seed);
    file.build.id = `combat-round-seven-${turnActive ? 'active' : 'waiting'}`;
    file.build.name = file.build.id;
    file.build.abilityScores.base.DEX = 18;
    file.live.characterId = file.build.id;
    file.events = [];
    file.live.combat = {
      round: 7,
      turnActive,
      economy: {
        actionUsed: true,
        bonusUsed: false,
        reactionUsed: true,
        movementUsed: 20,
        objectInteractionUsed: true,
        bonusActionSpellCast: true,
        otherSpellCast: false,
      },
    };
    await importCharacter(page, file);
    const initial = await readSavedCharacter(page, file.build.id);
    await expect(turn(page)).toContainText('Round 7');
    await expect(turn(page)).toContainText(turnActive ? 'Your turn' : 'Waiting for your turn');
    await expect(turn(page)).toContainText('Initiative +5');
    await expect(turn(page)).not.toContainText('Before your first turn');
    await expect(start(page)).toHaveCount(0);
    await expectNoOverflow(page);
    await page.reload();
    await expectSaved(page);
    await expect(turn(page)).toContainText('Round 7');
    await expect(turn(page)).toContainText(turnActive ? 'Your turn' : 'Waiting for your turn');
    expect(await readSavedCharacter(page, file.build.id)).toEqual(initial);
    expect(initial.events).toEqual([]);
  });
}
