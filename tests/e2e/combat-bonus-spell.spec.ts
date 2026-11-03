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
const RULE = 'Bonus-action spell rule';
const main = (page: Page) => page.getByRole('main');
const row = (page: Page, name: string) =>
  main(page)
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: new RegExp(`^${name}\\b`) }) });
const warning = (page: Page) =>
  page.getByRole('dialog', { name: 'Check this action', exact: true });
const slot = (detail: Locator, level: number) =>
  detail.getByRole('button', { name: new RegExp(`^L${level} `) });
const applyToMe = (detail: Locator) =>
  detail.getByRole('checkbox', { name: 'Apply to me', exact: true });
const healingRoll = (detail: Locator) => detail.getByLabel('Healing dice total', { exact: true });
const confirm = (detail: Locator, name: string, level = 0) =>
  detail.getByRole('button', {
    name: `Cast ${name}${level ? ` (L${level})` : ''}`,
    exact: true,
  });

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
  file.live.hp = 7;
  file.live.slotsUsed = Array.from({ length: 10 }, () => 0);
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

async function tab(page: Page, name: 'Actions' | 'Bonus' | 'React' | 'Spells') {
  await main(page).getByRole('tab', { name, exact: true }).click();
}

async function openCast(page: Page, name: string) {
  await row(page, name)
    .getByRole('button', { name: /^Cast\b/ })
    .click();
  const flow = page.getByRole('dialog', { name: `Cast ${name}`, exact: true });
  await expect(flow).toBeVisible();
  return flow;
}

async function cast(page: Page, name: string, level = 0) {
  const flow = await openCast(page, name);
  if (level) await slot(flow, level).click();
  await confirm(flow, name, level).click();
  await expect(warning(page)).toHaveCount(0);
  await expect(flow).toHaveCount(0);
  await saved(page);
}

