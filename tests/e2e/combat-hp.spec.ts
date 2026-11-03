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

type HpKind = 'Damage' | 'Heal' | 'Temp HP';
type HpSource = 'hud' | 'combat';
const main = (page: Page) => page.getByRole('main');
const hudHp = (page: Page) =>
  page
    .getByRole('banner', { name: 'Character HUD', exact: true, includeHidden: true })
    .getByRole('button', { name: 'Adjust hit points', exact: true, includeHidden: true });
const combatButton = (page: Page, kind: HpKind) =>
  main(page)
    .getByRole('button', { name: kind === 'Temp HP' ? 'Temp' : kind, exact: true })
    .filter({ visible: true });
const saves = (page: Page) =>
  page.getByRole('region', { name: 'Concentration saves', exact: true });
const death = (page: Page) => main(page).getByRole('region', { name: 'Death saves', exact: true });
const warning = (page: Page) =>
  page.getByRole('dialog', { name: 'Check this action', exact: true });

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

function characterFile(id: string): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = id;
  file.build.name = id;
  file.live.characterId = id;
  file.events = [];
  return file;
}

function concentratingFile(id: string): ExportFile {
  const file = characterFile(id);
  file.live.hp = 19;
  file.live.concentration = {
    spellId: 'spell.invisibility',
    slotLevel: 2,
    endsAt: file.live.clock.seconds + 3600,
    effectId: 'spell.invisibility',
  };
  file.live.effects = [
    {
      id: 'spell.invisibility',
      name: 'Invisibility',
      sourceId: 'spell.invisibility',
      endsAt: file.live.clock.seconds + 3600,
      concentration: true,
      conditions: ['invisible'],
      modifiers: [],
    },
  ];
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

async function openHp(page: Page, source: HpSource, kind: HpKind, amount?: number) {
  if (source === 'hud') await hudHp(page).click();
  else await combatButton(page, kind).click();
  const dialog = page.getByRole('dialog', {
    name: source === 'hud' ? 'Hit points' : kind,
    exact: true,
  });
  if (source === 'hud') await dialog.getByRole('tab', { name: kind, exact: true }).click();
  if (amount !== undefined) {
    for (const digit of String(amount))
      await dialog.getByRole('button', { name: digit, exact: true }).click();
    await expect(dialog.getByLabel(`${kind} amount`, { exact: true })).toHaveText(String(amount));
  }
  return dialog;
}

async function applyHp(page: Page, source: HpSource, kind: HpKind, amount: number) {
  const dialog = await openHp(page, source, kind, amount);
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expectSaved(page);
}

async function undo(page: Page) {
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await expectSaved(page);
}

test('Combat HP changes share HUD values, preserve other resources, and support durable Undo', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/characters/the-fool/combat');
  await expectSaved(page);
  const initial = await readSavedCharacter(page);
  await expect(hudHp(page)).toHaveText(/11\s*\/\s*19/);
  await applyHp(page, 'combat', 'Damage', 3);
  await expect(hudHp(page)).toHaveText(/8\s*\/\s*19/);
  await applyHp(page, 'combat', 'Heal', 99);
  await expect(hudHp(page)).toHaveText(/19\s*\/\s*19/);
  await applyHp(page, 'combat', 'Temp HP', 10);
  await applyHp(page, 'combat', 'Damage', 12);
  await expect(hudHp(page)).toHaveText(/17\s*\/\s*19/);
  if (!isMobile) {
    const panel = main(page).getByRole('region', { name: 'Hit points', exact: true });
    for (const amount of [1, 5, 10]) {
      await panel.getByRole('button', { name: `Take ${amount} damage`, exact: true }).click();
      await expectSaved(page);
    }
  }
  const expectedHp = isMobile ? 17 : 1;
  await applyHp(page, 'combat', 'Temp HP', 7);
  await expectNoOverflow(page);
  await page.screenshot({
    path: info.outputPath(`combat-hp-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });
  await main(page)
    .getByRole('button', { name: 'Clear temp HP', exact: true })
    .filter({ visible: true })
    .click();
  await expectSaved(page);
  const cleared = await readSavedCharacter(page);
  expect(cleared.build).toEqual(initial.build);
  expect(cleared.live).toEqual({ ...initial.live, hp: expectedHp, tempHp: 0 });
  expect(cleared.events.map((event) => event.command)).toEqual([
    'applyDamage',
    'heal',
    'setTempHp',
    'applyDamage',
    ...(!isMobile ? ['applyDamage', 'applyDamage', 'applyDamage'] : []),
    'setTempHp',
    'setTempHp',
  ]);
  await page.reload();
  await expectSaved(page);
  expect(await readSavedCharacter(page)).toEqual(cleared);
  await undo(page);
  expect((await readSavedCharacter(page)).live).toEqual({
    ...initial.live,
    hp: expectedHp,
    tempHp: 7,
  });
  await expect(hudHp(page)).toContainText('+7');
});

for (const source of ['hud', 'combat'] as const) {
  test(`${source} lower-temp warning retains the entered amount and Apply focus on Cancel`, async ({
    page,
  }) => {
    await page.goto('/characters/the-fool/combat');
    await expectSaved(page);
    await applyHp(page, source, 'Temp HP', 10);
    const initial = await readSavedCharacter(page);
    const dialog = await openHp(page, source, 'Temp HP', 5);
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(warning(page)).toContainText("Temp HP don't stack");
    expect(await readSavedCharacter(page)).toEqual(initial);
    await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Temp HP amount', { exact: true })).toHaveText('5');
    await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeFocused();
    expect(await readSavedCharacter(page)).toEqual(initial);
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
    await warning(page).getByRole('button', { name: 'Do anyway', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expectSaved(page);
    await expect(source === 'hud' ? hudHp(page) : combatButton(page, 'Temp HP')).toBeFocused();
    const replaced = await readSavedCharacter(page);
    expect(replaced.build).toEqual(initial.build);
    expect(replaced.live).toEqual({ ...initial.live, tempHp: 5 });
    expect(replaced.events).toHaveLength(2);
    expect(replaced.events[1]?.command).toBe('setTempHp');
    expect(replaced.events[1]?.override).toBe(true);
    await page.reload();
    await expectSaved(page);
    await undo(page);
    expect((await readSavedCharacter(page)).live).toEqual(initial.live);
  });
}

test('each damage instance queues a durable concentration check; Pass, Fail, and Undo remain exact', async ({
  page,
  isMobile,
}, info) => {
  const file = concentratingFile('hp-concentration-queue');
  await importCharacter(page, file);
  const initial = await readSavedCharacter(page, file.build.id);
  await applyHp(page, 'hud', 'Damage', 1);
  await expect(hudHp(page)).toBeFocused();
  await applyHp(page, 'combat', 'Damage', 2);
  await expect(combatButton(page, 'Damage')).toBeFocused();
  const damaged = await readSavedCharacter(page, file.build.id);
  const damageIds = damaged.events.map((event) => event.id);
  expect(damaged.live).toEqual({
    ...initial.live,
    hp: 16,
    concentration: {
      ...initial.live.concentration!,
      pendingSaves: damageIds.map((id) => ({ id, dc: 10 })),
    },
  });
  expect(new Set(damageIds).size).toBe(2);
  expect(damaged.events.map((event) => event.command)).toEqual(['applyDamage', 'applyDamage']);
  await expect(saves(page)).toContainText('2 pending');
  await expect(saves(page)).toContainText('CON DC 10');
  await page.getByRole('link', { name: 'Spells', exact: true }).click();
  await expect(saves(page)).toContainText('2 pending');
  await page.reload();
  await expectSaved(page);
  expect(await readSavedCharacter(page, file.build.id)).toEqual(damaged);
  await expectNoOverflow(page);
  await page.screenshot({
    path: info.outputPath(`concentration-queue-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });
  await saves(page).getByRole('button', { name: 'Pass', exact: true }).click();
  await expectSaved(page);
  await expect(saves(page)).toContainText('1 pending');
  await expect
    .poll(() => saves(page).evaluate((element) => element.contains(document.activeElement)))
    .toBe(true);
  const passed = await readSavedCharacter(page, file.build.id);
  expect(passed.live).toEqual({
    ...damaged.live,
    concentration: {
      ...damaged.live.concentration!,
      pendingSaves: [{ id: damageIds[1]!, dc: 10 }],
    },
  });
  await saves(page).getByRole('button', { name: 'Fail', exact: true }).click();
  await expectSaved(page);
  await expect(saves(page)).toHaveCount(0);
  const failed = await readSavedCharacter(page, file.build.id);
  expect(failed.live.concentration).toBeUndefined();
  expect(failed.live.effects).toEqual([]);
  expect(failed.live.hp).toBe(16);
  expect(failed.build).toEqual(initial.build);
  expect(failed.events.map((event) => event.command)).toEqual([
    'applyDamage',
    'applyDamage',
    'resolveConcentrationSave',
    'resolveConcentrationSave',
  ]);
  await page.reload();
  await expectSaved(page);
  await undo(page);
  expect((await readSavedCharacter(page, file.build.id)).live).toEqual(passed.live);
  await expect(saves(page)).toContainText('1 pending');
});

test('fully absorbed damage uses its whole amount for concentration DC; zero HP clears concentration', async ({
  page,
}) => {
  const file = concentratingFile('hp-temp-concentration');
  file.live.tempHp = 30;
  await importCharacter(page, file);
  const initial = await readSavedCharacter(page, file.build.id);
  await applyHp(page, 'combat', 'Damage', 22);
  const absorbed = await readSavedCharacter(page, file.build.id);
  expect(absorbed.live.hp).toBe(19);
  expect(absorbed.live.tempHp).toBe(8);
  expect(absorbed.live.concentration?.pendingSaves).toEqual([
    { id: absorbed.events[0]!.id, dc: 11 },
  ]);
  await expect(saves(page)).toContainText('CON DC 11');
  await applyHp(page, 'hud', 'Damage', 27);
  const down = await readSavedCharacter(page, file.build.id);
  expect(down.live).toEqual({
    ...initial.live,
    hp: 0,
    tempHp: 0,
    concentration: undefined,
    effects: [],
    conditions: ['unconscious'],
  });
  await expect(saves(page)).toHaveCount(0);
  await expect(death(page)).toBeVisible();
  await undo(page);
  expect((await readSavedCharacter(page, file.build.id)).live).toEqual(absorbed.live);
  await expect(saves(page)).toContainText('CON DC 11');
});

test('typed death saves and natural results use 2014 outcomes and survive Undo', async ({
  page,
  isMobile,
}, info) => {
  const file = characterFile('hp-death-rolls');
  file.live.hp = 0;
  file.live.conditions = ['unconscious'];
  await importCharacter(page, file);
  const initial = await readSavedCharacter(page, file.build.id);
  const input = death(page).getByLabel('Death save d20', { exact: true });
  const modifier = death(page).getByLabel('Other bonus or penalty', { exact: true });
  await input.fill('9');
  await modifier.fill('1');
  await death(page).getByRole('button', { name: 'Record death save', exact: true }).click();
  await expectSaved(page);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
  await expect(modifier).toHaveValue('');
  await expect(
    death(page).getByRole('img', { name: 'Successes: 1 of 3', exact: true }),
  ).toBeVisible();
  await modifier.fill('10');
  await death(page).getByRole('button', { name: 'Natural 1', exact: true }).click();
  await expectSaved(page);
  await expect(
    death(page).getByRole('img', { name: 'Failures: 2 of 3', exact: true }),
  ).toBeVisible();
  const rolling = await readSavedCharacter(page, file.build.id);
  expect(rolling.live).toEqual({ ...initial.live, deathSaves: { success: 1, fail: 2 } });
  await expect(modifier).toHaveValue('');
  await expectNoOverflow(page);
  await page.screenshot({
    path: info.outputPath(`death-saves-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });
  await modifier.fill('-20');
  await death(page).getByRole('button', { name: 'Natural 20', exact: true }).click();
  await expectSaved(page);
  await expect(death(page)).toHaveCount(0);
  const revived = await readSavedCharacter(page, file.build.id);
  expect(revived.live).toEqual({
    ...initial.live,
    hp: 1,
    conditions: [],
    deathSaves: { success: 0, fail: 0 },
  });
  expect(revived.build).toEqual(initial.build);
  expect(revived.events.map((event) => event.command)).toEqual([
    'rollDeathSave',
    'rollDeathSave',
    'rollDeathSave',
  ]);
  await page.reload();
  await expectSaved(page);
  await undo(page);
  expect((await readSavedCharacter(page, file.build.id)).live).toEqual(rolling.live);
  await expect(
    death(page).getByRole('img', { name: 'Failures: 2 of 3', exact: true }),
  ).toBeVisible();
});

test('HUD Natural 20 revival keeps a usable editor and focus inside it', async ({
  page,
  isMobile,
}, info) => {
  const file = characterFile('hp-hud-revival');
  file.live.hp = 0;
  file.live.conditions = ['unconscious'];
  await importCharacter(page, file);
  const initial = await readSavedCharacter(page, file.build.id);
  const dialog = await openHp(page, 'hud', 'Damage');
  await dialog.getByRole('button', { name: 'Natural 20', exact: true }).click();
  await expectSaved(page);
  const revived = await readSavedCharacter(page, file.build.id);
  expect(revived.live).toEqual({ ...initial.live, hp: 1, conditions: [] });
  expect(revived.build).toEqual(initial.build);
  expect(revived.events.map((event) => event.command)).toEqual(['rollDeathSave']);
  await page.screenshot({
    path: info.outputPath(`hud-revival-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
    .toBe(true);
  await dialog.getByRole('tab', { name: 'Heal', exact: true }).click();
  await dialog.getByRole('button', { name: '1', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
});

test('stable characters stop rolling; critical damage absorbed by temp ends stability and dead actions disable', async ({
  page,
}) => {
  const file = characterFile('hp-stable-temp');
  file.live.hp = 0;
  file.live.tempHp = 10;
  file.live.conditions = ['unconscious'];
  file.live.deathSaves = { success: 3, fail: 0 };
  await importCharacter(page, file);
  const initial = await readSavedCharacter(page, file.build.id);
  await expect(death(page)).toContainText('Stable at 0 HP');
  for (const name of ['Record death save', 'Natural 1', 'Natural 20'])
    await expect(death(page).getByRole('button', { name, exact: true })).toBeDisabled();
  await expect(death(page).getByLabel('Death save d20', { exact: true })).toBeDisabled();
  const critical = await openHp(page, 'combat', 'Damage', 1);
  await critical.getByRole('checkbox', { name: 'Critical hit at 0 HP', exact: true }).check();
  await critical.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(critical).toHaveCount(0);
  await expectSaved(page);
  const hit = await readSavedCharacter(page, file.build.id);
  expect(hit.live).toEqual({ ...initial.live, tempHp: 9, deathSaves: { success: 0, fail: 2 } });
  await expect(death(page).getByRole('button', { name: 'Natural 20', exact: true })).toBeEnabled();
  await applyHp(page, 'combat', 'Damage', 1);
  const dead = await readSavedCharacter(page, file.build.id);
  expect(dead.live).toEqual({ ...initial.live, tempHp: 8, deathSaves: { success: 0, fail: 3 } });
  expect(dead.build).toEqual(initial.build);
  await expect(death(page).getByRole('heading', { name: 'Dead', exact: true })).toBeVisible();
  await expect(combatButton(page, 'Damage')).toBeDisabled();
  await expect(combatButton(page, 'Heal')).toBeDisabled();
  await expect(combatButton(page, 'Temp HP')).toBeEnabled();
  for (const name of ['Record death save', 'Natural 1', 'Natural 20'])
    await expect(death(page).getByRole('button', { name, exact: true })).toBeDisabled();
  await page.reload();
  await expectSaved(page);
  expect((await readSavedCharacter(page, file.build.id)).live).toEqual(dead.live);
  await undo(page);
  expect((await readSavedCharacter(page, file.build.id)).live).toEqual(hit.live);
  await expect(combatButton(page, 'Heal')).toBeEnabled();
});

test('Manual mode adds no reminders, preserves saved checks behind Review, and resolves them explicitly', async ({
  page,
}) => {
  const file = concentratingFile('hp-manual-concentration');
  file.live.tempHp = 30;
  await importCharacter(page, file);
  await applyHp(page, 'hud', 'Damage', 1);
  const assisted = await readSavedCharacter(page, file.build.id);
  const pending = assisted.live.concentration!.pendingSaves!;
  expect(pending).toEqual([{ id: assisted.events[0]!.id, dc: 10 }]);
  await page.goto(`/characters/${file.build.id}/settings`);
  await expectSaved(page);
  await page.getByRole('radio', { name: /^Manual/ }).check();
  await expectSaved(page);
  await page.goto(`/characters/${file.build.id}/combat`);
  await expectSaved(page);
  await expect(
    saves(page).getByRole('button', { name: 'Review concentration saves', exact: true }),
  ).toBeVisible();
  await expect(saves(page).getByRole('button', { name: 'Pass', exact: true })).toHaveCount(0);
  await applyHp(page, 'combat', 'Damage', 2);
  const manual = await readSavedCharacter(page, file.build.id);
  expect(manual.live).toEqual({ ...assisted.live, tempHp: 27 });
  expect(manual.events.map((event) => event.command)).toEqual(['applyDamage', 'applyDamage']);
  await saves(page)
    .getByRole('button', { name: 'Review concentration saves', exact: true })
    .click();
  await saves(page).getByRole('button', { name: 'Pass', exact: true }).click();
  await expectSaved(page);
  await expect(saves(page)).toHaveCount(0);
  const resolved = await readSavedCharacter(page, file.build.id);
  expect(resolved.live.concentration).toEqual(file.live.concentration);
  expect(resolved.live.effects).toEqual(assisted.live.effects);
  await undo(page);
  expect((await readSavedCharacter(page, file.build.id)).live).toEqual(manual.live);
  await page.reload();
  await expectSaved(page);
  await expect(
    saves(page).getByRole('button', { name: 'Review concentration saves', exact: true }),
  ).toBeVisible();
  await expect(saves(page).getByRole('button', { name: 'Fail', exact: true })).toHaveCount(0);
  await saves(page)
    .getByRole('button', { name: 'Review concentration saves', exact: true })
    .click();
  await saves(page).getByRole('button', { name: 'Fail', exact: true }).click();
  await expectSaved(page);
  const failed = await readSavedCharacter(page, file.build.id);
  expect(failed.live.concentration).toBeUndefined();
  expect(failed.live.effects).toEqual([]);
  expect(failed.live.tempHp).toBe(27);
  expect(failed.build).toEqual(assisted.build);
});
