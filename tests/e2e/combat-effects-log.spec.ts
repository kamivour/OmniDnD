import type { Locator } from '@playwright/test';
import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import {
  ExportFileSchema,
  type ActiveEffect,
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
const concentration = (page: Page) =>
  main(page).getByRole('region', { name: 'Concentration', exact: true });
const effects = (page: Page) =>
  main(page).getByRole('region', { name: 'Effects on you', exact: true });
const log = (page: Page) => page.getByRole('region', { name: 'Character log', exact: true });
const history = (page: Page) => page.getByRole('dialog', { name: 'Character log', exact: true });
const combatUndo = (page: Page) =>
  log(page).getByRole('button', { name: 'Undo last command', exact: true });
const viewLog = (page: Page) =>
  log(page).getByRole('button', { name: 'View full log', exact: true });
const turnButton = (page: Page, name: string) =>
  main(page).getByRole('button', { name, exact: true });
const effectRow = (page: Page, name: string) =>
  effects(page).getByRole('listitem').filter({ hasText: name });

async function saved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
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
  file.live.hp = 19;
  file.live.slotsUsed = Array.from({ length: 10 }, () => 0);
  file.live.effects = [];
  file.live.conditions = [];
  delete file.live.concentration;
  file.events = [];
  file.live.combat = {
    round: 3,
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

function effect(id: string, name: string, endsAt?: number): ActiveEffect {
  return {
    id,
    name,
    concentration: false,
    conditions: [],
    modifiers: [],
    ...(endsAt === undefined ? {} : { endsAt }),
  };
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

async function undo(page: Page) {
  await combatUndo(page).click();
  await saved(page);
}

async function expectHistory(list: Locator, events: readonly LogEvent[]) {
  const rows = list.locator('[data-source="character"]');
  await expect(rows).toHaveCount(events.length);
  for (const [index, event] of [...events].reverse().entries()) {
    const row = rows.nth(index);
    await expect(row).toContainText(event.text);
    if (event.override) await expect(row).toContainText('Override');
    if (event.undoneBy) await expect(row).toContainText('Undone');
  }
}

test('a cast on others has a saved round countdown without becoming an effect on you', async ({
  page,
  isMobile,
}, info) => {
  const file = combatFile('effects-faerie-fire');
  file.live.effects = [effect('effect.borrowed-ward', 'Borrowed Ward')];
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await expect(concentration(page)).toContainText('None');
  await expect(effects(page)).toContainText('Borrowed Ward');
  expect(initial.events).toEqual([]);
  await viewLog(page).click();
  await expect(history(page).locator('[data-source="character"]')).toHaveCount(0);
  await expect(history(page).locator('[data-source="workspace"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(viewLog(page)).toBeFocused();
  const row = main(page)
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: /^Faerie Fire\b/ }) });
  await row.getByRole('button', { name: /^Cast\b/ }).click();
  const flow = page.getByRole('dialog', { name: 'Cast Faerie Fire', exact: true });
  await flow.getByRole('button', { name: 'Cast Faerie Fire (L1)', exact: true }).click();
  await expect(flow).toBeHidden();
  await saved(page);
  const cast = await readSaved(page, file.build.id);
  expect(cast.live.concentration).toEqual({
    spellId: 'spell.faerie-fire',
    slotLevel: 1,
    endsAt: initial.live.clock.seconds + 60,
  });
  expect(cast.live.effects).toEqual(initial.live.effects);
  expect(cast.live.slotsUsed[1]).toBe(1);
  expect(cast.events.map((event) => event.command)).toEqual(['castSpell']);
  await expect(concentration(page)).toContainText('Faerie Fire');
  await expect(concentration(page)).toContainText('10 rounds left');
  await expect(effects(page)).not.toContainText('Faerie Fire');
  await expect(effects(page)).toContainText('Until removed');
  await expect(main(page)).not.toContainText('Effects and log shown here are previews');

  await turnButton(page, 'End Turn').click();
  await expect(concentration(page)).toContainText('10 rounds left');
  await turnButton(page, 'Start Turn').click();
  await saved(page);
  await expect(concentration(page)).toContainText('9 rounds left');
  const beforeEnd = await readSaved(page, file.build.id);
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(beforeEnd);
  await expect(concentration(page)).toContainText('9 rounds left');
  const end = concentration(page).getByRole('button', {
    name: 'End concentration on Faerie Fire',
    exact: true,
  });
  await end.scrollIntoViewIfNeeded();
  expect(
    await end.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      return [
        [center.x - 21, center.y],
        [center.x + 21, center.y],
        [center.x, center.y - 21],
        [center.x, center.y + 21],
      ].every(([x, y]) => element.contains(document.elementFromPoint(x!, y!)));
    }),
  ).toBe(true);
  await end.focus();
  await page.keyboard.press('Enter');
  await saved(page);
  await expect(concentration(page)).toBeFocused();
  await expect(concentration(page)).toContainText('None');
  const ended = await readSaved(page, file.build.id);
  const expectedLive = structuredClone(beforeEnd.live);
  delete expectedLive.concentration;
  expect(ended.build).toEqual(initial.build);
  expect(ended.live).toEqual(expectedLive);
  expect(ended.events.at(-1)?.command).toBe('endConcentration');
  await undo(page);
  expect((await readSaved(page, file.build.id)).live).toEqual(beforeEnd.live);
  await expect(concentration(page)).toContainText('9 rounds left');
  await noOverflow(page);
  await effects(page).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath(`combat-effects-live-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });
});

test('Start Turn expires due effects and linked concentration at exact saved clock boundaries', async ({
  page,
}) => {
  const file = combatFile('effects-expiry');
  const now = file.live.clock.seconds;
  file.live.combat!.turnActive = false;
  file.live.conditions = ['prone'];
  file.live.concentration = {
    spellId: 'spell.invisibility',
    slotLevel: 2,
    effectId: 'effect.self-invisibility',
    endsAt: now + 7,
    pendingSaves: [{ id: 'imported-damage-check', dc: 10 }],
  };
  const linked: ActiveEffect = {
    ...effect('effect.self-invisibility', 'Invisibility', now + 120),
    sourceId: 'spell.invisibility',
    concentration: true,
    conditions: ['invisible'],
  };
  const short: ActiveEffect = {
    ...effect('effect.short-ward', 'Brief Ward', now + 6),
    conditions: ['blinded'],
  };
  const indefinite = effect('effect.indefinite-ward', 'Lasting Ward');
  file.live.effects = [linked, short, indefinite];
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await expect(concentration(page)).toContainText('2 rounds left');
  await expect(effectRow(page, 'Invisibility')).toContainText('2 rounds left');
  await expect(effectRow(page, 'Brief Ward')).toContainText('1 round left');
  await turnButton(page, 'Start Turn').click();
  await saved(page);
  const first = await readSaved(page, file.build.id);
  expect(first.build).toEqual(initial.build);
  expect(first.live).toEqual({
    ...initial.live,
    clock: { seconds: now + 6 },
    combat: { ...initial.live.combat!, round: 4, turnActive: true },
    effects: [linked, indefinite],
  });
  expect(first.events.at(-1)?.text).toContain('Brief Ward ended');
  await expect(concentration(page)).toContainText('1 round left');
  await expect(effectRow(page, 'Invisibility')).toContainText('1 round left');
  await expect(effects(page)).not.toContainText('Brief Ward');
  await turnButton(page, 'End Turn').click();
  await saved(page);
  const beforeExpiry = await readSaved(page, file.build.id);
  expect(beforeExpiry.live.clock.seconds).toBe(now + 6);
  await expect(concentration(page)).toContainText('1 round left');
  await turnButton(page, 'Start Turn').click();
  await saved(page);
  const expired = await readSaved(page, file.build.id);
  const expectedLive = {
    ...beforeExpiry.live,
    clock: { seconds: now + 12 },
    combat: { ...beforeExpiry.live.combat!, round: 5, turnActive: true },
    effects: [indefinite],
  };
  delete expectedLive.concentration;
  expect(expired.live).toEqual(expectedLive);
  expect(expired.live.conditions).toEqual(['prone']);
  expect(expired.events.at(-1)?.command).toBe('startTurn');
  expect(expired.events.at(-1)?.text).toContain('Invisibility ended');
  await expect(concentration(page)).toContainText('None');
  await expect(effects(page)).not.toContainText('Invisibility');
  await expect(log(page)).toContainText('Invisibility ended');
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(expired);
  await undo(page);
  const undone = await readSaved(page, file.build.id);
  expect(undone.live).toEqual(beforeExpiry.live);
  expect(undone.events.at(-2)?.undoneBy).toBe(undone.events.at(-1)?.id);
  await expect(concentration(page)).toContainText('1 round left');
  await expect(effectRow(page, 'Invisibility')).toContainText('1 round left');
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(undone);
  await noOverflow(page);
});

test('ending an unrelated or linked self effect uses its own command and restores removal focus', async ({
  page,
}) => {
  const file = combatFile('effects-manual-end');
  file.live.concentration = {
    spellId: 'spell.invisibility',
    slotLevel: 2,
    effectId: 'effect.self-invisibility',
    endsAt: file.live.clock.seconds + 60,
    pendingSaves: [{ id: 'saved-pending-check', dc: 11 }],
  };
  file.live.effects = [
    {
      ...effect('effect.self-invisibility', 'Invisibility'),
      sourceId: 'spell.invisibility',
      concentration: true,
      conditions: ['invisible'],
    },
    effect('effect.borrowed-bless', 'Borrowed Bless'),
  ];
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  const endOther = effects(page).getByRole('button', {
    name: 'End effect: Borrowed Bless',
    exact: true,
  });
  await endOther.scrollIntoViewIfNeeded();
  const endBounds = await endOther.boundingBox();
  expect(endBounds?.width).toBeGreaterThanOrEqual(44);
  expect(endBounds?.height).toBeGreaterThanOrEqual(44);
  await endOther.focus();
  await page.keyboard.press('Space');
  await saved(page);
  await expect(effects(page)).toBeFocused();
  const endedOther = await readSaved(page, file.build.id);
  expect(endedOther.live).toEqual({ ...initial.live, effects: [initial.live.effects[0]] });
  expect(endedOther.events.at(-1)?.command).toBe('removeEffect');
  await expect(concentration(page)).toContainText('Invisibility');
  await undo(page);
  expect((await readSaved(page, file.build.id)).live).toEqual(initial.live);

  await effects(page)
    .getByRole('button', { name: 'End effect: Invisibility', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await saved(page);
  await expect(effects(page)).toBeFocused();
  const endedSelf = await readSaved(page, file.build.id);
  const expectedLive = { ...initial.live, effects: [initial.live.effects[1]] };
  delete expectedLive.concentration;
  expect(endedSelf.build).toEqual(initial.build);
  expect(endedSelf.live).toEqual(expectedLive);
  expect(endedSelf.events.at(-1)?.text).toContain('concentration on Invisibility ended');
  await expect(concentration(page)).toContainText('None');
  await expect(effects(page)).toContainText('Borrowed Bless');
  await expect(effects(page)).not.toContainText('Invisibility');
  await page.reload();
  await saved(page);
  await undo(page);
  expect((await readSaved(page, file.build.id)).live).toEqual(initial.live);
  await expect(concentration(page)).toContainText('Invisibility');
  await expect(effectRow(page, 'Invisibility')).toContainText('10 rounds left');
});

test('imported timers distinguish game time, no timer, and expired entries without silently changing state', async ({
  page,
  isMobile,
}, info) => {
  const file = combatFile('effects-imported-timers');
  delete file.live.combat;
  file.live.concentration = { spellId: 'spell.faerie-fire' };
  const longName = 'A borrowed protection with a deliberately long imported effect name';
  file.live.effects = [
    effect('effect.long-import', longName),
    effect('effect.seven-seconds', 'Seven Second Ward', file.live.clock.seconds + 7),
    effect('effect.expired-import', 'Expired Imported Ward', file.live.clock.seconds),
  ];
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await expect(concentration(page)).toContainText('No timer');
  await expect(effectRow(page, longName)).toContainText('Until removed');
  await expect(effectRow(page, 'Seven Second Ward')).toContainText('7 s left');
  await expect(effectRow(page, 'Expired Imported Ward')).toContainText('Expired');
  await expect(viewLog(page)).toContainText(
    'Workspace · Import character: effects-imported-timers',
  );
  await expect(combatUndo(page)).toBeEnabled();
  const longLabel = effectRow(page, longName).getByText(longName, { exact: true });
  expect(
    await longLabel.evaluate(
      (element) =>
        element.getBoundingClientRect().height > parseFloat(getComputedStyle(element).lineHeight),
    ),
  ).toBe(true);
  expect(initial.live).toEqual(file.live);
  expect(initial.events).toEqual([]);
  await noOverflow(page);
  await longLabel.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath(`combat-effects-imported-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(initial);
  await turnButton(page, 'Start combat').click();
  await saved(page);
  await expect(effectRow(page, 'Seven Second Ward')).toContainText('2 rounds left');
  await expect(effectRow(page, 'Expired Imported Ward')).toContainText('Expired');
  await expect(concentration(page)).toContainText('No timer');
  const started = await readSaved(page, file.build.id);
  expect(started.live.effects).toEqual(initial.live.effects);
  expect(started.live.clock).toEqual(initial.live.clock);
  await noOverflow(page);
});