async function undo(page: Page) {
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
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

test('Healing Word warns before a leveled action; Cancel, override, reload and Undo preserve the exact state', async ({
  page,
  isMobile,
}, info) => {
  const file = combatFile('bonus-spell-first');
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await tab(page, 'Bonus');
  const healing = await openCast(page, 'Healing Word');
  await applyToMe(healing).check();
  await healingRoll(healing).fill('1');
  await expect(healing.getByRole('status', { name: 'Healing preview' })).toHaveText(
    'Healing: 6 HP. Your HP: 7 → 13.',
  );
  await confirm(healing, 'Healing Word', 1).click();
  await expect(healing).toHaveCount(0);
  await saved(page);
  const healed = await readSaved(page, file.build.id);
  expect(healed.build).toEqual(initial.build);
  expect(healed.live).toEqual({
    ...initial.live,
    hp: 13,
    slotsUsed: initial.live.slotsUsed.map((used, level) => (level === 1 ? used + 1 : used)),
    combat: {
      ...initial.live.combat!,
      economy: {
        ...initial.live.combat!.economy,
        bonusUsed: true,
        bonusActionSpellCast: true,
        otherSpellCast: true,
      },
    },
  });
  expect(healed.events.map((event) => event.command)).toEqual(['castSpell']);
  await tab(page, 'Spells');
  await expect(row(page, 'Vicious Mockery')).toBeVisible();
  await expect(row(page, 'Dissonant Whispers')).toHaveCount(0);
  const showAll = main(page).getByRole('checkbox', { name: 'Show all spells', exact: true });
  await showAll.check();
  await expect(row(page, 'Dissonant Whispers')).toBeVisible();
  expect(await readSaved(page, file.build.id)).toEqual(healed);
  const whispers = await openCast(page, 'Dissonant Whispers');
  await slot(whispers, 2).click();
  const castWhispers = confirm(whispers, 'Dissonant Whispers', 2);
  await castWhispers.focus();
  await page.keyboard.press('Enter');
  await expect(warning(page)).toContainText(RULE);
  await expect(warning(page)).not.toContainText('Action already used');
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`bonus-spell-warning-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(whispers).toBeVisible();
  await expect(castWhispers).toBeFocused();
  await expect(slot(whispers, 2)).toHaveAttribute('aria-pressed', 'true');
  expect(await readSaved(page, file.build.id)).toEqual(healed);
  await castWhispers.click();
  await warning(page).getByRole('button', { name: 'Do anyway', exact: true }).click();
  await expect(whispers).toHaveCount(0);
  await saved(page);
  await expect(showAll).toBeChecked();
  const overridden = await readSaved(page, file.build.id);
  expect(overridden.build).toEqual(initial.build);
  expect(overridden.live).toEqual({
    ...healed.live,
    slotsUsed: healed.live.slotsUsed.map((used, level) => (level === 2 ? used + 1 : used)),
    combat: {
      ...healed.live.combat!,
      economy: { ...healed.live.combat!.economy, actionUsed: true },
    },
  });
  expect(overridden.events.map((event) => event.command)).toEqual(['castSpell', 'castSpell']);
  expect(overridden.events.map((event) => !!event.override)).toEqual([false, true]);
  expect(overridden.events[1]?.text).toContain('Dissonant Whispers');
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(overridden);
  await undo(page);
  expect((await readSaved(page, file.build.id)).live).toEqual(healed.live);
  await cast(page, 'Vicious Mockery');
  const cantrip = await readSaved(page, file.build.id);
  expect(cantrip.live.slotsUsed).toEqual(healed.live.slotsUsed);
  expect(cantrip.live.combat?.economy).toEqual({
    ...healed.live.combat!.economy,
    actionUsed: true,
  });
  expect(cantrip.events.at(-1)?.override).toBeUndefined();
  await undo(page);
  await undo(page);
  const restored = await readSaved(page, file.build.id);
  expect(restored.live).toEqual(initial.live);
  expect(restored.build).toEqual(initial.build);
});

test('the reverse order warns in preview casting, retains healing choices, and permits an action cantrip first', async ({
  page,
  isMobile,
}, info) => {
  const file = combatFile('bonus-spell-reverse');
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await cast(page, 'Dissonant Whispers', 1);
  const action = await readSaved(page, file.build.id);
  expect(action.live.combat?.economy).toEqual({
    ...initial.live.combat!.economy,
    actionUsed: true,
    otherSpellCast: true,
  });
  await tab(page, 'Bonus');
  await row(page, 'Healing Word')
    .getByRole('button', { name: /^Healing Word\b/ })
    .click();
  const preview = isMobile
    ? page.getByRole('dialog', { name: 'Healing Word', exact: true })
    : page.getByRole('complementary', { name: 'Pinned detail', exact: true });
  await slot(preview, 2).click();
  await applyToMe(preview).check();
  await healingRoll(preview).fill('3');
  const castHealing = confirm(preview, 'Healing Word', 2);
  await castHealing.click();
  await expect(warning(page)).toContainText(RULE);
  await expect(warning(page)).not.toContainText('Bonus action already used');
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(castHealing).toBeFocused();
  await expect(slot(preview, 2)).toHaveAttribute('aria-pressed', 'true');
  await expect(applyToMe(preview)).toBeChecked();
  await expect(healingRoll(preview)).toHaveValue('3');
  await expect(preview.getByRole('status', { name: 'Healing preview' })).toHaveText(
    'Healing: 8 HP. Your HP: 7 → 15.',
  );
  expect(await readSaved(page, file.build.id)).toEqual(action);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`bonus-spell-cancel-choices-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });
  await castHealing.click();
  await warning(page).getByRole('button', { name: 'Do anyway', exact: true }).click();
  await saved(page);
  if (isMobile) await expect(preview).toHaveCount(0);
  const overridden = await readSaved(page, file.build.id);
  expect(overridden.build).toEqual(initial.build);
  expect(overridden.live.hp).toBe(15);
  expect(overridden.live.slotsUsed).toEqual(
    initial.live.slotsUsed.map((used, level) => (level === 1 || level === 2 ? used + 1 : used)),
  );
  expect(overridden.live.combat?.economy).toEqual({
    ...action.live.combat!.economy,
    bonusUsed: true,
    bonusActionSpellCast: true,
  });
  expect(overridden.events.map((event) => !!event.override)).toEqual([false, true]);
  await undo(page);
  await undo(page);
  expect((await readSaved(page, file.build.id)).live).toEqual(initial.live);
  await tab(page, 'Actions');
  await cast(page, 'Vicious Mockery');
  const cantrip = await readSaved(page, file.build.id);
  expect(cantrip.live.combat?.economy.otherSpellCast).toBe(false);
  await tab(page, 'Bonus');
  await cast(page, 'Healing Word', 1);
  const legal = await readSaved(page, file.build.id);
  expect(legal.live.hp).toBe(initial.live.hp);
  expect(legal.live.slotsUsed[1]).toBe(1);
  expect(legal.events.at(-1)?.override).toBeUndefined();
});

