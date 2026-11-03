import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import {
  ExportFileSchema,
  type CharacterBuild,
  type Economy,
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

const status = (page: Page) => page.getByRole('status', { name: 'Combat status', exact: true });
const economy = (page: Page) => page.getByRole('region', { name: 'Turn economy', exact: true });
const mainButton = (page: Page, name: string) =>
  page.getByRole('main').getByRole('button', { name, exact: true });
const economyButton = (page: Page, name: string) =>
  economy(page).getByRole('button', { name, exact: true });
const warning = (page: Page) =>
  page.getByRole('dialog', { name: 'Check this action', exact: true });
const freshEconomy = (): Economy => ({
  actionUsed: false,
  bonusUsed: false,
  reactionUsed: false,
  movementUsed: 0,
  objectInteractionUsed: false,
  bonusActionSpellCast: false,
  otherSpellCast: false,
});

async function expectSaved(page: Page) {
  await expect(page.locator('[role="status"][aria-label="Local save status"]')).toContainText(
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

function combatFile(id: string, turnActive = true): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = id;
  file.build.name = id;
  file.live.characterId = id;
  file.events = [];
  file.live.combat = { round: 3, turnActive, economy: freshEconomy() };
  return file;
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

test('first turn starts at round one without clock advancement and keeps keyboard focus', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/characters/the-fool/combat');
  await expectSaved(page);
  await expect(economy(page)).toHaveCount(0);
  await mainButton(page, 'Start combat').click();
  await expectSaved(page);
  const initial = await readSavedCharacter(page);
  await expect(status(page)).toContainText('Before your first turn');
  const start = mainButton(page, 'Start Turn');
  const bounds = await start.boundingBox();
  expect(bounds?.height).toBeGreaterThanOrEqual(isMobile ? 56 : 44);
  await start.focus();
  await page.keyboard.press('Enter');
  await expect(mainButton(page, 'End Turn')).toBeFocused();
  await expect(status(page)).toContainText('Round 1');
  await expect(status(page)).toContainText('Your turn');
  for (const name of ['Action available', 'Bonus available', 'React available']) {
    await expect(economyButton(page, name)).toHaveAttribute('aria-pressed', 'false');
  }
  await expect(economy(page)).toContainText('Move 30 / 30 ft left');
  await expectSaved(page);
  const started = await readSavedCharacter(page);
  expect(started.build).toEqual(initial.build);
  expect(started.live).toEqual({
    ...initial.live,
    combat: { round: 1, turnActive: true, economy: freshEconomy() },
  });
  expect(started.events.map((event) => event.command)).toEqual(['startCombat', 'startTurn']);
  await expectNoOverflow(page);
  await page.screenshot({
    path: info.outputPath(`combat-economy-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });
});

test('End Turn retains spent resources; the next turn clears all flags and advances six seconds', async ({
  page,
}) => {
  const file = combatFile('economy-turn-reset');
  file.live.combat!.economy = {
    actionUsed: true,
    bonusUsed: true,
    reactionUsed: true,
    movementUsed: 25,
    objectInteractionUsed: true,
    bonusActionSpellCast: true,
    otherSpellCast: true,
  };
  await importCharacter(page, file);
  const initial = await readSavedCharacter(page, file.build.id);
  await mainButton(page, 'End Turn').focus();
  await page.keyboard.press('Space');
  await expect(mainButton(page, 'Start Turn')).toBeFocused();
  await expect(status(page)).toContainText('Waiting for your turn');
  for (const name of ['Action used', 'Bonus used', 'React used']) {
    await expect(economyButton(page, name)).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(economy(page)).toContainText('Move 5 / 30 ft left');
  await expectSaved(page);
  const ended = await readSavedCharacter(page, file.build.id);
  expect(ended.build).toEqual(initial.build);
  expect(ended.live).toEqual({
    ...initial.live,
    combat: {
      ...initial.live.combat!,
      turnActive: false,
      economy: {
        ...initial.live.combat!.economy,
        bonusActionSpellCast: false,
        otherSpellCast: false,
      },
    },
  });
  await mainButton(page, 'Start Turn').click();
  await expect(status(page)).toContainText('Round 4');
  await expect(status(page)).toContainText('Your turn');
  await expect(economy(page)).toContainText('Move 30 / 30 ft left');
  await expectSaved(page);
  const restarted = await readSavedCharacter(page, file.build.id);
  expect(restarted.build).toEqual(initial.build);
  expect(restarted.live).toEqual({
    ...initial.live,
    clock: { seconds: initial.live.clock.seconds + 6 },
    combat: { round: 4, turnActive: true, economy: freshEconomy() },
  });
  expect(restarted.events.map((event) => event.command)).toEqual(['endTurn', 'startTurn']);
  await page.reload();
  await expectSaved(page);
  expect(await readSavedCharacter(page, file.build.id)).toEqual(restarted);
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await expectSaved(page);
  const undone = await readSavedCharacter(page, file.build.id);
  expect(undone.build).toEqual(initial.build);
  expect(undone.live).toEqual(ended.live);
  await expect(status(page)).toContainText('Round 3');
  await expect(status(page)).toContainText('Waiting for your turn');
  await expect(economyButton(page, 'React used')).toHaveAttribute('aria-pressed', 'true');
});

test('manual economy toggles and movement save separately and preserve unrelated resources', async ({
  page,
}) => {
  const file = combatFile('economy-manual');
  await importCharacter(page, file);
  const initial = await readSavedCharacter(page, file.build.id);
  await economyButton(page, 'Action available').focus();
  await page.keyboard.press('Space');
  await expect(economyButton(page, 'Action used')).toBeFocused();
  await economyButton(page, 'Bonus available').click();
  await economyButton(page, 'React available').click();
  await economyButton(page, 'Use 5 ft of movement').click();
  await expect(economy(page)).toContainText('Move 25 / 30 ft left');
  await expectSaved(page);
  const spent = await readSavedCharacter(page, file.build.id);
  expect(spent.live).toEqual({
    ...initial.live,
    combat: {
      ...initial.live.combat!,
      economy: {
        ...freshEconomy(),
        actionUsed: true,
        bonusUsed: true,
        reactionUsed: true,
        movementUsed: 5,
      },
    },
  });
  for (const name of ['Action used', 'Bonus used', 'React used']) {
    await economyButton(page, name).click();
  }
  await economyButton(page, 'Give back 5 ft of movement').click();
  await expectSaved(page);
  const restored = await readSavedCharacter(page, file.build.id);
  expect(restored.build).toEqual(initial.build);
  expect(restored.live).toEqual(initial.live);
  expect(restored.events).toHaveLength(8);
  expect(restored.events.every((event) => event.command === 'useEconomy' && !event.override)).toBe(
    true,
  );
  await page.reload();
  await expectSaved(page);
  expect(await readSavedCharacter(page, file.build.id)).toEqual(restored);
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await expectSaved(page);
  const undone = await readSavedCharacter(page, file.build.id);
  expect(undone.live.combat?.economy).toEqual({ ...freshEconomy(), movementUsed: 5 });
  expect(undone.build).toEqual(initial.build);
  await expect(economy(page)).toContainText('Move 25 / 30 ft left');
});

test('off-turn reactions work; actions and movement require explicit warning overrides', async ({
  page,
  isMobile,
}) => {
  const file = combatFile('economy-off-turn', false);
  await importCharacter(page, file);
  const initial = await readSavedCharacter(page, file.build.id);
  await economyButton(page, 'React available').click();
  await expect(warning(page)).toHaveCount(0);
  await expectSaved(page);
  const reaction = await readSavedCharacter(page, file.build.id);
  expect(reaction.events).toHaveLength(1);
  expect(reaction.events[0]?.override).toBeUndefined();
  const activate = async (name: string) => {
    const button = economyButton(page, name);
    if (isMobile) await button.tap();
    else await button.click();
  };
  await activate('Action available');
  await expect(warning(page)).toContainText('Not your turn');
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(economyButton(page, 'Action available')).toBeFocused();
  expect(await readSavedCharacter(page, file.build.id)).toEqual(reaction);
  await activate('Action available');
  await warning(page).getByRole('button', { name: 'Do anyway', exact: true }).click();
  await expectSaved(page);
  const action = await readSavedCharacter(page, file.build.id);
  expect(action.events.at(-1)?.override).toBe(true);
  await activate('Use 5 ft of movement');
  await expect(warning(page)).toContainText('Not your turn');
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(economyButton(page, 'Use 5 ft of movement')).toBeFocused();
  expect(await readSavedCharacter(page, file.build.id)).toEqual(action);
  await activate('Use 5 ft of movement');
  await warning(page).getByRole('button', { name: 'Do anyway', exact: true }).click();
  await expectSaved(page);
  const moved = await readSavedCharacter(page, file.build.id);
  expect(moved.build).toEqual(initial.build);
  expect(moved.live).toEqual({
    ...initial.live,
    combat: {
      ...initial.live.combat!,
      economy: { ...freshEconomy(), actionUsed: true, reactionUsed: true, movementUsed: 5 },
    },
  });
  expect(moved.events.map((event) => event.command)).toEqual([
    'useEconomy',
    'useEconomy',
    'useEconomy',
  ]);
  expect(moved.events.map((event) => !!event.override)).toEqual([false, true, true]);
});

test('overspeed movement warns without changing state, supports override and exact Undo', async ({
  page,
}) => {
  const file = combatFile('economy-overspeed');
  file.live.combat!.economy.movementUsed = 30;
  await importCharacter(page, file);
  const initial = await readSavedCharacter(page, file.build.id);
  await expect(economy(page)).toContainText('Move 0 / 30 ft left');
  await economyButton(page, 'Use 5 ft of movement').click();
  await expect(warning(page)).toContainText('Only 0 ft of movement left');
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(economyButton(page, 'Use 5 ft of movement')).toBeFocused();
  expect(await readSavedCharacter(page, file.build.id)).toEqual(initial);
  await economyButton(page, 'Use 5 ft of movement').click();
  await warning(page).getByRole('button', { name: 'Do anyway', exact: true }).click();
  await expectSaved(page);
  const overused = await readSavedCharacter(page, file.build.id);
  expect(overused.live.combat?.economy.movementUsed).toBe(35);
  expect(overused.events.at(-1)?.override).toBe(true);
  expect(overused.build).toEqual(initial.build);
  await expect(economy(page)).toContainText('Move 0 / 30 ft left');
  await page.reload();
  await expectSaved(page);
  await expect(economy(page)).toContainText('Move 0 / 30 ft left');
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await expectSaved(page);
  const undone = await readSavedCharacter(page, file.build.id);
  expect(undone.live).toEqual(initial.live);
  await economyButton(page, 'Give back 5 ft of movement').click();
  await expectSaved(page);
  await expect(economy(page)).toContainText('Move 5 / 30 ft left');
  expect((await readSavedCharacter(page, file.build.id)).live.combat?.economy.movementUsed).toBe(
    25,
  );
});

test('movement uses derived reduced speed and clamps imported overuse at zero', async ({
  page,
}) => {
  const file = combatFile('economy-reduced-speed');
  file.live.exhaustion = 2;
  file.live.combat!.economy.movementUsed = 20;
  await importCharacter(page, file);
  await expect(economy(page)).toContainText('Move 0 / 15 ft left');
  await economyButton(page, 'Give back 5 ft of movement').click();
  await expectSaved(page);
  await expect(economy(page)).toContainText('Move 0 / 15 ft left');
  await economyButton(page, 'Give back 5 ft of movement').click();
  await expectSaved(page);
  await expect(economy(page)).toContainText('Move 5 / 15 ft left');
  await economyButton(page, 'Use 5 ft of movement').click();
  await expectSaved(page);
  await expect(warning(page)).toHaveCount(0);
  await expect(economy(page)).toContainText('Move 0 / 15 ft left');
  await expectNoOverflow(page);
  const stopped = combatFile('economy-zero-speed');
  stopped.live.conditions = ['grappled'];
  stopped.live.combat!.economy.movementUsed = 5;
  await importCharacter(page, stopped);
  await expect(economy(page)).toContainText('Move 0 / 0 ft left');
  await economyButton(page, 'Give back 5 ft of movement').click();
  await expectSaved(page);
  await expect(economy(page)).toContainText('Move 0 / 0 ft left');
  const zero = await readSavedCharacter(page, stopped.build.id);
  await economyButton(page, 'Use 5 ft of movement').click();
  await expect(warning(page)).toContainText('Only 0 ft of movement left');
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await readSavedCharacter(page, stopped.build.id)).toEqual(zero);
  await expectNoOverflow(page);
});
