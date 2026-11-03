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

const main = (page: Page) => page.getByRole('main');
const row = (page: Page, name: string) =>
  main(page)
    .getByRole('listitem')
    .filter({
      has: page.getByRole('button', { name: new RegExp(`^${name}\\b`) }),
    });
const economy = (page: Page) => page.getByRole('region', { name: 'Turn economy', exact: true });
const warning = (page: Page) =>
  page.getByRole('dialog', { name: 'Check this action', exact: true });

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

function combatFile(id: string): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = id;
  file.build.name = id;
  file.live.characterId = id;
  file.events = [];
  file.live.combat = {
    round: 1,
    turnActive: true,
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

async function noOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
}

test('equipped weapon attacks spend one action, warn on another, and retain durable Undo', async ({
  page,
  isMobile,
}, info) => {
  const file = combatFile('actions-weapons');
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await expect(row(page, 'Rapier')).toContainText('+4');
  await expect(row(page, 'Rapier')).toContainText('1d8+2');
  const attack = row(page, 'Rapier').getByRole('button', { name: /^Attack/ });
  await attack.focus();
  await page.keyboard.press('Enter');
  await saved(page);
  const first = await readSaved(page, file.build.id);
  expect(first.build).toEqual(initial.build);
  expect(first.live).toEqual({
    ...initial.live,
    combat: {
      ...initial.live.combat!,
      economy: { ...initial.live.combat!.economy, actionUsed: true },
    },
  });
  expect(first.events.map((event) => event.command)).toEqual(['takeCombatAction']);
  expect(first.events[0]?.text).toContain('Rapier');
  await expect(
    economy(page).getByRole('button', { name: 'Action used', exact: true }),
  ).toBeVisible();
  const second = row(page, 'Dagger').getByRole('button', { name: /^Attack/ });
  if (isMobile) await second.tap();
  else await second.click();
  await expect(warning(page)).toContainText('Action already used');
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(second).toBeFocused();
  expect(await readSaved(page, file.build.id)).toEqual(first);
  await second.click();
  await warning(page).getByRole('button', { name: 'Do anyway', exact: true }).click();
  await saved(page);
  const overridden = await readSaved(page, file.build.id);
  expect(overridden.events).toHaveLength(2);
  expect(overridden.events[1]?.override).toBe(true);
  expect(overridden.live).toEqual(first.live);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`combat-actions-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(overridden);
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await saved(page);
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await saved(page);
  const undone = await readSaved(page, file.build.id);
  expect(undone.live).toEqual(initial.live);
  expect(undone.build).toEqual(initial.build);
});

test('Dash previews spend nothing; its extra movement ends with the turn and Undo restores it', async ({
  page,
  isMobile,
}) => {
  const file = combatFile('actions-dash');
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await main(page).getByRole('button', { name: 'Dash', exact: true }).click();
  expect(await readSaved(page, file.build.id)).toEqual(initial);
  await page.getByRole('button', { name: 'Take Dash', exact: true }).click();
  await saved(page);
  if (isMobile)
    await expect(page.getByRole('dialog', { name: 'Dash', exact: true })).toHaveCount(0);
  await expect(economy(page)).toContainText('60 / 60 ft left');
  const dashed = await readSaved(page, file.build.id);
  expect(dashed.live.combat?.economy).toEqual({
    ...initial.live.combat!.economy,
    actionUsed: true,
    dashCount: 1,
  });
  expect(dashed.live.clock).toEqual(initial.live.clock);
  expect(dashed.events.map((event) => event.command)).toEqual(['takeCombatAction']);
  await economy(page).getByRole('button', { name: 'Use 5 ft of movement' }).click();
  await saved(page);
  await expect(economy(page)).toContainText('55 / 60 ft left');
  await main(page).getByRole('button', { name: 'End Turn', exact: true }).click();
  await saved(page);
  const waiting = await readSaved(page, file.build.id);
  await expect(economy(page)).toContainText('25 / 30 ft left');
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await saved(page);
  await expect(economy(page)).toContainText('55 / 60 ft left');
  expect((await readSaved(page, file.build.id)).live.combat?.turnActive).toBe(true);
  await main(page).getByRole('button', { name: 'End Turn', exact: true }).click();
  await saved(page);
  await main(page).getByRole('button', { name: 'Start Turn', exact: true }).click();
  await saved(page);
  await expect(economy(page)).toContainText('30 / 30 ft left');
  const next = await readSaved(page, file.build.id);
  expect(next.live.combat?.round).toBe(2);
  expect(next.live.combat?.economy.dashCount ?? 0).toBe(0);
  expect(next.live.clock.seconds).toBe(initial.live.clock.seconds + 6);
  await page.reload();
  await saved(page);
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await saved(page);
  expect((await readSaved(page, file.build.id)).live).toEqual(waiting.live);
  await expect(economy(page)).toContainText('25 / 30 ft left');
});

test('Combat casting uses the shared healing flow and the same slots as the Spellbook', async ({
  page,
}) => {
  const file = combatFile('actions-casting');
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await main(page).getByRole('tab', { name: 'Bonus', exact: true }).click();
  await row(page, 'Healing Word').getByRole('button', { name: /^Cast/ }).click();
  const flow = page.getByRole('dialog', { name: 'Cast Healing Word', exact: true });
  await expect(flow).toBeVisible();
  await flow.getByRole('checkbox', { name: 'Apply to me', exact: true }).check();
  await flow.getByLabel('Healing dice total', { exact: true }).fill('2');
  await expect(flow.getByRole('status', { name: 'Healing preview' })).toContainText('18');
  await flow.getByRole('button', { name: 'Cast Healing Word (L2)', exact: true }).click();
  await expect(flow).toHaveCount(0);
  await saved(page);
  const cast = await readSaved(page, file.build.id);
  expect(cast.build).toEqual(initial.build);
  expect(cast.live.hp).toBe(18);
  expect(cast.live.slotsUsed[2]).toBe(initial.live.slotsUsed[2]! + 1);
  expect(cast.live.combat?.economy).toMatchObject({ bonusUsed: true, bonusActionSpellCast: true });
  expect(cast.events.map((event) => event.command)).toEqual(['castSpell']);
  await page.getByRole('link', { name: 'Spells', exact: true }).click();
  await expect(
    main(page).getByRole('group', { name: 'Level 2 spell slots', exact: true }),
  ).toContainText('1/2');
  await page.reload();
  await saved(page);
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await saved(page);
  expect((await readSaved(page, file.build.id)).live).toEqual(initial.live);
});

test('feature tabs use the actual shared pool without pretending a bonus feature is a spell', async ({
  page,
  isMobile,
}) => {
  const file = combatFile('actions-features');
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  if (!isMobile) {
    await main(page).getByRole('tab', { name: 'React', exact: true }).click();
    await row(page, 'Cutting Words')
      .getByRole('button', { name: /^Cutting Words\b/ })
      .click();
    await expect(page.getByRole('complementary', { name: 'Pinned detail' })).toContainText(
      /3\s*\/\s*5/,
    );
  }
  await main(page).getByRole('tab', { name: 'Bonus', exact: true }).click();
  await expect(row(page, 'Bardic Inspiration')).toContainText('3 / 5');
  await row(page, 'Bardic Inspiration').getByRole('button', { name: /^Use/ }).click();
  await saved(page);
  const used = await readSaved(page, file.build.id);
  expect(used.live.featureUsesSpent['feature.bard.bardic-inspiration']).toBe(
    initial.live.featureUsesSpent['feature.bard.bardic-inspiration']! + 1,
  );
  expect(used.live.combat?.economy).toEqual({
    ...initial.live.combat!.economy,
    bonusUsed: true,
  });
  expect(used.events.map((event) => event.command)).toEqual(['useFeature']);
  if (!isMobile)
    await expect(page.getByRole('complementary', { name: 'Pinned detail' })).toContainText(
      /2\s*\/\s*5/,
    );
  await main(page).getByRole('tab', { name: 'React', exact: true }).click();
  await expect(row(page, 'Cutting Words')).toContainText('2 / 5');
  await page.reload();
  await saved(page);
  await main(page).getByRole('tab', { name: 'React', exact: true }).click();
  await expect(row(page, 'Cutting Words')).toContainText('2 / 5');
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await saved(page);
  expect((await readSaved(page, file.build.id)).live).toEqual(initial.live);
});

test('Spells filters normal economy by default while Show all preserves explicit overrides', async ({
  page,
}) => {
  const file = combatFile('actions-spell-filter');
  file.live.combat!.economy.actionUsed = true;
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await main(page).getByRole('tab', { name: 'Spells', exact: true }).click();
  await expect(row(page, 'Vicious Mockery')).toHaveCount(0);
  await expect(row(page, 'Healing Word')).toBeVisible();
  const showAll = main(page).getByRole('checkbox', { name: 'Show all spells', exact: true });
  await showAll.check();
  await expect(row(page, 'Vicious Mockery')).toBeVisible();
  expect(await readSaved(page, file.build.id)).toEqual(initial);
  await row(page, 'Vicious Mockery').getByRole('button', { name: /^Cast/ }).click();
  const flow = page.getByRole('dialog', { name: 'Cast Vicious Mockery', exact: true });
  await flow.getByRole('button', { name: 'Cast Vicious Mockery', exact: true }).click();
  await expect(warning(page)).toContainText('Action already used');
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(flow).toBeVisible();
  await expect(
    flow.getByRole('button', { name: 'Cast Vicious Mockery', exact: true }),
  ).toBeFocused();
  expect(await readSaved(page, file.build.id)).toEqual(initial);
  await flow.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(showAll).toBeChecked();
  await showAll.uncheck();
  await expect(row(page, 'Vicious Mockery')).toHaveCount(0);
  expect(await readSaved(page, file.build.id)).toEqual(initial);
});

test('blank imported characters do not inherit Fool actions and Items remains a phase placeholder', async ({
  page,
}) => {
  const file = combatFile('actions-empty-wizard');
  file.build.classes = [{ classId: 'class.wizard', level: 3 }];
  file.build.hpEntries = file.build.hpEntries.map((entry, index) => ({
    ...entry,
    classId: 'class.wizard',
    value: index === 0 ? 6 : entry.value,
  }));
  file.build.spells = [];
  file.build.items = [];
  file.live.items = {};
  file.live.featureUsesSpent = {};
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await expect(main(page).getByRole('button', { name: /^Rapier\b/ })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: /^Vicious Mockery\b/ })).toHaveCount(0);
  await main(page).getByRole('tab', { name: 'Bonus', exact: true }).click();
  await expect(main(page).getByRole('button', { name: /^Bardic Inspiration\b/ })).toHaveCount(0);
  await main(page).getByRole('tab', { name: 'Spells', exact: true }).click();
  await expect(main(page).getByRole('button', { name: /^Healing Word\b/ })).toHaveCount(0);
  await main(page).getByRole('tab', { name: 'Items', exact: true }).click();
  await expect(main(page)).toContainText(/coming in phase 2/i);
  await expect(
    main(page)
      .getByRole('tabpanel', { name: 'Items', exact: true })
      .getByRole('button', { name: /^Use/ }),
  ).toHaveCount(0);
  expect(await readSaved(page, file.build.id)).toEqual(initial);
  await noOverflow(page);
});

test('exhausted feature uses disable actions while the live preview explains the resource', async ({
  page,
  isMobile,
}) => {
  const file = combatFile('actions-exhausted-feature');
  file.live.featureUsesSpent['feature.bard.bardic-inspiration'] = 5;
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await main(page).getByRole('tab', { name: 'Bonus', exact: true }).click();
  const feature = row(page, 'Bardic Inspiration');
  await expect(feature).toContainText('0 / 5');
  await expect(feature.getByRole('button', { name: /^Use/ })).toBeDisabled();
  await feature.getByRole('button', { name: /^Bardic Inspiration\b/ }).click();
  const preview = isMobile
    ? page.getByRole('dialog', { name: 'Bardic Inspiration', exact: true })
    : page.getByRole('complementary', { name: 'Pinned detail', exact: true });
  await expect(preview).toContainText('No Bardic Inspiration uses left');
  await expect(
    preview.getByRole('button', { name: 'Use Bardic Inspiration', exact: true }),
  ).toBeDisabled();
  expect(await readSaved(page, file.build.id)).toEqual(initial);
});
