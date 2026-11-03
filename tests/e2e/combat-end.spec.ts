import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import {
  ExportFileSchema,
  type ExportFile,
  type LiveState,
  type LogEvent,
} from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

const control = (page: Page, name: string) =>
  page.getByRole('main').getByRole('button', { name, exact: true });
const status = (page: Page) => page.getByRole('status', { name: 'Combat status', exact: true });
const effects = (page: Page) =>
  page.getByRole('main').getByRole('region', { name: 'Effects on you', exact: true });
const concentration = (page: Page) =>
  page.getByRole('main').getByRole('region', { name: 'Concentration', exact: true });
const log = (page: Page) => page.getByRole('region', { name: 'Combat log', exact: true });

async function saved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

async function readSaved(page: Page, id: string): Promise<{ live: LiveState; events: LogEvent[] }> {
  return page.evaluate(async (characterId) => {
    const value = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await value(indexedDB.open('omnidnd'));
    try {
      const transaction = db.transaction(['live', 'events'], 'readonly');
      const [live, events] = await Promise.all([
        value(transaction.objectStore('live').get(characterId)) as Promise<{ data: LiveState }>,
        value(transaction.objectStore('events').getAll()) as Promise<
          { characterId: string; order: number; data: LogEvent }[]
        >,
      ]);
      return {
        live: live.data,
        events: events
          .filter((event) => event.characterId === characterId)
          .sort((a, b) => a.order - b.order)
          .map(({ data }) => data),
      };
    } finally {
      db.close();
    }
  }, id);
}

