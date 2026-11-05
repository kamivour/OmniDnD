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
const row = (page: Page, name: RegExp) =>
  main(page)
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name }) });
const economy = (page: Page) =>
  main(page).getByRole('region', { name: 'Turn economy', exact: true });
const rest = (page: Page, kind: 'Short' | 'Long') =>
  page.getByRole('dialog', { name: `${kind} Rest`, exact: true });
const change = (page: Page, kind: 'Short' | 'Long', label: string) =>
  rest(page, kind)
    .getByRole('region', { name: 'Rest preview', exact: true })
    .getByText(label, { exact: true })
    .locator('..')
    .locator('dd');
const warning = (page: Page) =>
  page.getByRole('dialog', { name: 'Check this action', exact: true });
const clockDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Advance game time', exact: true });

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

/** Only the initial fresh fixture is imported; all 14 scenario steps use real controls. */
function freshFool(): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = 'phase1-linked-acceptance';
  file.live.characterId = file.build.id;
  file.live.hp = 19;
  file.live.slotsUsed = Array<number>(10).fill(0);
  file.live.featureUsesSpent = {};
  file.live.hitDiceSpent = {};
  file.live.effects = [];
  file.live.conditions = [];
  delete file.live.concentration;
  delete file.live.combat;
  delete file.live.lastLongRestEnd;
  file.live.clock.seconds = 8 * 3600;
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

