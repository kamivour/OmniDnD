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
const row = (page: Page, name: RegExp) =>
  main(page)
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name }) });
const cuttingWords = (page: Page) => row(page, /^Cutting Words\b/);
const readied = (page: Page) => row(page, /^Readied action\b/);
const economy = (page: Page) => page.getByRole('region', { name: 'Turn economy', exact: true });
const warning = (page: Page) =>
  page.getByRole('dialog', { name: 'Check this action', exact: true });
const hud = (page: Page) => page.getByRole('banner', { name: 'Character HUD', exact: true });

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
    turnActive: false,
    economy: {
      actionUsed: true,
      bonusUsed: true,
      reactionUsed: false,
      movementUsed: 10,
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
  await main(page).getByRole('tab', { name: 'React', exact: true }).click();
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

test('Cutting Words works off-turn; another reaction warns and supports override and durable Undo', async ({
  page,
  isMobile,
}, info) => {
  const file = combatFile('reactions-cutting-words');
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await expect(cuttingWords(page)).toContainText('3 / 5');
  await cuttingWords(page)
    .getByRole('button', { name: /^Use\b/ })
    .focus();
  await page.keyboard.press('Enter');
  await saved(page);
  await expect(warning(page)).toHaveCount(0);
  await expect(cuttingWords(page)).toContainText('2 / 5');
  await expect(hud(page).getByRole('img', { name: 'BI: 2 of 5 left', exact: true })).toBeVisible();
  await expect(
    economy(page).getByRole('button', { name: 'React used', exact: true }),
  ).toBeVisible();
  const first = await readSaved(page, file.build.id);
  expect(first.build).toEqual(initial.build);
  expect(first.live).toEqual({
    ...initial.live,
    featureUsesSpent: { ...initial.live.featureUsesSpent, [INSPIRATION]: 3 },
    combat: {
      ...initial.live.combat!,
      economy: { ...initial.live.combat!.economy, reactionUsed: true },
    },
  });
  expect(first.events.map((event) => event.command)).toEqual(['useFeature']);
  const attack = row(page, /^Opportunity Attack \(Rapier\)/).getByRole('button', {
    name: /^Attack\b/,
  });
  if (isMobile) await attack.tap();
  else {
    await attack.focus();
    await page.keyboard.press('Space');
  }
  await expect(warning(page)).toContainText('Reaction already used');
  await expect(warning(page)).not.toContainText('Not your turn');
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(attack).toBeFocused();
  expect(await readSaved(page, file.build.id)).toEqual(first);
  await attack.click();
  await warning(page).getByRole('button', { name: 'Do anyway', exact: true }).click();
  await saved(page);
  const overridden = await readSaved(page, file.build.id);
  expect(overridden.live).toEqual(first.live);
  expect(overridden.build).toEqual(initial.build);
  expect(overridden.events.map((event) => event.command)).toEqual([
    'useFeature',
    'takeCombatAction',
  ]);
  expect(overridden.events[1]?.override).toBe(true);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`combat-reactions-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(overridden);
  await undo(page);
  expect((await readSaved(page, file.build.id)).live).toEqual(first.live);
  await undo(page);
  const restored = await readSaved(page, file.build.id);
  expect(restored.live).toEqual(initial.live);
  expect(restored.build).toEqual(initial.build);
});

test('a Readied action spends only a reaction; End Turn retains it and Start Turn regains it', async ({
  page,
}) => {
  const file = combatFile('reactions-readied');
  file.live.combat!.turnActive = true;
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await readied(page)
    .getByRole('button', { name: /^Use\b/ })
    .click();
  await saved(page);
  const spent = await readSaved(page, file.build.id);
  expect(spent.build).toEqual(initial.build);
  expect(spent.live).toEqual({
    ...initial.live,
    combat: {
      ...initial.live.combat!,
      economy: { ...initial.live.combat!.economy, reactionUsed: true },
    },
  });
  expect(spent.events.map((event) => event.command)).toEqual(['takeCombatAction']);
  expect(spent.events[0]?.text).toContain('Readied action');
  await readied(page)
    .getByRole('button', { name: /^Use\b/ })
    .click();
  await expect(warning(page)).toContainText('Reaction already used');
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await readSaved(page, file.build.id)).toEqual(spent);
  await main(page).getByRole('button', { name: 'End Turn', exact: true }).click();
  await saved(page);
  await expect(
    economy(page).getByRole('button', { name: 'React used', exact: true }),
  ).toBeVisible();
  const ended = await readSaved(page, file.build.id);
  expect(ended.live.combat?.economy.reactionUsed).toBe(true);
  expect(ended.live.slotsUsed).toEqual(initial.live.slotsUsed);
  expect(ended.live.featureUsesSpent).toEqual(initial.live.featureUsesSpent);
  await main(page).getByRole('button', { name: 'Start Turn', exact: true }).click();
  await saved(page);
  await expect(
    economy(page).getByRole('button', { name: 'React available', exact: true }),
  ).toBeVisible();
  const next = await readSaved(page, file.build.id);
  expect(next.live.combat?.round).toBe(2);
  expect(next.live.combat?.economy.reactionUsed).toBe(false);
  expect(next.live.clock.seconds).toBe(initial.live.clock.seconds + 6);
  expect(next.live.slotsUsed).toEqual(initial.live.slotsUsed);
  expect(next.live.featureUsesSpent).toEqual(initial.live.featureUsesSpent);
  expect(next.events.map((event) => event.command)).toEqual([
    'takeCombatAction',
    'endTurn',
    'startTurn',
  ]);
});

test('an exhausted shared pool disables Cutting Words while its preview remains available', async ({
  page,
  isMobile,
}) => {
  const file = combatFile('reactions-exhausted');
  file.live.featureUsesSpent[INSPIRATION] = 5;
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await expect(cuttingWords(page)).toContainText('0 / 5');
  await expect(cuttingWords(page).getByRole('button', { name: /^Use\b/ })).toBeDisabled();
  await cuttingWords(page)
    .getByRole('button', { name: /^Cutting Words\b/ })
    .click();
  const preview = isMobile
    ? page.getByRole('dialog', { name: 'Cutting Words', exact: true })
    : page.getByRole('complementary', { name: 'Pinned detail', exact: true });
  await expect(preview).toContainText('No Bardic Inspiration uses left');
  await expect(
    preview.getByRole('button', { name: 'Use Cutting Words', exact: true }),
  ).toBeDisabled();
  expect(await readSaved(page, file.build.id)).toEqual(initial);
});

test('an off-turn Shield cast spends one standard slot and the same reaction pool', async ({
  page,
}) => {
  const file = combatFile('reactions-shield');
  file.build.classes = [{ classId: 'class.sorcerer', level: 3 }];
  file.build.hpEntries = file.build.hpEntries.map((entry, index) => ({
    ...entry,
    classId: 'class.sorcerer',
    value: index === 0 ? 6 : entry.value,
  }));
  file.build.spells = [{ classId: 'class.sorcerer', known: ['spell.shield'] }];
  file.live.featureUsesSpent = {};
  file.live.slotsUsed = Array.from({ length: 10 }, () => 0);
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await row(page, /^Shield\b/)
    .getByRole('button', { name: /^Cast\b/ })
    .click();
  const cast = page.getByRole('dialog', { name: 'Cast Shield', exact: true });
  await cast.getByRole('button', { name: 'Cast Shield (L1)', exact: true }).click();
  await expect(cast).toHaveCount(0);
  await expect(warning(page)).toHaveCount(0);
  await saved(page);
  const shield = await readSaved(page, file.build.id);
  expect(shield.build).toEqual(initial.build);
  expect(shield.live.slotsUsed).toEqual(
    initial.live.slotsUsed.map((used, level) => (level === 1 ? used + 1 : used)),
  );
  expect(shield.live.combat).toEqual({
    ...initial.live.combat!,
    economy: { ...initial.live.combat!.economy, reactionUsed: true },
  });
  expect(shield.live.hp).toBe(initial.live.hp);
  expect(shield.live.tempHp).toBe(initial.live.tempHp);
  expect(shield.live.clock).toEqual(initial.live.clock);
  expect(shield.live.featureUsesSpent).toEqual(initial.live.featureUsesSpent);
  expect(shield.events.map((event) => event.command)).toEqual(['castSpell']);
  await expect(
    economy(page).getByRole('button', { name: 'React used', exact: true }),
  ).toBeVisible();
  await page.reload();
  await saved(page);
  await undo(page);
  expect((await readSaved(page, file.build.id)).live).toEqual(initial.live);
});

test('Manual mode allows repeated reactions without overrides but still blocks an empty feature pool', async ({
  page,
}) => {
  const file = combatFile('reactions-manual');
  await importCharacter(page, file);
  await page.goto(`/characters/${file.build.id}/settings`);
  await saved(page);
  await page.getByRole('radio', { name: /^Manual/ }).check();
  await saved(page);
  await page.goto(`/characters/${file.build.id}/combat`);
  await saved(page);
  await main(page).getByRole('tab', { name: 'React', exact: true }).click();
  const initial = await readSaved(page, file.build.id);
  for (let use = 0; use < 3; use++) {
    await cuttingWords(page)
      .getByRole('button', { name: /^Use\b/ })
      .click();
    await saved(page);
    await expect(warning(page)).toHaveCount(0);
  }
  const exhausted = await readSaved(page, file.build.id);
  expect(exhausted.build).toEqual(initial.build);
  expect(exhausted.live).toEqual({
    ...initial.live,
    featureUsesSpent: { ...initial.live.featureUsesSpent, [INSPIRATION]: 5 },
    combat: {
      ...initial.live.combat!,
      economy: { ...initial.live.combat!.economy, reactionUsed: true },
    },
  });
  expect(exhausted.events).toHaveLength(3);
  expect(exhausted.events.every((event) => event.command === 'useFeature' && !event.override)).toBe(
    true,
  );
  await expect(cuttingWords(page).getByRole('button', { name: /^Use\b/ })).toBeDisabled();
  await expect(cuttingWords(page)).toContainText('0 / 5');
  await expect(hud(page).getByRole('img', { name: 'BI: 0 of 5 left', exact: true })).toBeVisible();
});

for (const surface of ['row', 'detail'] as const) {
  test(`the last Cutting Words use leaves visible enabled focus from the ${surface}`, async ({
    page,
    isMobile,
  }, info) => {
    const file = combatFile(`reactions-last-use-${surface}`);
    file.live.featureUsesSpent[INSPIRATION] = 4;
    await importCharacter(page, file);
    const initial = await readSaved(page, file.build.id);
    if (surface === 'row') {
      await cuttingWords(page)
        .getByRole('button', { name: /^Use\b/ })
        .click();
    } else {
      await cuttingWords(page)
        .getByRole('button', { name: /^Cutting Words\b/ })
        .click();
      const detail = isMobile
        ? page.getByRole('dialog', { name: 'Cutting Words', exact: true })
        : page.getByRole('complementary', { name: 'Pinned detail', exact: true });
      await detail.getByRole('button', { name: 'Use Cutting Words', exact: true }).click();
    }
    await saved(page);
    const depleted = await readSaved(page, file.build.id);
    expect(depleted.live.featureUsesSpent[INSPIRATION]).toBe(5);
    expect(depleted.live.combat?.economy.reactionUsed).toBe(true);
    expect(depleted.build).toEqual(initial.build);
    expect(depleted.events.map((event) => event.command)).toEqual(['useFeature']);
    await expect(cuttingWords(page).getByRole('button', { name: /^Use\b/ })).toBeDisabled();
    await page.screenshot({
      path: info.outputPath(`last-reaction-${surface}-${isMobile ? '375' : '1440'}.png`),
      animations: 'disabled',
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const active = document.activeElement;
          return {
            acceptable:
              active instanceof HTMLElement &&
              active !== document.body &&
              active !== document.documentElement &&
              active.getClientRects().length > 0 &&
              !active.matches(':disabled'),
            tag: active?.tagName,
            text: active?.textContent?.trim().slice(0, 100),
            disabled: active?.matches(':disabled'),
          };
        }),
      )
      .toMatchObject({ acceptable: true });
  });
}

test('a dead import without condition entries cannot spend a Readied action reaction', async ({
  page,
}, info) => {
  const file = combatFile('reactions-dead-import');
  file.live.hp = 0;
  file.live.deathSaves = { success: 0, fail: 3 };
  file.live.conditions = [];
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  const use = readied(page).getByRole('button', { name: /^Use\b/ });
  if (await use.isEnabled()) {
    await use.click();
    await saved(page);
  }
  await page.screenshot({
    path: info.outputPath('dead-readied-reaction.png'),
    animations: 'disabled',
  });
  expect(await readSaved(page, file.build.id)).toEqual(initial);
  await expect(use).toBeDisabled();
});