function combatFile(id: string): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = id;
  file.build.name = 'End combat check';
  file.live.characterId = id;
  file.live.hp = 14;
  file.live.tempHp = 3;
  file.live.conditions = ['prone'];
  file.live.combat = {
    round: 2,
    turnActive: true,
    economy: {
      actionUsed: true,
      bonusUsed: true,
      reactionUsed: true,
      movementUsed: 15,
      dashCount: 1,
      objectInteractionUsed: true,
      bonusActionSpellCast: true,
      otherSpellCast: false,
    },
  };
  const now = file.live.clock.seconds;
  file.live.concentration = {
    spellId: 'spell.invisibility',
    slotLevel: 2,
    endsAt: now + 120,
    effectId: 'effect.self',
    pendingSaves: [{ id: 'previous-damage', dc: 10 }],
  };
  file.live.effects = [
    {
      id: 'effect.self',
      name: 'Invisibility',
      sourceId: 'spell.invisibility',
      endsAt: now + 120,
      concentration: true,
      conditions: ['invisible'],
      modifiers: [],
    },
    {
      id: 'effect.due',
      name: 'Due ward',
      endsAt: now + 6,
      concentration: false,
      conditions: [],
      modifiers: [],
    },
    {
      id: 'effect.later',
      name: 'Surviving ward',
      endsAt: now + 7,
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

async function expectEnded(page: Page) {
  await expect(status(page)).toContainText('No active combat');
  await expect(status(page)).toBeFocused();
  await expect(control(page, 'Start combat')).toBeVisible();
  await expect(control(page, 'End combat')).toHaveCount(0);
  await expect(control(page, 'Start Turn')).toHaveCount(0);
  await expect(control(page, 'End Turn')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Turn economy', exact: true })).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBe(0);
  await saved(page);
}

async function reloadUndo(page: Page, id: string, before: LiveState) {
  await page.reload();
  await saved(page);
  await expect(status(page)).toContainText('No active combat');
  await log(page).getByRole('button', { name: 'Undo last combat command', exact: true }).click();
  await saved(page);
  expect((await readSaved(page, id)).live).toEqual(before);
  await page.reload();
  await saved(page);
  expect((await readSaved(page, id)).live).toEqual(before);
  await expect(control(page, 'End combat')).toBeVisible();
}

test('ending before the first turn accounts for one round and restores the exact started fight', async ({
  page,
  isMobile,
}) => {
  await page.goto('/characters/the-fool/combat');
  await saved(page);
  await expect(control(page, 'End combat')).toHaveCount(0);
  await control(page, 'Start combat').click();
  await saved(page);
  const before = await readSaved(page, 'the-fool');
  await expect(status(page)).toContainText('Before your first turn');
  const bounds = await control(page, 'End combat').boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({
    path: test.info().outputPath(`combat-end-controls-${isMobile ? 375 : 1440}.png`),
  });
  await control(page, 'End combat').focus();
  await page.keyboard.press('Enter');
  await expectEnded(page);
  const after = await readSaved(page, 'the-fool');
  const expected = { ...before.live, clock: { seconds: before.live.clock.seconds + 6 } };
  delete expected.combat;
  expect(after.live).toEqual(expected);
  expect(after.events).toHaveLength(before.events.length + 1);
  expect(after.events.at(-1)).toMatchObject({
    command: 'endCombat',
    text: 'Combat ended after 1 round (6 s)',
  });
  await reloadUndo(page, 'the-fool', before.live);
});

for (const active of [true, false]) {
  test(`ending a saved ${active ? 'active' : 'waiting'} turn settles 6 seconds and preserves surviving effects and checks`, async ({
    page,
    isMobile,
  }) => {
    const file = combatFile(`end-combat-${active ? 'active' : 'waiting'}`);
    file.live.combat!.turnActive = active;
    if (!active) delete file.live.combat!.economy.dashCount;
    await importCharacter(page, file);
    const before = await readSaved(page, file.build.id);
    await expect(concentration(page)).toContainText('20 rounds left');
    await control(page, 'End combat').click();
    await expectEnded(page);
    await expect(concentration(page)).toContainText('1 min 54 s left');
    await expect(effects(page)).toContainText('1 s left');
    await expect(effects(page)).toContainText('Until removed');
    await expect(effects(page)).not.toContainText('Due ward');
    const after = await readSaved(page, file.build.id);
    const expected = {
      ...before.live,
      clock: { seconds: before.live.clock.seconds + 6 },
      effects: before.live.effects.filter((effect) => effect.id !== 'effect.due'),
    };
    delete expected.combat;
    expect(after.live).toEqual(expected);
    expect(after.events).toHaveLength(1);
    expect(after.events[0]).toMatchObject({
      command: 'endCombat',
      text: 'Combat ended after 2 rounds (12 s); Due ward ended',
    });
    await page.screenshot({
      path: test.info().outputPath(`combat-ended-${isMobile ? 375 : 1440}.png`),
      fullPage: true,
    });
    await reloadUndo(page, file.build.id, before.live);
  });
}

test('the final round expires due concentration and its dependent effects with durable exact Undo', async ({
  page,
}) => {
  const file = combatFile('end-combat-expiry');
  file.live.concentration!.endsAt = file.live.clock.seconds + 6;
  await importCharacter(page, file);
  const before = await readSaved(page, file.build.id);
  await expect(concentration(page)).toContainText('1 round left');
  await control(page, 'End combat').click();
  await expectEnded(page);
  await expect(concentration(page)).toContainText('None');
  await expect(effects(page)).not.toContainText('Invisibility');
  await expect(page.getByRole('region', { name: 'Concentration saves', exact: true })).toHaveCount(
    0,
  );
  const after = await readSaved(page, file.build.id);
  expect(after.live.concentration).toBeUndefined();
  expect(after.live.effects.map((effect) => effect.id)).toEqual(['effect.later', 'effect.untimed']);
  expect(after.events.at(-1)?.text).toBe(
    'Combat ended after 2 rounds (12 s); Invisibility ended; Due ward ended',
  );
  await reloadUndo(page, file.build.id, before.live);
  await expect(
    page.getByRole('region', { name: 'Concentration saves', exact: true }),
  ).toBeVisible();
});

test('ending combat remains available for a dead character as bookkeeping', async ({ page }) => {
  const file = combatFile('end-combat-dead');
  file.live.hp = 0;
  file.live.deathSaves = { success: 0, fail: 3 };
  file.live.conditions = ['unconscious'];
  file.live.effects = [];
  delete file.live.concentration;
  await importCharacter(page, file);
  const before = await readSaved(page, file.build.id);
  await expect(control(page, 'End combat')).toBeEnabled();
  await control(page, 'End combat').click();
  await expectEnded(page);
  const after = await readSaved(page, file.build.id);
  expect(after.live).toMatchObject({
    hp: 0,
    deathSaves: { success: 0, fail: 3 },
    conditions: ['unconscious'],
  });
  expect(after.live.combat).toBeUndefined();
  await reloadUndo(page, file.build.id, before.live);
});

test('two real turns account for 12 seconds in total without double counting', async ({ page }) => {
  await page.goto('/characters/the-fool/combat');
  await saved(page);
  const before = await readSaved(page, 'the-fool');
  await control(page, 'Start combat').click();
  await control(page, 'Start Turn').click();
  await control(page, 'End Turn').click();
  await control(page, 'Start Turn').click();
  await saved(page);
  const during = await readSaved(page, 'the-fool');
  expect(during.live.clock.seconds).toBe(before.live.clock.seconds + 6);
  await control(page, 'End combat').click();
  await expectEnded(page);
  const after = await readSaved(page, 'the-fool');
  expect(after.live.clock.seconds).toBe(before.live.clock.seconds + 12);
  expect(after.events.filter((event) => event.command === 'endCombat')).toHaveLength(1);
  expect(after.events.at(-1)?.text).toBe('Combat ended after 2 rounds (12 s)');
  await reloadUndo(page, 'the-fool', during.live);
});