async function expectShared(page: Page, state: SavedCharacter) {
  const { live } = state;
  const l1 = 4 - live.slotsUsed[1]!;
  const l2 = 2 - live.slotsUsed[2]!;
  const inspiration = 5 - (live.featureUsesSpent[INSPIRATION] ?? 0);
  const concentrationName = live.concentration
    ? live.concentration.spellId === 'spell.faerie-fire'
      ? 'Faerie Fire'
      : 'Invisibility'
    : 'None';
  const day = Math.floor(live.clock.seconds / 86400) + 1;
  const hours = String(Math.floor((live.clock.seconds % 86400) / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((live.clock.seconds % 3600) / 60)).padStart(2, '0');
  for (const suffix of ['', '/spells', '/combat', '/explore', '/sheet']) {
    await page.goto(`/characters/${state.build.id}${suffix}`);
    await saved(page);
    await expect(
      hud(page).getByRole('button', { name: 'Adjust hit points', exact: true }),
    ).toHaveText(new RegExp(`HP\\s*${live.hp}\\s*/\\s*19`));
    for (const [name, left, max] of [
      ['L1', l1, 4],
      ['L2', l2, 2],
      ['BI', inspiration, 5],
    ] as const)
      await expect(
        hud(page).getByRole('img', { name: `${name}: ${left} of ${max} left`, exact: true }),
      ).toBeVisible();
    if (live.concentration) await expect(hud(page)).toContainText(concentrationName);
    else {
      await expect(hud(page)).not.toContainText('Invisibility');
      await expect(hud(page)).not.toContainText('Faerie Fire');
    }
    await expect(page.getByRole('button', { name: 'Undo last command', exact: true })).toHaveCount(
      1,
    );
    if (suffix === '') {
      const resources = main(page).getByRole('region', { name: 'Resources', exact: true });
      for (const [name, left, max] of [
        ['Level 1 spell slots', l1, 4],
        ['Level 2 spell slots', l2, 2],
        ['Bardic Inspiration', inspiration, 5],
        ['d8 Hit Dice', 3 - (live.hitDiceSpent.d8 ?? 0), 3],
      ] as const)
        await expect(
          resources.getByRole('img', { name: `${name}: ${left} of ${max} left`, exact: true }),
        ).toBeVisible();
    }
    if (suffix === '' || suffix === '/combat' || suffix === '/explore') {
      const concentration = main(page).getByRole('region', { name: 'Concentration', exact: true });
      await expect(concentration).toContainText(concentrationName);
      if (live.concentration) {
        const secondsLeft = live.concentration.endsAt! - live.clock.seconds;
        const roundsLeft = Math.ceil(secondsLeft / 6);
        await expect(concentration).toContainText(
          live.combat ? `${roundsLeft} rounds left` : 'left',
        );
      }
      await expect(
        main(page).getByRole('region', { name: 'Effects on you', exact: true }),
      ).toContainText('None');
    }
    if (suffix === '' || suffix === '/explore')
      await expect(
        main(page).getByRole('region', { name: 'Game clock', exact: true }),
      ).toContainText(`Day ${day}, ${hours}:${minutes}`);
    if (suffix === '/spells') {
      for (const [level, left, max] of [
        [1, l1, 4],
        [2, l2, 2],
      ])
        await expect(
          main(page).getByRole('img', {
            name: `Level ${level} spell slots: ${left} of ${max} left`,
            exact: true,
          }),
        ).toBeVisible();
      if (live.concentration)
        await expect(row(page, new RegExp(`^${concentrationName}\\b`))).toContainText('Active');
    }
    if (suffix === '/combat') {
      const status = main(page).getByRole('status', { name: 'Combat status', exact: true });
      await expect(status).toContainText(
        live.combat ? `Round ${live.combat.round}` : 'No active combat',
      );
      if (live.combat)
        for (const [label, used] of [
          ['Action', live.combat.economy.actionUsed],
          ['Bonus', live.combat.economy.bonusUsed],
          ['React', live.combat.economy.reactionUsed],
        ] as const)
          await expect(
            economy(page).getByRole('button', {
              name: `${label} ${used ? 'used' : 'available'}`,
              exact: true,
            }),
          ).toBeVisible();
    }
    if (suffix === '/explore' || suffix === '/sheet') {
      for (const [label, value] of [
        ['Athletics', '+1'],
        ['Deception', '+9'],
        ['Sleight of Hand', '+6'],
        ['Passive Perception', '13'],
        ['Passive Investigation', '13'],
        ['Passive Insight', '13'],
      ])
        await expect(
          main(page).getByRole('button', { name: `Show ${label} breakdown`, exact: true }),
        ).toContainText(value!);
    }
    await noOverflow(page);
    expect(await readSaved(page, state.build.id)).toEqual(state);
  }
  await page.goto(`/characters/${state.build.id}`);
  await saved(page);
}

async function combat(page: Page, id: string) {
  await page.goto(`/characters/${id}/combat`);
  await saved(page);
}

async function openCast(page: Page, name: string) {
  await row(page, new RegExp(`^${name}\\b`))
    .getByRole('button', { name: /^Cast\b/ })
    .click();
  const dialog = page.getByRole('dialog', { name: `Cast ${name}`, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openRest(page: Page, kind: 'Short' | 'Long') {
  if (page.viewportSize()!.width < 640) {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'More', exact: true })
      .getByRole('button', { name: `${kind} Rest`, exact: true })
      .click();
  } else
    await page
      .getByRole('button', { name: `${kind} Rest`, exact: true })
      .filter({ visible: true })
      .click();
  await expect(rest(page, kind)).toBeVisible();
}

async function addDie(page: Page, index: number, roll: number) {
  await rest(page, 'Short').getByRole('button', { name: 'Add Hit Die', exact: true }).click();
  await rest(page, 'Short').getByLabel(`d8 roll ${index}`, { exact: true }).fill(String(roll));
}

async function applyRest(page: Page, kind: 'Short' | 'Long') {
  await rest(page, kind)
    .getByRole('button', { name: `Apply ${kind} Rest`, exact: true })
    .click();
  await expect(rest(page, kind)).toBeHidden();
  await expect(warning(page)).toHaveCount(0);
  await saved(page);
}

async function openClock(page: Page) {
  await page
    .getByRole('region', { name: 'Game clock', exact: true })
    .getByRole('button', { name: 'Advance time', exact: true })
    .click();
  await expect(clockDialog(page)).toBeVisible();
}

async function undo(page: Page) {
  await page
    .getByRole('region', { name: 'Character log', exact: true })
    .getByRole('button', { name: 'Undo last command', exact: true })
    .click();
  await saved(page);
}

test('full Phase 1 acceptance stays synchronized through combat, spells, reactions, rests, reload and exact Undo', async ({
  page,
  isMobile,
}, info) => {
  // One uninterrupted scenario visits five screens after every numbered step.
  test.setTimeout(180_000);
  const file = freshFool();
  const id = file.build.id;
  await importCharacter(page, file);
  const initial = await readSaved(page, id);
  expect(initial.build).toEqual(file.build);
  expect(initial.live).toEqual(file.live);
  expect(initial.events).toEqual([]);
  await expectShared(page, initial);

  // 1. Start combat and the first turn with full resources and the original game clock.
  await combat(page, id);
  await main(page).getByRole('button', { name: 'Start combat', exact: true }).click();
  await saved(page);
  await main(page).getByRole('button', { name: 'Start Turn', exact: true }).click();
  await saved(page);
  const firstTurn = await readSaved(page, id);
  const freshEconomy = {
    actionUsed: false,
    bonusUsed: false,
    reactionUsed: false,
    movementUsed: 0,
    objectInteractionUsed: false,
    bonusActionSpellCast: false,
    otherSpellCast: false,
  };
  expect(firstTurn.live).toEqual({
    ...initial.live,
    combat: { round: 1, turnActive: true, economy: freshEconomy },
  });
  expect(firstTurn.events.map(({ command }) => command)).toEqual(['startCombat', 'startTurn']);
  await expectShared(page, firstTurn);

  // 2. Faerie Fire spends an L1 slot and action, with concentration but no effect on The Fool.
  await combat(page, id);
  await main(page).getByRole('tab', { name: 'Spells', exact: true }).click();
  const faerieFire = await openCast(page, 'Faerie Fire');
  await faerieFire.getByRole('button', { name: 'Cast Faerie Fire (L1)', exact: true }).click();
  await expect(faerieFire).toBeHidden();
  await saved(page);
  const faerie = await readSaved(page, id);
  expect(faerie.live).toEqual({
    ...firstTurn.live,
    slotsUsed: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    concentration: { spellId: 'spell.faerie-fire', slotLevel: 1, endsAt: 8 * 3600 + 60 },
    combat: {
      ...firstTurn.live.combat!,
      economy: { ...freshEconomy, actionUsed: true, otherSpellCast: true },
    },
  });
  expect(faerie.events.at(-1)?.text).toBe('Cast Faerie Fire (L1 slot)');
  await expectShared(page, faerie);

  // 3. The next turn's ally Invisibility replaces Faerie Fire; both casts survive a reload.
  await combat(page, id);
  await main(page).getByRole('button', { name: 'End Turn', exact: true }).click();
  await saved(page);
  await main(page).getByRole('button', { name: 'Start Turn', exact: true }).click();
  await saved(page);
  await main(page).getByRole('tab', { name: 'Spells', exact: true }).click();
  const invisibility = await openCast(page, 'Invisibility');
  await expect(
    invisibility.getByRole('checkbox', { name: 'Apply to me', exact: true }),
  ).not.toBeChecked();
  await invisibility.getByRole('button', { name: 'Cast Invisibility (L2)', exact: true }).click();
  await expect(invisibility).toBeHidden();
  await expect(warning(page)).toHaveCount(0);
  await saved(page);
  const invisible = await readSaved(page, id);
  expect(invisible.live).toEqual({
    ...faerie.live,
    slotsUsed: [0, 1, 1, 0, 0, 0, 0, 0, 0, 0],
    clock: { seconds: 8 * 3600 + 6 },
    combat: { ...faerie.live.combat!, round: 2 },
    concentration: { spellId: 'spell.invisibility', slotLevel: 2, endsAt: 9 * 3600 + 6 },
  });
  expect(
    invisible.events.filter(({ command }) => command === 'castSpell').map(({ text }) => text),
  ).toEqual([
    'Cast Faerie Fire (L1 slot)',
    'Cast Invisibility (L2 slot); concentration on Faerie Fire ended',
  ]);
  await page.reload();
  await saved(page);
  expect(await readSaved(page, id)).toEqual(invisible);
  await expectShared(page, invisible);

  // 4. Cutting Words works off-turn and spends only the shared Inspiration pool and reaction.
  await combat(page, id);
  await main(page).getByRole('button', { name: 'End Turn', exact: true }).click();
  await saved(page);
  await main(page).getByRole('tab', { name: 'React', exact: true }).click();
  await row(page, /^Cutting Words\b/)
    .getByRole('button', { name: /^Use\b/ })
    .click();
  await saved(page);
  const cuttingWords = await readSaved(page, id);
  expect(cuttingWords.live).toEqual({
    ...invisible.live,
    featureUsesSpent: { [INSPIRATION]: 1 },
    combat: {
      ...invisible.live.combat!,
      turnActive: false,
      economy: { ...freshEconomy, actionUsed: true, reactionUsed: true },
    },
  });
  expect(cuttingWords.events.at(-1)?.command).toBe('useFeature');
  await expectShared(page, cuttingWords);

  // 5. Cancelling a second reaction preserves everything; Do anyway adds one override event.
  await combat(page, id);
  await main(page).getByRole('tab', { name: 'React', exact: true }).click();
  const opportunityAttack = row(page, /^Opportunity Attack \(Rapier\)/).getByRole('button', {
    name: /^Attack\b/,
  });
  await opportunityAttack.click();
  await expect(warning(page)).toContainText('Reaction already used');
  await expect(warning(page)).not.toContainText('Not your turn');
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await readSaved(page, id)).toEqual(cuttingWords);
  await opportunityAttack.click();
  await warning(page).getByRole('button', { name: 'Do anyway', exact: true }).click();
  await saved(page);
  const overridden = await readSaved(page, id);
  expect(overridden.build).toEqual(initial.build);
  expect(overridden.live).toEqual(cuttingWords.live);
  expect(overridden.events).toHaveLength(cuttingWords.events.length + 1);
  expect(overridden.events.at(-1)).toMatchObject({ command: 'takeCombatAction', override: true });
  await expectShared(page, overridden);

  // 6. Start Turn restores the reaction and all turn economy while advancing exactly six seconds.
  await combat(page, id);
  await main(page).getByRole('button', { name: 'Start Turn', exact: true }).click();
  await saved(page);
  const thirdTurn = await readSaved(page, id);
  expect(thirdTurn.live).toEqual({
    ...overridden.live,
    clock: { seconds: 8 * 3600 + 12 },
    combat: { round: 3, turnActive: true, economy: freshEconomy },
  });
  await expectShared(page, thirdTurn);

  // 7. Twelve damage queues CON DC 10; the player's Pass retains ally Invisibility.
  await hud(page).getByRole('button', { name: 'Adjust hit points', exact: true }).click();
  const damage = page.getByRole('dialog', { name: 'Hit points', exact: true });
  await damage.getByRole('tab', { name: 'Damage', exact: true }).click();
  for (const digit of ['1', '2'])
    await damage.getByRole('button', { name: digit, exact: true }).click();
  await damage.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(damage).toBeHidden();
  await saved(page);
  const damaged = await readSaved(page, id);
  expect(damaged.live).toEqual({
    ...thirdTurn.live,
    hp: 7,
    concentration: {
      ...thirdTurn.live.concentration!,
      pendingSaves: [{ id: damaged.events.at(-1)!.id, dc: 10 }],
    },
  });
  const concentrationSave = page.getByRole('region', { name: 'Concentration saves', exact: true });
  await expect(concentrationSave).toContainText('CON DC 10');
  await concentrationSave.getByRole('button', { name: 'Pass', exact: true }).click();
  await saved(page);
  const passed = await readSaved(page, id);
  expect(passed.live).toEqual({ ...thirdTurn.live, hp: 7 });
  expect(passed.events.at(-1)?.command).toBe('resolveConcentrationSave');
  await expect(concentrationSave).toHaveCount(0);
  await expectShared(page, passed);

  // 8. Self Healing Word heals six; a leveled action warns, while Vicious Mockery remains allowed.
  await combat(page, id);
  await main(page).getByRole('tab', { name: 'Bonus', exact: true }).click();
  const healing = await openCast(page, 'Healing Word');
  await healing.getByRole('checkbox', { name: 'Apply to me', exact: true }).check();
  await healing.getByLabel('Healing dice total', { exact: true }).fill('1');
  await expect(healing.getByRole('status', { name: 'Healing preview', exact: true })).toHaveText(
    'Healing: 6 HP. Your HP: 7 → 13.',
  );
  await healing.getByRole('button', { name: 'Cast Healing Word (L1)', exact: true }).click();
  await expect(healing).toBeHidden();
  await saved(page);
  const healed = await readSaved(page, id);
  expect(healed.live).toEqual({
    ...passed.live,
    hp: 13,
    slotsUsed: [0, 2, 1, 0, 0, 0, 0, 0, 0, 0],
    combat: {
      ...passed.live.combat!,
      economy: {
        ...freshEconomy,
        bonusUsed: true,
        bonusActionSpellCast: true,
        otherSpellCast: true,
      },
    },
  });
  await main(page).getByRole('tab', { name: 'Spells', exact: true }).click();
  await expect(row(page, /^Vicious Mockery\b/)).toBeVisible();
  await expect(row(page, /^Dissonant Whispers\b/)).toHaveCount(0);
  await main(page).getByRole('checkbox', { name: 'Show all spells', exact: true }).check();
  const whispers = await openCast(page, 'Dissonant Whispers');
  await whispers.getByRole('button', { name: 'Cast Dissonant Whispers (L1)', exact: true }).click();
  await expect(warning(page)).toContainText('Bonus-action spell rule');
  await expect(warning(page)).not.toContainText('Action already used');
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await whispers.getByRole('button', { name: 'Close', exact: true }).click();
  expect(await readSaved(page, id)).toEqual(healed);
  const mockery = await openCast(page, 'Vicious Mockery');
  await mockery.getByRole('button', { name: 'Cast Vicious Mockery', exact: true }).click();
  await expect(mockery).toBeHidden();
  await expect(warning(page)).toHaveCount(0);
  await saved(page);
  const afterStepEight = await readSaved(page, id);
  expect(afterStepEight.live).toEqual({
    ...healed.live,
    combat: {
      ...healed.live.combat!,
      economy: { ...healed.live.combat!.economy, actionUsed: true },
    },
  });
  expect(afterStepEight.events.at(-1)?.override).toBeUndefined();
  await page.reload();
  await saved(page);
  expect(await readSaved(page, id)).toEqual(afterStepEight);
  await expectShared(page, afterStepEight);

  // 9. End combat, advance an hour without resting, then spend one Hit Die and Song of Rest.
  await page.goto(`/characters/${id}/combat`);
  await saved(page);
  await main(page).getByRole('button', { name: 'End combat', exact: true }).click();
  await saved(page);
  const ended = await readSaved(page, id);
  const withoutCombat = { ...afterStepEight.live, clock: { seconds: 8 * 3600 + 18 } };
  delete withoutCombat.combat;
  expect(ended.live).toEqual(withoutCombat);
  expect(ended.events.at(-1)?.command).toBe('endCombat');
  await expectShared(page, ended);
  await openClock(page);
  await clockDialog(page).getByRole('button', { name: '+1 h', exact: true }).click();
  await expect(clockDialog(page)).toBeHidden();
  await saved(page);
  const expired = await readSaved(page, id);
  const withoutConcentration = { ...ended.live, clock: { seconds: 9 * 3600 + 18 } };
  delete withoutConcentration.concentration;
  expect(expired.live).toEqual(withoutConcentration);
  expect(expired.events.at(-1)).toMatchObject({
    command: 'advanceTime',
    gameSeconds: ended.live.clock.seconds,
  });
  expect(expired.events.at(-1)?.text).toContain('Invisibility ended');
  await expect(page.getByRole('region', { name: 'Character log', exact: true })).toContainText(
    'Invisibility ended',
  );
  await expectShared(page, expired);
  await openRest(page, 'Short');
  await addDie(page, 1, 2);
  await rest(page, 'Short')
    .getByRole('checkbox', { name: 'Add Song of Rest', exact: true })
    .check();
  await rest(page, 'Short').getByLabel('Song of Rest roll', { exact: true }).fill('2');
  await expect(change(page, 'Short', 'HP')).toHaveText('13 / 19 → 18 / 19');
  await expect(change(page, 'Short', 'd8 Hit Dice')).toHaveText('3 / 3 → 2 / 3');
  await expect(change(page, 'Short', 'Level 1 slots')).toHaveText('2 / 4 → 2 / 4');
  await expect(change(page, 'Short', 'Level 2 slots')).toHaveText('1 / 2 → 1 / 2');
  await expect(change(page, 'Short', 'Bardic Inspiration')).toHaveText('4 / 5 → 4 / 5');
  expect(await readSaved(page, id)).toEqual(expired);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`m6-step9-preview-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  await applyRest(page, 'Short');
  const short = await readSaved(page, id);
  expect(short.live).toEqual({
    ...expired.live,
    hp: 18,
    hitDiceSpent: { d8: 1 },
    clock: { seconds: 10 * 3600 + 18 },
  });
  await expectShared(page, short);

  // 10. The complete preview is read-only; applying restores every depleted long-rest resource.
  await openRest(page, 'Long');
  for (const [label, expected] of [
    ['HP', '18 / 19 → 19 / 19'],
    ['Level 1 slots', '2 / 4 → 4 / 4'],
    ['Level 2 slots', '1 / 2 → 2 / 2'],
    ['Bardic Inspiration', '4 / 5 → 5 / 5'],
    ['d8 Hit Dice', '2 / 3 → 3 / 3'],
    ['Game clock', 'Day 1, 10:00 → Day 1, 18:00'],
  ])
    await expect(change(page, 'Long', label!)).toHaveText(expected!);
  expect(await readSaved(page, id)).toEqual(short);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`m6-step10-preview-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  await applyRest(page, 'Long');
  const firstLong = await readSaved(page, id);
  expect(firstLong.live).toEqual({
    ...short.live,
    hp: 19,
    slotsUsed: Array<number>(10).fill(0),
    featureUsesSpent: {},
    hitDiceSpent: {},
    clock: { seconds: 18 * 3600 + 18 },
    lastLongRestEnd: 18 * 3600 + 18,
  });
  await expectShared(page, firstLong);

  // 11. An immediate second rest warns; cancelling both dialogs has no side effects.
  await openRest(page, 'Long');
  await rest(page, 'Long').getByRole('button', { name: 'Apply Long Rest', exact: true }).click();
  await expect(warning(page)).toContainText('Less than 24 h since last long rest');
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(rest(page, 'Long')).toBeVisible();
  await rest(page, 'Long').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await readSaved(page, id)).toEqual(firstLong);
  await expectShared(page, firstLong);

  // 12. Spend all three dice after 15 damage; advance to 24 h after the previous rest through custom time.
  await hud(page).getByRole('button', { name: 'Adjust hit points', exact: true }).click();
  const hp = page.getByRole('dialog', { name: 'Hit points', exact: true });
  await hp.getByRole('tab', { name: 'Damage', exact: true }).click();
  for (const digit of ['1', '5'])
    await hp.getByRole('button', { name: digit, exact: true }).click();
  await hp.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(hp).toBeHidden();
  await saved(page);
  expect((await readSaved(page, id)).live).toEqual({ ...firstLong.live, hp: 4 });
  await openRest(page, 'Short');
  for (let index = 1; index <= 3; index++) await addDie(page, index, 1);
  await expect(change(page, 'Short', 'HP')).toHaveText('4 / 19 → 10 / 19');
  await expect(change(page, 'Short', 'd8 Hit Dice')).toHaveText('3 / 3 → 0 / 3');
  await applyRest(page, 'Short');
  const spent = await readSaved(page, id);
  expect(spent.live).toEqual({
    ...firstLong.live,
    hp: 10,
    hitDiceSpent: { d8: 3 },
    clock: { seconds: 19 * 3600 + 18 },
  });
  await openClock(page);
  await clockDialog(page).getByLabel('Hours', { exact: true }).fill('23');
  await expect(
    clockDialog(page).getByRole('region', { name: 'Time preview', exact: true }),
  ).toContainText('Day 2, 18:00');
  expect(await readSaved(page, id)).toEqual(spent);
  await clockDialog(page).getByRole('button', { name: 'Advance time', exact: true }).click();
  await expect(clockDialog(page)).toBeHidden();
  await saved(page);
  const beforeLastRest = await readSaved(page, id);
  expect(beforeLastRest.live).toEqual({ ...spent.live, clock: { seconds: 42 * 3600 + 18 } });
  expect(beforeLastRest.live.clock.seconds - beforeLastRest.live.lastLongRestEnd!).toBe(24 * 3600);
  await openRest(page, 'Long');
  await expect(change(page, 'Long', 'd8 Hit Dice')).toHaveText('0 / 3 → 1 / 3');
  await applyRest(page, 'Long');
  const capped = await readSaved(page, id);
  expect(capped.live).toEqual({
    ...beforeLastRest.live,
    hp: 19,
    hitDiceSpent: { d8: 2 },
    clock: { seconds: 50 * 3600 + 18 },
    lastLongRestEnd: 50 * 3600 + 18,
  });
  expect(capped.events.at(-1)?.text).toContain('1 Hit Die back');
  await page.reload();
  await saved(page);
  expect(await readSaved(page, id)).toEqual(capped);
  await expectShared(page, capped);
  await page.screenshot({
    path: info.outputPath(`m6-step12-capped-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
    fullPage: true,
  });

  // 13. Undo after that reload restores the complete pre-rest build and live state.
  await undo(page);
  const undoneRest = await readSaved(page, id);
  expect(undoneRest.build).toEqual(beforeLastRest.build);
  expect(undoneRest.live).toEqual(beforeLastRest.live);
  expect(undoneRest.events).toHaveLength(capped.events.length + 1);
  expect(undoneRest.events.at(-1)?.command).toBe('undo');
  expect(undoneRest.events.at(-2)?.undoneBy).toBe(undoneRest.events.at(-1)?.id);
  await expectShared(page, undoneRest);
  await page.reload();
  await saved(page);
  expect(await readSaved(page, id)).toEqual(undoneRest);

  // 14. Each minus press is one logged correction; Undo restores each exact previous state.
  const useSlot = main(page)
    .getByRole('region', { name: 'Resources', exact: true })
    .getByRole('button', { name: 'Use one: Level 1 spell slots', exact: true });
  await useSlot.click();
  await saved(page);
  const oneUsed = await readSaved(page, id);
  await useSlot.click();
  await saved(page);
  const corrected = await readSaved(page, id);
  expect(corrected.build).toEqual(undoneRest.build);
  expect(corrected.live).toEqual({
    ...undoneRest.live,
    slotsUsed: undoneRest.live.slotsUsed.map((used, level) => (level === 1 ? 2 : used)),
  });
  expect(corrected.events.slice(-2).map(({ command }) => command)).toEqual([
    'adjustSlot',
    'adjustSlot',
  ]);
  expect(corrected.events.at(-1)?.text).toBe('L1 slots: 2/4 left');
  await expect(page.getByRole('region', { name: 'Character log', exact: true })).toContainText(
    'L1 slots: 2/4 left',
  );
  await expectShared(page, corrected);
  await undo(page);
  const undoneCorrection = await readSaved(page, id);
  expect(undoneCorrection.build).toEqual(oneUsed.build);
  expect(undoneCorrection.live).toEqual(oneUsed.live);
  expect(undoneCorrection.events).toHaveLength(corrected.events.length + 1);
  expect(undoneCorrection.events.at(-1)?.command).toBe('undo');
  expect(undoneCorrection.events.at(-2)?.undoneBy).toBe(undoneCorrection.events.at(-1)?.id);
  await undo(page);
  const restored = await readSaved(page, id);
  expect(restored.build).toEqual(undoneRest.build);
  expect(restored.live).toEqual(undoneRest.live);
  expect(restored.events).toHaveLength(undoneCorrection.events.length + 1);
  expect(restored.events.map(({ command }) => command)).toEqual([
    'startCombat',
    'startTurn',
    'castSpell',
    'endTurn',
    'startTurn',
    'castSpell',
    'endTurn',
    'useFeature',
    'takeCombatAction',
    'startTurn',
    'applyDamage',
    'resolveConcentrationSave',
    'castSpell',
    'castSpell',
    'endCombat',
    'advanceTime',
    'completeShortRest',
    'completeLongRest',
    'applyDamage',
    'completeShortRest',
    'advanceTime',
    'completeLongRest',
    'undo',
    'adjustSlot',
    'adjustSlot',
    'undo',
    'undo',
  ]);
  expect(restored.events.filter(({ override }) => override).map(({ command }) => command)).toEqual([
    'takeCombatAction',
  ]);
  await page.reload();
  await saved(page);
  expect(await readSaved(page, id)).toEqual(restored);
  await expectShared(page, restored);
});
