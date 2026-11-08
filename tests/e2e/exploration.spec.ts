import { readFile } from 'node:fs/promises';
import type { Locator } from '@playwright/test';
import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import { createCharacter } from '../../src/engine/creation';
import { buildRegistry } from '../../src/engine/registry';
import {
  ExportFileSchema,
  RefPackSchema,
  type Campaign,
  type CharacterBuild,
  type ExportFile,
  type LiveState,
  type LogEvent,
} from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

// Node fixture construction cannot use Vite's JSON loader.
const registry = buildRegistry(
  await Promise.all(
    ['races', 'classes', 'backgrounds', 'items', 'features', 'subclasses', 'spells'].map(
      async (kind) =>
        RefPackSchema.parse(
          JSON.parse(
            await readFile(new URL(`../../data/srd/${kind}.json`, import.meta.url), 'utf8'),
          ),
        ),
    ),
  ),
  [],
  [],
);

interface SavedCharacter {
  build: CharacterBuild;
  live: LiveState;
  events: LogEvent[];
}

const main = (page: Page) => page.getByRole('main');
const clock = (page: Page) => main(page).getByRole('region', { name: 'Game clock', exact: true });
const clockButton = (page: Page) =>
  clock(page).getByRole('button', { name: 'Advance time', exact: true });
const clockDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Advance game time', exact: true });
const utility = (page: Page) =>
  main(page).getByRole('region', { name: 'Utility spells and rituals', exact: true });
const concentration = (page: Page) =>
  main(page).getByRole('region', { name: 'Concentration', exact: true });
const effects = (page: Page) =>
  main(page).getByRole('region', { name: 'Effects on you', exact: true });
const undo = (page: Page) =>
  page
    .getByRole('region', { name: 'Character log', exact: true })
    .getByRole('button', { name: 'Undo last command', exact: true });
const ritual = (dialog: Locator) =>
  dialog.getByRole('checkbox', { name: 'Cast as ritual (+10 minutes)', exact: true });
const spellRow = (page: Page, name: string) =>
  utility(page)
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: new RegExp(`^${name}\\b`) }) });

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
          .sort((a, b) => a.order - b.order)
          .map(({ data }) => data),
      };
    } finally {
      db.close();
    }
  }, characterId);
}

async function importFile(page: Page, file: ExportFile) {
  await page.goto('/');
  await saved(page);
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: 'exploration.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(ExportFileSchema.parse(file))),
  });
  const dialog = page.getByRole('dialog', { name: 'Import character', exact: true });
  await dialog.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(dialog).toBeHidden();
  await saved(page);
}

async function go(page: Page, id: string, screen = 'explore') {
  await page.goto(`/characters/${id}${screen === 'dashboard' ? '' : `/${screen}`}`);
  await saved(page);
  if (screen === 'explore')
    await expect(main(page).getByRole('heading', { name: 'Explore', exact: true })).toBeVisible();
}

async function openClock(page: Page) {
  await clockButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(clockDialog(page)).toBeVisible();
}