test('the full saved log includes older commands, warning overrides, and durable linear Undo', async ({
  page,
  isMobile,
}, info) => {
  const file = combatFile('effects-full-log');
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  const expectLogInViewport = async () => {
    const bounds = await log(page).boundingBox();
    expect(bounds?.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await expect(viewLog(page)).toBeInViewport({ ratio: 1 });
    await expect(combatUndo(page)).toBeInViewport({ ratio: 1 });
  };
  await expectLogInViewport();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expectLogInViewport();
  await page.screenshot({
    path: info.outputPath(`combat-log-sticky-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  const move = page
    .getByRole('region', { name: 'Turn economy', exact: true })
    .getByRole('button', { name: 'Use 5 ft of movement', exact: true });
  for (let count = 0; count < 6; count++) await move.click();
  await saved(page);
  const beforeOverride = await readSaved(page, file.build.id);
  await move.click();
  const warning = page.getByRole('dialog', { name: 'Check this action', exact: true });
  await expect(warning).toContainText('Only 0 ft of movement left');
  await warning.getByRole('button', { name: 'Do anyway', exact: true }).click();
  await saved(page);
  const overridden = await readSaved(page, file.build.id);
  expect(overridden.events).toHaveLength(7);
  expect(overridden.events.at(-1)?.override).toBe(true);
  expect(overridden.live.combat?.economy.movementUsed).toBe(35);
  expect(overridden.build).toEqual(initial.build);
  await expect(log(page)).toContainText(overridden.events.at(-1)!.text);
  if (!isMobile) {
    const recent = main(page).getByRole('region', { name: 'Recent commands', exact: true });
    await expect(recent.getByRole('listitem')).toHaveCount(5);
    await expect(recent).not.toContainText(overridden.events[0]!.text);
  }
  await viewLog(page).focus();
  await page.keyboard.press('Enter');
  await expect(history(page)).toBeVisible();
  await expectHistory(
    history(page).getByRole('list', { name: 'Command history', exact: true }),
    overridden.events,
  );
  await expect(history(page)).toContainText('Day 1, 08:00');
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`combat-full-log-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(history(page)).toBeHidden();
  await expect(viewLog(page)).toBeFocused();
  await combatUndo(page).focus();
  await page.keyboard.press('Space');
  await saved(page);
  const undone = await readSaved(page, file.build.id);
  expect(undone.build).toEqual(initial.build);
  expect(undone.live).toEqual(beforeOverride.live);
  expect(undone.events.at(-2)?.undoneBy).toBe(undone.events.at(-1)?.id);
  expect(undone.events.at(-1)?.command).toBe('undo');
  await expect(log(page)).toContainText(undone.events.at(-1)!.text);
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(undone);
  await viewLog(page).click();
  await expectHistory(
    history(page).getByRole('list', { name: 'Command history', exact: true }),
    undone.events,
  );
  await page.keyboard.press('Escape');
  await undo(page);
  const twiceUndone = await readSaved(page, file.build.id);
  expect(twiceUndone.live.combat?.economy.movementUsed).toBe(25);
  expect(twiceUndone.events.at(-1)?.text).toBe(`Undo: ${beforeOverride.events.at(-1)!.text}`);
  await expect(log(page)).toContainText(twiceUndone.events.at(-1)!.text);
  await noOverflow(page);
});

test('an empty log and exhausted Undo retain usable keyboard focus and complete history', async ({
  page,
}) => {
  await page.goto('/characters/the-fool/combat');
  await saved(page);
  const initial = await readSaved(page, 'the-fool');
  await expect(log(page)).toContainText('No commands yet.');
  await expect(combatUndo(page)).toBeDisabled();
  await viewLog(page).click();
  await expect(history(page)).toContainText('No commands yet.');
  await page.keyboard.press('Escape');
  await expect(viewLog(page)).toBeFocused();
  await turnButton(page, 'Start combat').click();
  await saved(page);
  await expect(combatUndo(page)).toBeEnabled();
  await combatUndo(page).focus();
  await page.keyboard.press('Enter');
  await saved(page);
  const undone = await readSaved(page, 'the-fool');
  expect(undone.build).toEqual(initial.build);
  expect(undone.live).toEqual(initial.live);
  expect(undone.events.map((event) => event.command)).toEqual(['startCombat', 'undo']);
  expect(undone.events[0]?.undoneBy).toBe(undone.events[1]?.id);
  await expect(combatUndo(page)).toBeDisabled();
  await expect(viewLog(page)).toBeFocused();
  await viewLog(page).click();
  await expectHistory(
    history(page).getByRole('list', { name: 'Command history', exact: true }),
    undone.events,
  );
  await page.keyboard.press('Escape');
  await expect(viewLog(page)).toBeFocused();
  await page.reload();
  await saved(page);
  expect(await readSaved(page, 'the-fool')).toEqual(undone);
  await expect(combatUndo(page)).toBeDisabled();
  await noOverflow(page);
});