test('a reaction spell on the bonus-spell turn warns, but the same reaction after End Turn is allowed', async ({
  page,
}) => {
  const file = combatFile('bonus-spell-reaction');
  file.build.classes.push({ classId: 'class.sorcerer', level: 1 });
  file.build.hpEntries.push({ level: 4, classId: 'class.sorcerer', value: 4, method: 'rolled' });
  file.build.spells.push({ classId: 'class.sorcerer', known: ['spell.shield'] });
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await tab(page, 'Bonus');
  await cast(page, 'Healing Word', 1);
  const bonus = await readSaved(page, file.build.id);
  await tab(page, 'Spells');
  await expect(row(page, 'Shield')).toHaveCount(0);
  await expect(row(page, 'Vicious Mockery')).toBeVisible();
  await main(page).getByRole('checkbox', { name: 'Show all spells', exact: true }).check();
  await expect(row(page, 'Shield')).toBeVisible();
  expect(await readSaved(page, file.build.id)).toEqual(bonus);
  await tab(page, 'React');
  const shield = await openCast(page, 'Shield');
  await confirm(shield, 'Shield', 1).click();
  await expect(warning(page)).toContainText(RULE);
  await expect(warning(page)).not.toContainText('Reaction already used');
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(confirm(shield, 'Shield', 1)).toBeFocused();
  expect(await readSaved(page, file.build.id)).toEqual(bonus);
  await shield.getByRole('button', { name: 'Close', exact: true }).click();
  await main(page).getByRole('button', { name: 'End Turn', exact: true }).click();
  await saved(page);
  const ended = await readSaved(page, file.build.id);
  expect(ended.live.combat).toEqual({
    ...bonus.live.combat!,
    turnActive: false,
    economy: {
      ...bonus.live.combat!.economy,
      bonusActionSpellCast: false,
      otherSpellCast: false,
    },
  });
  await cast(page, 'Shield', 1);
  const offTurn = await readSaved(page, file.build.id);
  expect(offTurn.build).toEqual(initial.build);
  expect(offTurn.live).toEqual({
    ...ended.live,
    slotsUsed: ended.live.slotsUsed.map((used, level) => (level === 1 ? used + 1 : used)),
    combat: {
      ...ended.live.combat!,
      economy: { ...ended.live.combat!.economy, reactionUsed: true },
    },
  });
  expect(offTurn.events.map((event) => event.command)).toEqual([
    'castSpell',
    'endTurn',
    'castSpell',
  ]);
  expect(offTurn.events.every((event) => !event.override)).toBe(true);
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(offTurn);
  await undo(page);
  expect((await readSaved(page, file.build.id)).live).toEqual(ended.live);
  await undo(page);
  expect((await readSaved(page, file.build.id)).live).toEqual(bonus.live);
});

test('a bonus-action cantrip activates the restriction without a slot and still permits a one-action cantrip', async ({
  page,
}) => {
  const file = combatFile('bonus-spell-cantrip');
  file.build.classes = [{ classId: 'class.druid', level: 3 }];
  file.build.hpEntries = file.build.hpEntries.map((entry) => ({
    ...entry,
    classId: 'class.druid',
  }));
  file.build.spells = [
    {
      classId: 'class.druid',
      known: ['spell.shillelagh', 'spell.produce-flame', 'spell.entangle'],
      prepared: ['spell.entangle'],
    },
  ];
  file.live.featureUsesSpent = {};
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await tab(page, 'Bonus');
  await cast(page, 'Shillelagh');
  const bonus = await readSaved(page, file.build.id);
  expect(bonus.build).toEqual(initial.build);
  expect(bonus.live).toEqual({
    ...initial.live,
    combat: {
      ...initial.live.combat!,
      economy: {
        ...initial.live.combat!.economy,
        bonusUsed: true,
        bonusActionSpellCast: true,
        otherSpellCast: true,
      },
    },
  });
  await tab(page, 'Actions');
  const entangle = await openCast(page, 'Entangle');
  await confirm(entangle, 'Entangle', 1).click();
  await expect(warning(page)).toContainText(RULE);
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await readSaved(page, file.build.id)).toEqual(bonus);
  await entangle.getByRole('button', { name: 'Close', exact: true }).click();
  await cast(page, 'Produce Flame');
  const legal = await readSaved(page, file.build.id);
  expect(legal.live.slotsUsed).toEqual(initial.live.slotsUsed);
  expect(legal.live.combat?.economy).toEqual({ ...bonus.live.combat!.economy, actionUsed: true });
  expect(legal.events.map((event) => event.command)).toEqual(['castSpell', 'castSpell']);
  expect(legal.events.every((event) => !event.override)).toBe(true);
});

