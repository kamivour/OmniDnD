import type { Locator } from '@playwright/test';
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
const resources = (page: Page) =>
  main(page).getByRole('region', { name: 'Resources', exact: true });
const quick = (page: Page) => main(page).getByRole('region', { name: 'Quick access', exact: true });
const conditions = (page: Page) =>
  main(page).getByRole('region', { name: 'Conditions', exact: true });
const concentration = (page: Page) =>
  main(page).getByRole('region', { name: 'Concentration', exact: true });
const effects = (page: Page) =>
  main(page).getByRole('region', { name: 'Effects on you', exact: true });
const recent = (page: Page) =>
  main(page).getByRole('region', { name: 'Recent commands', exact: true });
const log = (page: Page) => main(page).getByRole('region', { name: 'Dashboard log', exact: true });
const dashboardUndo = (page: Page) =>
  log(page).getByRole('button', { name: 'Undo last dashboard command', exact: true });
const panel = (page: Page) =>
  page.getByRole('complementary', { name: 'Pinned detail', exact: true });
const step = (page: Page, direction: 'Use' | 'Restore', name: string) =>
  resources(page).getByRole('button', { name: `${direction} one: ${name}`, exact: true });
const pips = (page: Page, name: string, left: number, max: number) =>
  resources(page).getByRole('img', { name: `${name}: ${left} of ${max} left`, exact: true });
const quickTrigger = (page: Page, name: string) =>
  quick(page).getByRole('button', { name, exact: true });

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

function dashboardFile(id: string): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = id;
  file.build.name = id;
  file.build.favorites = [];
  file.live.characterId = id;
  file.live.hp = 19;
  file.live.slotsUsed = Array.from({ length: 10 }, () => 0);
  file.live.featureUsesSpent = {};
  file.live.conditions = [];
  file.live.effects = [];
  delete file.live.concentration;
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
  await page.goto(`/characters/${file.build.id}`);
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

async function visibleEnabledFocus(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const active = document.activeElement;
        return (
          active instanceof HTMLElement &&
          active !== document.body &&
          active !== document.documentElement &&
          active.getClientRects().length > 0 &&
          !active.matches(':disabled')
        );
      }),
    )
    .toBe(true);
}

async function undo(page: Page) {
  await dashboardUndo(page).click();
  await saved(page);
}

async function openDetail(page: Page, name: string, isMobile: boolean) {
  const trigger = quickTrigger(page, name);
  await trigger.click();
  const detail = isMobile ? page.getByRole('dialog', { name, exact: true }) : panel(page);
  await expect(detail).toBeVisible();
  return detail;
}

async function closeDetail(detail: Locator, isMobile: boolean) {
  await detail
    .getByRole('button', { name: isMobile ? 'Close' : 'Close details', exact: true })
    .click();
  await expect(detail).toBeHidden();
}

async function openRest(page: Page, kind: 'Short' | 'Long') {
  if (page.viewportSize()!.width < 640) {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'More', exact: true })
      .getByRole('button', { name: `${kind} Rest`, exact: true })
      .click();
  } else {
    await page
      .getByRole('button', { name: `${kind} Rest`, exact: true })
      .filter({ visible: true })
      .click();
  }
  return page.getByRole('dialog', { name: `${kind} Rest`, exact: true });
}