async function castDialog(page: Page, name: string) {
  await spellRow(page, name).getByRole('button', { name: 'Cast', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Cast ${name}`, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function applyCast(page: Page, dialog: Locator, name: string) {
  await dialog.getByRole('button', { name, exact: true }).click();
  await expect(dialog).toBeHidden();
  await saved(page);
}

async function undoTo(page: Page, id: string, expected: SavedCharacter) {
  const before = await readSaved(page, id);
  await undo(page).click();
  await saved(page);
  const restored = await readSaved(page, id);
  expect(restored.build).toEqual(expected.build);
  expect(restored.live).toEqual(expected.live);
  expect(restored.events).toHaveLength(before.events.length + 1);
  expect(restored.events.at(-1)?.command).toBe('undo');
}

async function noOverflow(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
}

async function touchTarget(control: Locator) {
  const bounds = await control.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
}

async function oneUndo(page: Page) {
  await expect(page.getByRole('button', { name: /^Undo\b/ })).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: /^Undo\b/, includeHidden: true }).filter({ visible: true }),
  ).toHaveCount(1);
}

function foolFile(id: string): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = id;
  file.live.characterId = id;
  file.events = [];
  return file;
}

function friendFile(id: string, classId: string): ExportFile {
  const campaign: Campaign = {
    ...ExportFileSchema.parse(seed).campaign,
    id: `${id}-campaign`,
    name: 'The Ashfield table',
    sources: ['PHB'],
    hpMethod: 'average',
    abilityMethod: 'rolled',
  };
  const character = createCharacter(
    {
      id,
      name: 'Mira Ashfield',
      campaign,
      raceId: 'race.human',
      classId,
      backgroundId: 'background.acolyte',
      level: 3,
      abilityBases: { STR: 10, DEX: 14, CON: 12, INT: 15, WIS: 12, CHA: 10 },
    },
    registry,
  );
  return ExportFileSchema.parse({
    app: 'omnidnd',
    schemaVersion: 1,
    exportedAt: '2026-11-05T00:00:00.000Z',
    campaign,
    ...character,
  });
}

function ritualFile(
  id: string,
  classId: 'class.wizard' | 'class.cleric',
  prepared: boolean,
): ExportFile {
  const file = friendFile(id, classId);
  file.build.spells = [
    { classId, known: ['spell.detect-magic'], prepared: prepared ? ['spell.detect-magic'] : [] },
  ];
  file.live.slotsUsed[1] = 4;
  file.live.slotsUsed[2] = 2;
  return ExportFileSchema.parse(file);
}

test('Explore and Dashboard use one saved clock with preset and custom expiry and exact Undo', async ({
  page,
}) => {
  const file = foolFile('explore-clock');
  const start = file.live.clock.seconds;
  file.live.concentration = {
    spellId: 'spell.invisibility',
    effectId: 'explore-invisibility',
    endsAt: start + 600,
  };
  file.live.effects = [
    {
      id: 'explore-invisibility',
      sourceId: 'spell.invisibility',
      name: 'Invisibility',
      concentration: true,
      conditions: ['invisible'],
      modifiers: [],
      endsAt: start + 600,
    },
    {
      id: 'explore-ward',
      name: 'Borrowed ward',
      concentration: false,
      conditions: [],
      modifiers: [],
      endsAt: start + 60,
    },
    {
      id: 'explore-keepsake',
      name: 'Keepsake charm',
      concentration: false,
      conditions: [],
      modifiers: [],
    },
  ];
  await importFile(page, file);
  await go(page, file.build.id);
  const before = await readSaved(page, file.build.id);
  await expect(clock(page)).toHaveCount(1);
  await expect(clock(page)).toContainText('Day 1, 08:00');
  await oneUndo(page);
  await touchTarget(clockButton(page));
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath('explore-top.png'),
    animations: 'disabled',
  });
  await openClock(page);
  await touchTarget(clockDialog(page).getByRole('button', { name: '+1 min', exact: true }));
  await clockDialog(page).getByRole('button', { name: '+1 min', exact: true }).click();
  await expect(clockDialog(page)).toBeHidden();
  await saved(page);
  const preset = await readSaved(page, file.build.id);
  expect(preset.build).toEqual(before.build);
  expect(preset.live).toEqual({
    ...before.live,
    clock: { seconds: start + 60 },
    effects: before.live.effects.filter(({ id }) => id !== 'explore-ward'),
  });
  expect(preset.events).toHaveLength(before.events.length + 1);
  await expect(effects(page)).not.toContainText('Borrowed ward');
  await expect(concentration(page)).toContainText('Invisibility');
  await openClock(page);
  await clockDialog(page).getByLabel('Hours', { exact: true }).fill('0');
  await clockDialog(page).getByLabel('Minutes', { exact: true }).fill('9');
  await expect(
    clockDialog(page).getByRole('region', { name: 'Time preview', exact: true }),
  ).toContainText('Day 1, 08:10');
  await clockDialog(page)
    .getByRole('button', { name: 'Advance time', exact: true })
    .scrollIntoViewIfNeeded();
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath('explore-clock-preview.png'),
    animations: 'disabled',
  });
  await clockDialog(page).getByRole('button', { name: 'Advance time', exact: true }).click();
  await expect(clockDialog(page)).toBeHidden();
  await saved(page);
  const expired = await readSaved(page, file.build.id);
  const withoutConcentration = structuredClone(preset.live);
  delete withoutConcentration.concentration;
  expect(expired.live).toEqual({
    ...withoutConcentration,
    clock: { seconds: start + 600 },
    effects: [before.live.effects[2]],
  });
  expect(expired.events).toHaveLength(before.events.length + 2);
  await expect(concentration(page)).toContainText('None');
  await expect(effects(page)).toContainText('Keepsake charm');
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(expired);
  await undoTo(page, file.build.id, preset);
  await go(page, file.build.id, 'dashboard');
  await expect(clock(page)).toContainText('Day 1, 08:01');
  await expect(concentration(page)).toContainText('Invisibility');
  await undoTo(page, file.build.id, before);
  await go(page, file.build.id);
  await expect(clock(page)).toContainText('Day 1, 08:00');
});

test('utility casting spends the shared slot and its self effect survives Spells, Combat and reload', async ({
  page,
}) => {
  const file = foolFile('explore-disguise');
  await importFile(page, file);
  await go(page, file.build.id);
  const before = await readSaved(page, file.build.id);
  await touchTarget(
    spellRow(page, 'Disguise Self').getByRole('button', { name: 'Cast', exact: true }),
  );
  const dialog = await castDialog(page, 'Disguise Self');
  await expect(dialog.getByRole('checkbox', { name: 'Apply to me', exact: true })).toHaveCount(0);
  await expect(dialog).toContainText("This spell's effect applies to you.");
  await expect(dialog.getByRole('button', { name: /^L1/ })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: /^L2/ })).toHaveAttribute('aria-pressed', 'true');
  await touchTarget(dialog.getByRole('button', { name: 'Cast Disguise Self (L2)', exact: true }));
  await dialog
    .getByRole('button', { name: 'Cast Disguise Self (L2)', exact: true })
    .scrollIntoViewIfNeeded();
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath('explore-cast.png'),
    animations: 'disabled',
  });
  await applyCast(page, dialog, 'Cast Disguise Self (L2)');
  const cast = await readSaved(page, file.build.id);
  expect(cast.build).toEqual(before.build);
  expect(cast.live.slotsUsed[2]).toBe(1);
  expect(cast.live.effects).toEqual([
    expect.objectContaining({ sourceId: 'spell.disguise-self', name: 'Disguise Self' }),
  ]);
  expect(cast.live).toEqual({
    ...before.live,
    slotsUsed: cast.live.slotsUsed,
    effects: cast.live.effects,
  });
  expect(cast.events).toHaveLength(before.events.length + 1);
  await expect(effects(page)).toContainText('Disguise Self');
  await expect(concentration(page)).toContainText('None');
  await go(page, file.build.id, 'spells');
  await expect(
    page
      .getByRole('banner', { name: 'Character HUD', exact: true })
      .getByRole('img', { name: 'L2: 1 of 2 left', exact: true }),
  ).toBeVisible();
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(cast);
  await go(page, file.build.id, 'combat');
  await expect(effects(page)).toContainText('Disguise Self');
  await main(page).getByRole('button', { name: 'Start combat', exact: true }).click();
  await saved(page);
  await expect(effects(page)).toContainText('Disguise Self');
  await oneUndo(page);
  await undoTo(page, file.build.id, cast);
  await undoTo(page, file.build.id, before);
});

test('a Wizard can ritual-cast a known unprepared utility spell with all slots exhausted', async ({
  page,
}) => {
  const file = ritualFile('explore-wizard', 'class.wizard', false);
  await importFile(page, file);
  await go(page, file.build.id);
  const before = await readSaved(page, file.build.id);
  const dialog = await castDialog(page, 'Detect Magic');
  await expect(
    dialog.getByRole('button', { name: 'Cast Detect Magic (L1)', exact: true }),
  ).toBeDisabled();
  await ritual(dialog).check();
  await expect(dialog.getByRole('group', { name: 'Slot level', exact: true })).toHaveCount(0);
  await expect(dialog).toContainText('Ritual casting uses no spell slot.');
  await applyCast(page, dialog, 'Cast Detect Magic (ritual)');
  const cast = await readSaved(page, file.build.id);
  expect(cast.build).toEqual(before.build);
  expect(cast.live.slotsUsed).toEqual(before.live.slotsUsed);
  expect(cast.live.clock.seconds).toBe(before.live.clock.seconds + 600);
  expect(cast.live.hp).toBe(before.live.hp);
  expect(cast.live.concentration?.spellId).toBe('spell.detect-magic');
  expect(cast.events).toHaveLength(before.events.length + 1);
  await expect(concentration(page)).toContainText('Detect Magic');
  await go(page, file.build.id, 'dashboard');
  await expect(clock(page)).toContainText('Day 1, 08:10');
  await undoTo(page, file.build.id, before);
});

test('Cleric rituals require preparation rather than a retained known selection', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const unprepared = ritualFile('explore-cleric-unprepared', 'class.cleric', false);
  await importFile(page, unprepared);
  await go(page, unprepared.build.id);
  const before = await readSaved(page, unprepared.build.id);
  const blocked = await castDialog(page, 'Detect Magic');
  await expect(ritual(blocked)).toHaveCount(0);
  await expect(blocked).toContainText('Detect Magic is not prepared as a Cleric spell');
  await expect(
    blocked.getByRole('button', { name: 'Cast Detect Magic (L1)', exact: true }),
  ).toBeDisabled();
  await blocked.getByRole('button', { name: 'Close', exact: true }).click();
  expect(await readSaved(page, unprepared.build.id)).toEqual(before);
  const prepared = ritualFile('explore-cleric-prepared', 'class.cleric', true);
  await importFile(page, prepared);
  await go(page, prepared.build.id);
  const ready = await readSaved(page, prepared.build.id);
  const dialog = await castDialog(page, 'Detect Magic');
  await ritual(dialog).check();
  await applyCast(page, dialog, 'Cast Detect Magic (ritual)');
  const cast = await readSaved(page, prepared.build.id);
  expect(cast.live.slotsUsed).toEqual(ready.live.slotsUsed);
  expect(cast.live.clock.seconds).toBe(ready.live.clock.seconds + 600);
  expect(cast.events).toHaveLength(ready.events.length + 1);
  await undoTo(page, prepared.build.id, ready);
});

test('Explore uses the Sheet skill and passive calculations, explicit overrides and each friend’s own spell selection', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const fool = foolFile('explore-checks-fool');
  await importFile(page, fool);
  await go(page, fool.build.id);
  const athletics = main(page).getByRole('button', {
    name: 'Show Athletics breakdown',
    exact: true,
  });
  await expect(athletics).toContainText('+1');
  await expect(athletics.locator('xpath=ancestor::li[1]')).toContainText('Jack of All Trades');
  await expect(
    main(page).getByRole('button', { name: 'Show Passive Perception breakdown', exact: true }),
  ).toContainText('13');
  const file = friendFile('explore-fighter', 'class.fighter');
  file.build.proficiencies.skills.push('stealth');
  file.build.proficiencies.expertise.push('stealth');
  file.build.overrides = [
    { path: '/skills/perception', value: 10, note: 'DM observant lesson' },
    { path: '/passives/perception', value: 22, note: 'Watch duty' },
  ];
  await importFile(page, file);
  await go(page, file.build.id);
  const before = await readSaved(page, file.build.id);
  await expect(utility(page)).toContainText('No utility spells or rituals selected.');
  await expect(utility(page)).not.toContainText('Select spells on the Spells screen');
  await expect(utility(page).getByRole('button', { name: 'Cast', exact: true })).toHaveCount(0);
  for (const screen of ['explore', 'sheet']) {
    await go(page, file.build.id, screen);
    const stealth = main(page).getByRole('button', { name: 'Show Stealth breakdown', exact: true });
    await expect(stealth).toContainText('+6');
    await expect(stealth.locator('xpath=ancestor::li[1]')).toContainText('Expertise');
    await expect(
      main(page).getByRole('button', { name: 'Show Athletics breakdown', exact: true }),
    ).toContainText('+0');
    const perception = main(page).getByRole('button', {
      name: 'Show Perception breakdown',
      exact: true,
    });
    await expect(perception).toContainText('+10');
    await expect(
      perception.getByRole('img', { name: 'Overridden: DM observant lesson', exact: true }),
    ).toHaveText('✎');
    const passive = main(page).getByRole('button', {
      name: 'Show Passive Perception breakdown',
      exact: true,
    });
    await expect(passive).toContainText('22');
    await expect(
      passive.getByRole('img', { name: 'Overridden: Watch duty', exact: true }),
    ).toHaveText('✎');
    await touchTarget(stealth);
    await noOverflow(page);
    await oneUndo(page);
  }
  expect(await readSaved(page, file.build.id)).toEqual(before);
});

test('self and ally utility casts keep concentration separate from effects on you through Combat and expiry', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const file = foolFile('explore-invisibility');
  file.build.spellTags = { 'spell.invisibility': ['utility', 'buff'] };
  await importFile(page, file);
  await go(page, file.build.id);
  const before = await readSaved(page, file.build.id);
  const self = await castDialog(page, 'Invisibility');
  await self.getByRole('checkbox', { name: 'Apply to me', exact: true }).check();
  await applyCast(page, self, 'Cast Invisibility (L2)');
  const selfCast = await readSaved(page, file.build.id);
  expect(selfCast.live.concentration?.spellId).toBe('spell.invisibility');
  expect(selfCast.live.effects).toEqual([
    expect.objectContaining({
      name: 'Invisibility',
      conditions: ['invisible'],
      concentration: true,
    }),
  ]);
  await go(page, file.build.id, 'combat');
  await expect(concentration(page)).toContainText('Invisibility');
  await expect(effects(page)).toContainText('Invisibility');
  await undoTo(page, file.build.id, before);
  await go(page, file.build.id);
  const ally = await castDialog(page, 'Invisibility');
  await expect(ally.getByRole('checkbox', { name: 'Apply to me', exact: true })).not.toBeChecked();
  await applyCast(page, ally, 'Cast Invisibility (L2)');
  const allyCast = await readSaved(page, file.build.id);
  expect(allyCast.live.concentration?.spellId).toBe('spell.invisibility');
  expect(allyCast.live.effects).toEqual(before.live.effects);
  expect(allyCast.live.slotsUsed[2]).toBe(1);
  await expect(effects(page)).toContainText('None');
  await go(page, file.build.id, 'combat');
  await main(page).getByRole('button', { name: 'Start combat', exact: true }).click();
  await saved(page);
  await expect(concentration(page)).toContainText('Invisibility');
  await expect(effects(page)).toContainText('None');
  await main(page).getByRole('button', { name: 'End combat', exact: true }).click();
  await saved(page);
  const ended = await readSaved(page, file.build.id);
  await go(page, file.build.id);
  await openClock(page);
  await clockDialog(page).getByRole('button', { name: '+1 h', exact: true }).click();
  await expect(clockDialog(page)).toBeHidden();
  await saved(page);
  await expect(concentration(page)).toContainText('None');
  await undoTo(page, file.build.id, ended);
  const restored = await readSaved(page, file.build.id);
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(restored);
});

test('Explore preserves active combat and shares the ritual block and manual-clock warning', async ({
  page,
}) => {
  const file = ritualFile('explore-active-combat', 'class.wizard', false);
  file.live.combat = {
    round: 7,
    turnActive: false,
    economy: {
      actionUsed: true,
      bonusUsed: false,
      reactionUsed: true,
      movementUsed: 10,
      objectInteractionUsed: true,
      bonusActionSpellCast: false,
      otherSpellCast: false,
    },
  };
  await importFile(page, file);
  await go(page, file.build.id);
  const before = await readSaved(page, file.build.id);
  await expect(utility(page)).toContainText(
    "Combat is active. Casting still uses this turn's actions; rituals are unavailable.",
  );
  await oneUndo(page);
  await openClock(page);
  await clockDialog(page).getByRole('button', { name: '+1 min', exact: true }).click();
  const warning = page.getByRole('dialog', { name: 'Check this action', exact: true });
  await expect(warning).toBeVisible();
  await warning.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(warning).toBeHidden();
  await expect(clockDialog(page)).toBeVisible();
  await clockDialog(page).getByRole('button', { name: 'Close', exact: true }).click();
  expect(await readSaved(page, file.build.id)).toEqual(before);
  const dialog = await castDialog(page, 'Detect Magic');
  await expect(ritual(dialog)).toHaveCount(0);
  await expect(dialog).toContainText('Ritual casting is not offered during combat.');
  await expect(
    dialog.getByRole('button', { name: 'Cast Detect Magic (L1)', exact: true }),
  ).toBeDisabled();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await noOverflow(page);
  await go(page, file.build.id, 'combat');
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await expect(main(page)).toContainText('Round 7');
  await oneUndo(page);
});

test('Explore shows jump, lift and breath numbers with breakdowns', async ({ page }) => {
  const fool = foolFile('explore-body-fool');
  await importFile(page, fool);
  await go(page, fool.build.id);
  const body = main(page).getByRole('region', { name: 'Movement and body', exact: true });
  await expect(body).toBeVisible();
  await expect(body).toContainText('Hold breath');
  await body.getByRole('button', { name: 'Show Long jump (run) breakdown', exact: true }).click();
  await expect(page.getByText('STR score').first()).toBeVisible();
  await noOverflow(page);
});