test('Bardic Inspiration permits a leveled action spell; turn boundaries clear spell flags without restoring resources', async ({
  page,
}) => {
  const file = combatFile('bonus-spell-turn-reset');
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await tab(page, 'Bonus');
  await row(page, 'Bardic Inspiration')
    .getByRole('button', { name: /^Use\b/ })
    .click();
  await saved(page);
  const inspiration = await readSaved(page, file.build.id);
  expect(inspiration.live.combat?.economy).toEqual({
    ...initial.live.combat!.economy,
    bonusUsed: true,
  });
  expect(inspiration.live.featureUsesSpent[INSPIRATION]).toBe(
    initial.live.featureUsesSpent[INSPIRATION]! + 1,
  );
  await tab(page, 'Actions');
  await cast(page, 'Dissonant Whispers', 1);
  const action = await readSaved(page, file.build.id);
  expect(action.live.combat?.economy).toEqual({
    ...inspiration.live.combat!.economy,
    actionUsed: true,
    otherSpellCast: true,
  });
  await main(page).getByRole('button', { name: 'End Turn', exact: true }).click();
  await saved(page);
  const ended = await readSaved(page, file.build.id);
  expect(ended.live).toEqual({
    ...action.live,
    combat: {
      ...action.live.combat!,
      turnActive: false,
      economy: { ...action.live.combat!.economy, otherSpellCast: false },
    },
  });
  expect(ended.events.map((event) => event.command)).toEqual([
    'useFeature',
    'castSpell',
    'endTurn',
  ]);
  expect(ended.events.every((event) => !event.override)).toBe(true);
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(ended);
  await undo(page);
  expect((await readSaved(page, file.build.id)).live).toEqual(action.live);
  await main(page).getByRole('button', { name: 'End Turn', exact: true }).click();
  await saved(page);
  await main(page).getByRole('button', { name: 'Start Turn', exact: true }).click();
  await saved(page);
  const next = await readSaved(page, file.build.id);
  expect(next.build).toEqual(initial.build);
  expect(next.live).toEqual({
    ...ended.live,
    clock: { seconds: initial.live.clock.seconds + 6 },
    combat: {
      ...initial.live.combat!,
      round: 2,
    },
  });
  await tab(page, 'Bonus');
  await cast(page, 'Healing Word', 1);
  const newBonus = await readSaved(page, file.build.id);
  expect(newBonus.live.featureUsesSpent).toEqual(action.live.featureUsesSpent);
  expect(newBonus.live.slotsUsed[1]).toBe(2);
  expect(newBonus.events.at(-1)?.override).toBeUndefined();
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(newBonus);
  await undo(page);
  expect((await readSaved(page, file.build.id)).live).toEqual(next.live);
  await undo(page);
  expect((await readSaved(page, file.build.id)).live).toEqual(ended.live);
});

test('Manual mode bypasses the spell-rule warning while exhausted slots still prevent another cast', async ({
  page,
}) => {
  const file = combatFile('bonus-spell-manual');
  file.live.slotsUsed[1] = 2;
  file.live.slotsUsed[2] = 2;
  await importCharacter(page, file);
  await page.goto(`/characters/${file.build.id}/settings`);
  await saved(page);
  await page.getByRole('radio', { name: /^Manual/ }).check();
  await saved(page);
  await page.goto(`/characters/${file.build.id}/combat`);
  await saved(page);
  const initial = await readSaved(page, file.build.id);
  await tab(page, 'Bonus');
  await cast(page, 'Healing Word', 1);
  await tab(page, 'Actions');
  await cast(page, 'Dissonant Whispers', 1);
  const spent = await readSaved(page, file.build.id);
  expect(spent.build).toEqual(initial.build);
  expect(spent.live.slotsUsed[1]).toBe(4);
  expect(spent.live.slotsUsed[2]).toBe(2);
  expect(spent.events.map((event) => event.command)).toEqual(['castSpell', 'castSpell']);
  expect(spent.events.every((event) => !event.override)).toBe(true);
  const depleted = await openCast(page, 'Dissonant Whispers');
  await expect(depleted).toContainText('No available spell slots at this level or higher.');
  await expect(confirm(depleted, 'Dissonant Whispers', 1)).toBeDisabled();
  await expect(slot(depleted, 1)).toBeDisabled();
  await expect(slot(depleted, 2)).toBeDisabled();
  await expect(warning(page)).toHaveCount(0);
  expect(await readSaved(page, file.build.id)).toEqual(spent);
});