test('saved resource corrections sync Dashboard, HUD, Spellbook and Combat with durable exact Undo', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/characters/the-fool');
  await saved(page);
  const before = await readSaved(page, 'the-fool');
  await expect(pips(page, 'Level 1 spell slots', 0, 4)).toBeVisible();
  await expect(pips(page, 'Level 2 spell slots', 2, 2)).toBeVisible();
  await expect(pips(page, 'Bardic Inspiration', 3, 5)).toBeVisible();
  await expect(pips(page, 'd8 Hit Dice', 3, 3)).toBeVisible();
  await expect(concentration(page)).toContainText('None');
  await expect(effects(page)).toContainText('None');
  await expect(recent(page)).toContainText('No commands yet.');
  await expect(dashboardUndo(page)).toBeDisabled();
  await pips(page, 'Level 2 spell slots', 2, 2).click();
  expect(await readSaved(page, 'the-fool')).toEqual(before);
  await step(page, 'Restore', 'Level 1 spell slots').click();
  await step(page, 'Use', 'Bardic Inspiration').click();
  await saved(page);
  const beforeDice = await readSaved(page, 'the-fool');
  await step(page, 'Use', 'd8 Hit Dice').click();
  await saved(page);
  const changed = await readSaved(page, 'the-fool');
  expect(changed.build).toEqual(before.build);
  expect(changed.live).toEqual({ ...beforeDice.live, hitDiceSpent: { d8: 1 } });
  expect(changed.live.slotsUsed[1]).toBe(3);
  expect(changed.live.featureUsesSpent[INSPIRATION]).toBe(3);
  expect(changed.events.map(({ command }) => command)).toEqual([
    'adjustSlot',
    'adjustFeatureUses',
    'adjustHitDice',
  ]);
  await expect(hud(page).getByRole('img', { name: 'L1: 1 of 4 left', exact: true })).toBeVisible();
  await expect(hud(page).getByRole('img', { name: 'BI: 2 of 5 left', exact: true })).toBeVisible();
  await page.reload();
  await saved(page);
  expect(await readSaved(page, 'the-fool')).toEqual(changed);
  await page.getByRole('link', { name: 'Spells', exact: true }).filter({ visible: true }).click();
  await expect(
    main(page).getByRole('img', { name: 'Level 1 spell slots: 1 of 4 left', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Combat', exact: true }).filter({ visible: true }).click();
  await main(page).getByRole('tab', { name: 'Spells', exact: true }).click();
  await expect(
    main(page).getByRole('img', { name: 'Level 1 spell slots: 1 of 4 left', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Home', exact: true }).filter({ visible: true }).click();
  await undo(page);
  const undone = await readSaved(page, 'the-fool');
  expect(undone.live).toEqual(beforeDice.live);
  expect(undone.events.at(-2)?.undoneBy).toBe(undone.events.at(-1)?.id);
  await expect(pips(page, 'd8 Hit Dice', 3, 3)).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`dashboard-live-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
    fullPage: true,
  });
});

test('resource previews show current values and final-charge corrections preserve usable focus', async ({
  page,
  isMobile,
}) => {
  const file = dashboardFile('dashboard-resource-details');
  file.live.featureUsesSpent[INSPIRATION] = 4;
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  const trigger = resources(page).getByRole('button', { name: /^Bardic Inspiration/ });
  if (!isMobile) {
    await trigger.hover();
    await expect(page.getByRole('tooltip')).toContainText('1 of 5 left');
  }
  await trigger.click();
  const detail = isMobile
    ? page.getByRole('dialog', { name: 'Bardic Inspiration', exact: true })
    : panel(page);
  await expect(detail).toContainText('1 of 5 left');
  await expect(detail).toContainText(/long rest/i);
  if (isMobile) {
    await closeDetail(detail, true);
    await expect(trigger).toBeFocused();
  }
  await step(page, 'Use', 'Bardic Inspiration').focus();
  await page.keyboard.press('Enter');
  await saved(page);
  await expect(step(page, 'Use', 'Bardic Inspiration')).toBeDisabled();
  await visibleEnabledFocus(page);
  if (isMobile) await trigger.click();
  await expect(detail).toContainText('0 of 5 left');
  if (isMobile) await closeDetail(detail, true);
  await step(page, 'Restore', 'Bardic Inspiration').click();
  await saved(page);
  if (isMobile) await trigger.click();
  await expect(detail).toContainText('1 of 5 left');
  await closeDetail(detail, isMobile);
  expect((await readSaved(page, file.build.id)).live).toEqual(initial.live);
  await noOverflow(page);
});

test('a newly created blank character computes its own values and inherits no Fool shortcuts', async ({
  page,
}) => {
  await page.goto('/campaigns/campaign-273/characters/new');
  await saved(page);
  await page.getByLabel('Name', { exact: true }).fill('First dashboard');
  await page.getByLabel('Race', { exact: true }).selectOption('race.human');
  await page.getByLabel('Class', { exact: true }).selectOption('class.bard');
  await page.getByLabel('Background', { exact: true }).selectOption('background.charlatan');
  for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
    await page.getByLabel(`${ability} base`, { exact: true }).fill('10');
  }
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/[^/]+$/);
  await saved(page);
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  const initial = await readSaved(page, id);
  await expect(pips(page, 'Level 1 spell slots', 2, 2)).toBeVisible();
  await expect(pips(page, 'Bardic Inspiration', 1, 1)).toBeVisible();
  await expect(pips(page, 'd8 Hit Dice', 1, 1)).toBeVisible();
  await expect(resources(page).getByRole('button', { name: 'Level 2', exact: true })).toHaveCount(
    0,
  );
  for (const name of ['Healing Word', 'Vicious Mockery', 'Cutting Words', 'Rapier']) {
    await expect(quickTrigger(page, name)).toHaveCount(0);
  }
  const abilities = main(page).getByRole('region', { name: 'Abilities', exact: true });
  await expect(abilities).not.toContainText('+5');
  await expect(abilities).toContainText('Perception');
  await expect(abilities).toContainText('10');
  await expect(concentration(page)).toContainText('None');
  await expect(effects(page)).toContainText('None');
  await expect(conditions(page)).toContainText('None');
  const manage = quick(page).getByRole('button', { name: 'Manage quick access', exact: true });
  await manage.click();
  const manager = page.getByRole('dialog', { name: 'Manage quick access', exact: true });
  await expect(manager.getByRole('checkbox', { name: 'Healing Word', exact: true })).toHaveCount(0);
  await expect(manager.getByRole('checkbox', { name: 'Rapier', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(manage).toBeFocused();
  expect(await readSaved(page, id)).toEqual(initial);
  await noOverflow(page);
});

test('imported Pact Magic and mixed Hit Dice use their own pools and explicit overspend correction', async ({
  page,
}) => {
  const file = dashboardFile('dashboard-imported-pools');
  file.build.classes = [
    { classId: 'class.warlock', level: 2 },
    { classId: 'class.fighter', level: 1 },
  ];
  file.build.hpEntries = [
    { level: 1, classId: 'class.warlock', value: 8, method: 'max' },
    { level: 2, classId: 'class.warlock', value: 5, method: 'rolled' },
    { level: 3, classId: 'class.fighter', value: 6, method: 'rolled' },
  ];
  file.build.spells = [];
  file.build.items = [];
  file.live.items = {};
  file.live.pactSlotsUsed = 1;
  file.live.hitDiceSpent = { d8: 1, d10: 3 };
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await expect(pips(page, 'Pact Magic slots', 1, 2)).toBeVisible();
  await expect(pips(page, 'd8 Hit Dice', 1, 2)).toBeVisible();
  await expect(pips(page, 'd10 Hit Dice', 0, 1)).toBeVisible();
  await expect(resources(page)).not.toContainText('Bardic Inspiration');
  await expect(resources(page).getByRole('button', { name: 'Level 2', exact: true })).toHaveCount(
    0,
  );
  await expect(step(page, 'Use', 'd10 Hit Dice')).toBeDisabled();
  await expect(step(page, 'Restore', 'd10 Hit Dice')).toBeDisabled();
  expect(await readSaved(page, file.build.id)).toEqual(initial);
  await resources(page)
    .getByRole('button', { name: 'Correct d10 Hit Dice spending', exact: true })
    .click();
  await saved(page);
  const corrected = await readSaved(page, file.build.id);
  expect(corrected.live).toEqual({ ...initial.live, hitDiceSpent: { d8: 1, d10: 1 } });
  expect(corrected.events.at(-1)?.command).toBe('adjustHitDice');
  await page.reload();
  await saved(page);
  await undo(page);
  expect((await readSaved(page, file.build.id)).live).toEqual(initial.live);
  await step(page, 'Use', 'Pact Magic slots').click();
  await saved(page);
  const spent = await readSaved(page, file.build.id);
  expect(spent.live.pactSlotsUsed).toBe(2);
  expect(spent.live.slotsUsed).toEqual(initial.live.slotsUsed);
  expect(spent.live.featureUsesSpent).toEqual(initial.live.featureUsesSpent);
  await noOverflow(page);
});

test('concentration stays separate from personal effects while conditions and 2014 exhaustion share commands', async ({
  page,
}) => {
  const file = dashboardFile('dashboard-status');
  const now = file.live.clock.seconds;
  file.live.conditions = ['prone'];
  file.live.concentration = { spellId: 'spell.faerie-fire', slotLevel: 1, endsAt: now + 60 };
  file.live.effects = [
    {
      id: 'effect.borrowed-invisibility',
      name: 'Borrowed Invisibility',
      concentration: false,
      endsAt: now + 120,
      conditions: ['invisible'],
      modifiers: [],
    },
  ];
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await expect(concentration(page)).toContainText('Faerie Fire');
  await expect(concentration(page)).toContainText('1 min');
  await expect(effects(page)).not.toContainText('Faerie Fire');
  await expect(effects(page)).toContainText('Borrowed Invisibility');
  await expect(conditions(page)).toContainText(/prone/i);
  await expect(conditions(page)).toContainText(/invisible/i);
  const edit = conditions(page).getByRole('button', { name: 'Edit conditions', exact: true });
  await edit.click();
  const status = page.getByRole('dialog', { name: 'Conditions and effects', exact: true });
  await status.getByRole('checkbox', { name: /^poisoned$/i }).check();
  await status.getByRole('combobox', { name: 'Exhaustion', exact: true }).selectOption('2');
  await status.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(edit).toBeFocused();
  await saved(page);
  await expect(conditions(page)).toContainText(/poisoned/i);
  await expect(conditions(page)).toContainText('Exhaustion (2014): 2');
  await expect(hud(page).getByTitle('Speed', { exact: true })).toContainText('15');
  const statusChanged = await readSaved(page, file.build.id);
  expect(statusChanged.live).toEqual({
    ...initial.live,
    conditions: ['prone', 'poisoned'],
    exhaustion: 2,
  });
  expect(statusChanged.events.map(({ command }) => command)).toEqual([
    'toggleCondition',
    'setExhaustion',
  ]);
  await effects(page)
    .getByRole('button', { name: 'End effect: Borrowed Invisibility', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await saved(page);
  await expect(effects(page)).toBeFocused();
  await expect(conditions(page)).not.toContainText(/invisible/i);
  await expect(concentration(page)).toContainText('Faerie Fire');
  await undo(page);
  expect((await readSaved(page, file.build.id)).live).toEqual(statusChanged.live);
  await concentration(page)
    .getByRole('button', { name: 'End concentration on Faerie Fire', exact: true })
    .click();
  await saved(page);
  await expect(concentration(page)).toBeFocused();
  const ended = await readSaved(page, file.build.id);
  expect(ended.live.effects).toEqual(initial.live.effects);
  expect(ended.live.concentration).toBeUndefined();
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(ended);
  await undo(page);
  expect((await readSaved(page, file.build.id)).live).toEqual(statusChanged.live);
  await noOverflow(page);
});

test('quick access favorite choices sync with Spellbook stars and Undo without fixture defaults', async ({
  page,
}) => {
  await page.goto('/characters/the-fool');
  await saved(page);
  const initial = await readSaved(page, 'the-fool');
  await expect(quickTrigger(page, 'Healing Word')).toHaveCount(0);
  const manage = quick(page).getByRole('button', { name: 'Manage quick access', exact: true });
  await manage.click();
  const manager = page.getByRole('dialog', { name: 'Manage quick access', exact: true });
  await manager.getByRole('checkbox', { name: 'Healing Word', exact: true }).check();
  await manager.getByRole('checkbox', { name: 'Cutting Words', exact: true }).check();
  await page.keyboard.press('Escape');
  await expect(manage).toBeFocused();
  await saved(page);
  await expect(quickTrigger(page, 'Healing Word')).toBeVisible();
  await expect(quickTrigger(page, 'Cutting Words')).toBeVisible();
  const favorites = await readSaved(page, 'the-fool');
  expect(favorites.live).toEqual(initial.live);
  expect(favorites.build.favorites).toEqual(['spell.healing-word', 'feature.bard.cutting-words']);
  await page.getByRole('link', { name: 'Spells', exact: true }).filter({ visible: true }).click();
  const unfavorite = main(page).getByRole('button', {
    name: 'Favorite Healing Word',
    exact: true,
  });
  await expect(unfavorite).toBeVisible();
  await expect(unfavorite).toHaveAttribute('aria-pressed', 'true');
  await unfavorite.click();
  await saved(page);
  await page.getByRole('link', { name: 'Home', exact: true }).filter({ visible: true }).click();
  await expect(quickTrigger(page, 'Healing Word')).toHaveCount(0);
  await expect(quickTrigger(page, 'Cutting Words')).toBeVisible();
  await page.reload();
  await saved(page);
  await undo(page);
  const restored = await readSaved(page, 'the-fool');
  expect(restored.build).toEqual(favorites.build);
  expect(restored.live).toEqual(initial.live);
  await expect(quickTrigger(page, 'Healing Word')).toBeVisible();
  await noOverflow(page);
});

test('quick spell, weapon and final shared feature use run the same live commands and retain focus', async ({
  page,
  isMobile,
}, info) => {
  const file = dashboardFile('dashboard-quick-actions');
  file.build.favorites = ['spell.faerie-fire', 'feature.bard.cutting-words', 'item.rapier'];
  file.live.featureUsesSpent[INSPIRATION] = 4;
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
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  let detail = await openDetail(page, 'Faerie Fire', isMobile);
  await detail.getByRole('button', { name: 'Cast Faerie Fire (L1)', exact: true }).click();
  await saved(page);
  const cast = await readSaved(page, file.build.id);
  expect(cast.events.at(-1)?.command).toBe('castSpell');
  expect(cast.live.slotsUsed[1]).toBe(1);
  expect(cast.live.concentration?.spellId).toBe('spell.faerie-fire');
  expect(cast.live.effects).toEqual([]);
  await expect(concentration(page)).toContainText('10 rounds left');
  if (!isMobile) await closeDetail(detail, false);
  await undo(page);
  expect((await readSaved(page, file.build.id)).live).toEqual(initial.live);

  detail = await openDetail(page, 'Rapier', isMobile);
  await expect(detail).toContainText('1d8+2');
  await detail.getByRole('button', { name: 'Attack with Rapier', exact: true }).click();
  await saved(page);
  const attacked = await readSaved(page, file.build.id);
  expect(attacked.live.combat?.economy.actionUsed).toBe(true);
  expect(attacked.live.hp).toBe(initial.live.hp);
  expect(attacked.events.at(-1)?.command).toBe('takeCombatAction');
  if (!isMobile) await closeDetail(detail, false);
  await undo(page);

  detail = await openDetail(page, 'Cutting Words', isMobile);
  await detail.getByRole('button', { name: 'Use Cutting Words', exact: true }).click();
  await saved(page);
  const depleted = await readSaved(page, file.build.id);
  expect(depleted.live.featureUsesSpent[INSPIRATION]).toBe(5);
  expect(depleted.live.combat?.economy.reactionUsed).toBe(true);
  expect(depleted.events.at(-1)?.command).toBe('useFeature');
  await visibleEnabledFocus(page);
  if (isMobile) {
    await expect(detail).toBeHidden();
    await expect(quickTrigger(page, 'Cutting Words')).toBeFocused();
    detail = await openDetail(page, 'Cutting Words', true);
  }
  await expect(
    detail.getByRole('button', { name: 'Use Cutting Words', exact: true }),
  ).toBeDisabled();
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`dashboard-quick-last-charge-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  await closeDetail(detail, isMobile);
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(depleted);
  await undo(page);
  expect((await readSaved(page, file.build.id)).live).toEqual(initial.live);
});

test('Dashboard recent history includes HP and rests, keeps five entries and restores exact state after reload Undo', async ({
  page,
  isMobile,
}, info) => {
  const file = dashboardFile('dashboard-rest-history');
  file.live.hp = 13;
  file.live.slotsUsed[1] = 2;
  await importCharacter(page, file);
  await hud(page).getByRole('button', { name: 'Adjust hit points', exact: true }).click();
  const hp = page.getByRole('dialog', { name: 'Hit points', exact: true });
  await hp.getByRole('tab', { name: 'Damage', exact: true }).click();
  await hp.getByRole('button', { name: '1', exact: true }).click();
  await hp.getByRole('button', { name: 'Apply', exact: true }).click();
  await saved(page);
  await expect(recent(page)).toContainText('13 → 12');
  const shortRest = await openRest(page, 'Short');
  await shortRest.getByRole('button', { name: 'Add Hit Die', exact: true }).click();
  await shortRest.getByLabel('d8 roll 1', { exact: true }).fill('2');
  await shortRest.getByRole('button', { name: 'Apply Short Rest', exact: true }).click();
  await saved(page);
  await expect(pips(page, 'd8 Hit Dice', 2, 3)).toBeVisible();
  await expect(recent(page)).toContainText('Short rest (1 h)');
  const longRest = await openRest(page, 'Long');
  await longRest.getByRole('button', { name: 'Apply Long Rest', exact: true }).click();
  await saved(page);
  await expect(pips(page, 'd8 Hit Dice', 3, 3)).toBeVisible();
  await expect(pips(page, 'Level 1 spell slots', 4, 4)).toBeVisible();
  await expect(recent(page)).toContainText('Long rest (8 h)');
  for (let count = 0; count < 3; count++) await step(page, 'Use', 'Level 1 spell slots').click();
  await saved(page);
  const beforeLast = await readSaved(page, file.build.id);
  await step(page, 'Use', 'Bardic Inspiration').click();
  await saved(page);
  const changed = await readSaved(page, file.build.id);
  expect(changed.events).toHaveLength(7);
  const recentRows = recent(page).getByRole('listitem');
  await expect(recentRows).toHaveCount(5);
  for (const [index, event] of [...changed.events].reverse().slice(0, 5).entries()) {
    await expect(recentRows.nth(index)).toContainText(event.text);
  }
  await expect(recent(page)).not.toContainText(changed.events[0]!.text);
  const view = log(page).getByRole('button', { name: 'View full log', exact: true });
  await view.click();
  const history = page.getByRole('dialog', { name: 'Dashboard log', exact: true });
  await expect(history.getByRole('listitem')).toHaveCount(7);
  await expect(history).toContainText('Day 1, 08:00');
  await expect(history).toContainText(changed.events[0]!.text);
  await page.keyboard.press('Escape');
  await expect(view).toBeFocused();
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(changed);
  await undo(page);
  const undone = await readSaved(page, file.build.id);
  expect(undone.live).toEqual(beforeLast.live);
  expect(undone.build).toEqual(beforeLast.build);
  expect(undone.events.at(-2)?.undoneBy).toBe(undone.events.at(-1)?.id);
  await expect(recent(page)).toContainText('Undone');
  await noOverflow(page);
  await recent(page).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath(`dashboard-recent-log-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
});

test('tablet Dashboard, resource drawer and quick access manager fit at 768 px', async ({
  page,
  isMobile,
}, info) => {
  test.skip(isMobile, 'tablet uses the desktop pointer context');
  await page.setViewportSize({ width: 768, height: 1024 });
  const file = dashboardFile('dashboard-tablet');
  file.build.favorites = ['spell.healing-word', 'feature.bard.cutting-words', 'item.rapier'];
  await importCharacter(page, file);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath('dashboard-tablet-768.png'),
    animations: 'disabled',
    fullPage: true,
  });
  await resources(page).getByRole('button', { name: 'Level 1', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Details', exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('4 of 4 left');
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath('dashboard-tablet-detail-768.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await quick(page).getByRole('button', { name: 'Manage quick access', exact: true }).click();
  const manager = page.getByRole('dialog', { name: 'Manage quick access', exact: true });
  await expect(manager.getByRole('checkbox', { name: 'Healing Word', exact: true })).toBeChecked();
  const bounds = await manager.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(768);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath('dashboard-tablet-manager-768.png'),
    animations: 'disabled',
  });
});

test('level 20 Hit Dice pips fit between separate 44 px adjustment buttons', async ({
  page,
  isMobile,
}, info) => {
  const file = dashboardFile('dashboard-level20-dice');
  file.build.classes = [{ classId: 'class.bard', subclassId: 'subclass.bard.lore', level: 20 }];
  file.build.hpEntries = Array.from({ length: 20 }, (_, index) => ({
    level: index + 1,
    classId: 'class.bard',
    value: index === 0 ? 8 : 4,
    method: index === 0 ? 'max' : 'rolled',
  }));
  await importCharacter(page, file);
  const dice = pips(page, 'd8 Hit Dice', 20, 20);
  await expect(dice).toBeVisible();
  await noOverflow(page);
  await dice.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({
    path: info.outputPath(`dashboard-level20-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  const [use, middle, restore] = await Promise.all([
    step(page, 'Use', 'd8 Hit Dice').boundingBox(),
    dice.boundingBox(),
    step(page, 'Restore', 'd8 Hit Dice').boundingBox(),
  ]);
  if (!use || !middle || !restore) throw new Error('Hit Dice stepper is not rendered');
  for (const button of [use, restore]) {
    expect(button.width).toBeGreaterThanOrEqual(44);
    expect(button.height).toBeGreaterThanOrEqual(44);
  }
  expect(use.x + use.width).toBeLessThanOrEqual(middle.x);
  expect(middle.x + middle.width).toBeLessThanOrEqual(restore.x);
});
