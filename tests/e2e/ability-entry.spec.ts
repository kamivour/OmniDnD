import { readFile } from 'node:fs/promises';
import type { Locator } from '@playwright/test';
import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import { ABILITIES, type Ability } from '../../src/engine/calc/abilities';
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

// Fixture construction runs in Node, outside Vite's JSON loader.
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
const form = (page: Page) => main(page).getByRole('form', { name: 'Edit character build' });
const abilityEditor = (page: Page) =>
  form(page).getByRole('region', { name: 'Ability base scores', exact: true });
const base = (page: Page, ability: Ability) =>
  abilityEditor(page).getByLabel(`${ability} base`, { exact: true });
const preview = (page: Page, ability: Ability, kind: 'score' | 'modifier') =>
  abilityEditor(page).getByLabel(`${ability} ${kind} preview`, { exact: true });
const save = (page: Page) => form(page).getByRole('button', { name: 'Save changes', exact: true });
const edit = (page: Page) =>
  main(page).getByRole('button', { name: 'Edit character', exact: true });
const stat = (page: Page, label: string) =>
  main(page).getByRole('button', { name: `Show ${label} breakdown`, exact: true });
const undo = (page: Page) =>
  page
    .getByRole('region', { name: 'Character log', exact: true })
    .getByRole('button', { name: 'Undo last command', exact: true });

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
          .sort((first, second) => first.order - second.order)
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
    name: 'ability-entry.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(ExportFileSchema.parse(file))),
  });
  const dialog = page.getByRole('dialog', { name: 'Import character', exact: true });
  await dialog.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(dialog).toBeHidden();
  await saved(page);
}

async function goSheet(page: Page, id: string) {
  await page.goto(`/characters/${id}/sheet`);
  await saved(page);
  await expect(
    main(page).getByRole('heading', { name: 'Character sheet', exact: true }),
  ).toBeVisible();
}

async function openEdit(page: Page) {
  await edit(page).evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await edit(page).focus();
  await page.keyboard.press('Enter');
  await expect(abilityEditor(page)).toBeVisible();
  await expect(save(page)).toBeDisabled();
}

async function cancel(page: Page) {
  await form(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(form(page)).toHaveCount(0);
  await expect(edit(page)).toBeFocused();
}

async function submit(page: Page) {
  await save(page).click();
  await expect(form(page)).toHaveCount(0);
  await saved(page);
  await expect(edit(page)).toBeFocused();
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

function playedFool(id: string): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = id;
  file.build.name = 'A Mask for Tomorrow';
  file.live.characterId = id;
  file.build.abilityScores.bonuses.push({ source: 'DM pendant', ability: 'WIS', value: 1 });
  file.build.choices['custom-training'] = { retained: true };
  file.build.overrides = [
    { path: '/future/homebrew', value: { retained: true }, note: 'Keep this entry' },
  ];
  file.live.tempHp = 3;
  file.live.hitDiceSpent = { d8: 1 };
  file.live.concentration = {
    spellId: 'spell.invisibility',
    endsAt: file.live.clock.seconds + 600,
  };
  file.live.effects = [
    {
      id: 'borrowed-courage',
      name: 'Borrowed courage',
      concentration: false,
      conditions: [],
      modifiers: [],
      endsAt: file.live.clock.seconds + 300,
    },
  ];
  file.live.combat = {
    round: 4,
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
  return ExportFileSchema.parse(file);
}

function friendFile(
  id: string,
  method: Campaign['abilityMethod'],
  classId = 'class.fighter',
): ExportFile {
  const campaign: Campaign = {
    ...ExportFileSchema.parse(seed).campaign,
    id: `${id}-campaign`,
    name: `${id} campaign`,
    sources: ['PHB'],
    hpMethod: 'average',
    abilityMethod: method,
  };
  const character = createCharacter(
    {
      id,
      name: classId === 'class.wizard' ? 'Mira the Archivist' : 'Taren Ashfield',
      campaign,
      raceId: 'race.human',
      classId,
      backgroundId: 'background.acolyte',
      level: 3,
      abilityBases:
        method === 'point-buy'
          ? { STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 }
          : { STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 },
    },
    registry,
  );
  if (classId === 'class.wizard') {
    character.build.spells = [
      {
        classId,
        known: [
          'spell.light',
          'spell.mage-hand',
          'spell.fire-bolt',
          'spell.magic-missile',
          'spell.mage-armor',
          'spell.shield',
          'spell.sleep',
          'spell.detect-magic',
          'spell.find-familiar',
        ],
        prepared: ['spell.magic-missile', 'spell.mage-armor'],
      },
    ];
    character.live.slotsUsed[1] = 1;
  }
  return ExportFileSchema.parse({
    app: 'omnidnd',
    schemaVersion: 1,
    exportedAt: '2026-11-04T00:00:00.000Z',
    campaign,
    ...character,
  });
}

test('rolled bases stay a draft, list bonuses separately and save dependent numbers without changing play state', async ({
  page,
}) => {
  const file = playedFool('ability-rolled');
  await importFile(page, file);
  await goSheet(page, file.build.id);
  const before = await readSaved(page, file.build.id);
  await openEdit(page);
  await expect(abilityEditor(page)).toContainText('Half-Elf');
  await expect(abilityEditor(page)).toContainText('DM pendant');
  await expect(abilityEditor(page).getByRole('spinbutton')).toHaveCount(6);
  for (const ability of ABILITIES) await touchTarget(base(page, ability));
  await base(page, 'CON').fill('16.5');
  await expect(save(page)).toBeDisabled();
  await base(page, 'CON').fill('19');
  await expect(save(page)).toBeDisabled();
  await base(page, 'CON').fill('');
  await expect(save(page)).toBeDisabled();
  await base(page, 'CON').fill('12');
  await expect(save(page)).toBeDisabled();
  await base(page, 'CON').fill('16');
  await base(page, 'CHA').fill('16');
  await expect(preview(page, 'CON', 'score')).toContainText('17');
  await expect(preview(page, 'CON', 'modifier')).toContainText('+3');
  await expect(preview(page, 'CHA', 'score')).toContainText('18');
  await expect(preview(page, 'CHA', 'modifier')).toContainText('+4');
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await noOverflow(page);
  await base(page, 'STR').evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: test.info().outputPath('ability-rolled-preview.png') });
  await cancel(page);
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await openEdit(page);
  await expect(base(page, 'CON')).toHaveValue('12');
  await base(page, 'CON').fill('16');
  await base(page, 'CHA').fill('16');
  await submit(page);
  const changed = await readSaved(page, file.build.id);
  expect(changed.build).toEqual({
    ...before.build,
    abilityScores: {
      ...before.build.abilityScores,
      base: { ...before.build.abilityScores.base, CON: 16, CHA: 16 },
    },
  });
  expect(changed.live).toEqual(before.live);
  expect(changed.events).toHaveLength(before.events.length + 1);
  expect(changed.events.at(-1)?.command).toBe('editBuild');
  expect(changed.build.hpEntries).toEqual(before.build.hpEntries);
  await expect(stat(page, 'Maximum HP')).toContainText('25');
  await expect(stat(page, 'Bard spell save DC')).toContainText('14');
  await expect(stat(page, 'Bard spell attack')).toContainText('+6');
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(changed);
  await page.goto(`/characters/${file.build.id}`);
  await saved(page);
  await expect(
    main(page).getByRole('img', { name: 'Bardic Inspiration: 2 of 4 left', exact: true }),
  ).toBeVisible();
  await undo(page).click();
  await saved(page);
  const restored = await readSaved(page, file.build.id);
  expect(restored.build).toEqual(before.build);
  expect(restored.live).toEqual(before.live);
  await noOverflow(page);
});

test('a legacy standard-array character keeps recorded bases on unrelated edits and can explicitly assign each array score once', async ({
  page,
}) => {
  const file = friendFile('ability-array', 'rolled');
  file.campaign.abilityMethod = 'standard-array';
  file.build.abilityScores.base = { STR: 11, DEX: 14, CON: 12, INT: 12, WIS: 12, CHA: 18 };
  await importFile(page, file);
  await goSheet(page, file.build.id);
  const before = await readSaved(page, file.build.id);
  await openEdit(page);
  await expect(base(page, 'CHA')).toHaveValue('18');
  await expect(base(page, 'CHA').locator('option:checked')).toContainText(/18/);
  await expect(save(page)).toBeDisabled();
  await form(page)
    .getByLabel('Character name', { exact: true })
    .fill('Taren, Keeper of Old Scores');
  await expect(save(page)).toBeEnabled();
  await submit(page);
  const renamed = await readSaved(page, file.build.id);
  expect(renamed.build.abilityScores).toEqual(before.build.abilityScores);
  expect(renamed.live).toEqual(before.live);
  await undo(page).click();
  await saved(page);
  await openEdit(page);
  const values = { STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 };
  for (const ability of ABILITIES) await base(page, ability).selectOption(String(values[ability]));
  await expect(save(page)).toBeEnabled();
  await base(page, 'STR').selectOption('14');
  await expect(save(page)).toBeDisabled();
  await base(page, 'STR').selectOption('15');
  await expect(preview(page, 'STR', 'score')).toContainText('16');
  await expect(preview(page, 'CHA', 'modifier')).toContainText('-1');
  await expect(abilityEditor(page).getByRole('combobox')).toHaveCount(6);
  await expect(abilityEditor(page).getByRole('spinbutton')).toHaveCount(0);
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('ability-array-assignment.png') });
  await submit(page);
  const assigned = await readSaved(page, file.build.id);
  expect(assigned.build.abilityScores.base).toEqual(values);
  expect(assigned.build.abilityScores.bonuses).toEqual(before.build.abilityScores.bonuses);
  expect(assigned.live).toEqual(before.live);
  await page.reload();
  await saved(page);
  await expect(stat(page, 'STR score')).toContainText('16');
  await undo(page).click();
  await saved(page);
  expect((await readSaved(page, file.build.id)).build).toEqual(before.build);
  expect((await readSaved(page, file.build.id)).live).toEqual(before.live);
});

test('point buy checks the budget and a prepared Wizard uses the resulting INT and CON without resetting resources', async ({
  page,
}) => {
  const file = friendFile('ability-point-wizard', 'point-buy', 'class.wizard');
  await importFile(page, file);
  await goSheet(page, file.build.id);
  const before = await readSaved(page, file.build.id);
  await openEdit(page);
  await base(page, 'INT').fill('15');
  await expect(abilityEditor(page)).toContainText(/Points used:\s*9\s*\/\s*27/);
  await expect(save(page)).toBeEnabled();
  for (const ability of ABILITIES) await base(page, ability).fill('15');
  await expect(abilityEditor(page)).toContainText(/Points used:\s*54\s*\/\s*27/);
  await expect(save(page)).toBeDisabled();
  expect(await readSaved(page, file.build.id)).toEqual(before);
  const values = { STR: 8, DEX: 14, CON: 13, INT: 15, WIS: 12, CHA: 10 };
  for (const ability of ABILITIES) await base(page, ability).fill(String(values[ability]));
  await expect(abilityEditor(page)).toContainText(/Points used:\s*27\s*\/\s*27/);
  await expect(preview(page, 'INT', 'score')).toContainText('16');
  await expect(preview(page, 'INT', 'modifier')).toContainText('+3');
  await base(page, 'CHA').scrollIntoViewIfNeeded();
  await expect(abilityEditor(page).getByText(/Points used:\s*27\s*\/\s*27/)).toBeInViewport({
    ratio: 1,
  });
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('ability-point-buy-budget.png') });
  await submit(page);
  const changed = await readSaved(page, file.build.id);
  expect(changed.build.abilityScores.base).toEqual(values);
  expect(changed.live).toEqual(before.live);
  expect(changed.build.hpEntries).toEqual(before.build.hpEntries);
  await expect(stat(page, 'Maximum HP')).toContainText('20');
  await expect(stat(page, 'Wizard spell save DC')).toContainText('13');
  await expect(stat(page, 'Wizard spell attack')).toContainText('+5');
  await page.goto(`/characters/${file.build.id}/spells`);
  await saved(page);
  await expect(main(page)).toContainText(/Prepared 2\s*\/\s*6/);
  await main(page).getByRole('button', { name: 'Manage', exact: true }).click();
  const manager = page.getByRole('dialog', { name: 'Manage spells', exact: true });
  const counts = manager.locator('[aria-label="Spell selection counts"]');
  await expect(counts).toContainText('2 / 6 prepared');
  await manager
    .getByRole('searchbox', { name: 'Search available spells', exact: true })
    .fill('Shield');
  await manager.getByRole('checkbox', { name: 'Prepare Shield', exact: true }).check();
  await saved(page);
  await expect(counts).toContainText('3 / 6 prepared');
  await expect(page.getByRole('dialog', { name: 'Check this action', exact: true })).toHaveCount(0);
  expect((await readSaved(page, file.build.id)).live).toEqual(before.live);
  await manager.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await saved(page);
  await expect(counts).toContainText('2 / 6 prepared');
  await manager.getByRole('button', { name: 'Done', exact: true }).click();
  await undo(page).click();
  await saved(page);
  const restored = await readSaved(page, file.build.id);
  expect(restored.build).toEqual(before.build);
  expect(restored.live).toEqual(before.live);
  await page.reload();
  await saved(page);
  await expect(main(page)).toContainText(/Prepared 2\s*\/\s*2/);
});

test('a campaign-method Undo keeps the typed ability draft but requires reviewing the new method before saving bases', async ({
  page,
}) => {
  const file = friendFile('ability-method-change', 'rolled');
  await importFile(page, file);
  await page.goto(`/campaigns/${file.campaign.id}/settings`);
  await saved(page);
  await page.getByRole('radio', { name: /^Point buy/ }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL('/');
  await saved(page);
  await goSheet(page, file.build.id);
  const before = await readSaved(page, file.build.id);
  await openEdit(page);
  await base(page, 'INT').fill('10');
  await expect(save(page)).toBeEnabled();
  await undo(page).click();
  await saved(page);
  await expect(base(page, 'INT')).toHaveValue('10');
  await expect(save(page)).toBeDisabled();
  await expect(main(page)).toContainText(/method.*changed|reopen.*edit/i);
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('ability-method-changed-draft.png') });
  await cancel(page);
  await openEdit(page);
  await expect(base(page, 'INT')).toHaveValue('12');
  await expect(base(page, 'INT')).toHaveAttribute('max', '18');
  await base(page, 'INT').fill('16');
  await submit(page);
  const changed = await readSaved(page, file.build.id);
  expect(changed.build.abilityScores.base.INT).toBe(16);
  expect(changed.live).toEqual(before.live);
  await undo(page).click();
  await saved(page);
  expect((await readSaved(page, file.build.id)).build).toEqual(before.build);
});

test('combined race and base choices preview exact bonuses while preserving explicit score and modifier overrides', async ({
  page,
}) => {
  const file = playedFool('ability-combined-overrides');
  file.build.overrides.push(
    { path: '/abilities/CHA/score', value: 22, note: 'Bound charisma' },
    { path: '/abilities/CHA/mod', value: 8, note: 'DM presence' },
  );
  await importFile(page, file);
  await goSheet(page, file.build.id);
  const before = await readSaved(page, file.build.id);
  await openEdit(page);
  await form(page).getByLabel('Race', { exact: true }).selectOption('race.human');
  await base(page, 'STR').fill('14');
  await base(page, 'CHA').fill('16');
  await expect(preview(page, 'STR', 'score')).toContainText('15');
  await expect(preview(page, 'WIS', 'score')).toContainText('14');
  await expect(preview(page, 'CHA', 'score')).toContainText('22');
  await expect(preview(page, 'CHA', 'modifier')).toContainText('+8');
  await expect(abilityEditor(page)).toContainText('Human');
  await expect(abilityEditor(page)).toContainText('DM pendant');
  await expect(
    abilityEditor(page).getByRole('img', { name: 'Overridden: Bound charisma', exact: true }),
  ).toBeVisible();
  await expect(
    abilityEditor(page).getByRole('img', { name: 'Overridden: DM presence', exact: true }),
  ).toBeVisible();
  expect(await readSaved(page, file.build.id)).toEqual(before);
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('ability-combined-overrides.png') });
  await submit(page);
  const changed = await readSaved(page, file.build.id);
  expect(changed.events).toHaveLength(before.events.length + 1);
  expect(changed.build.raceId).toBe('race.human');
  expect(changed.build.abilityScores.base).toEqual({
    ...before.build.abilityScores.base,
    STR: 14,
    CHA: 16,
  });
  expect(changed.build.abilityScores.bonuses).toEqual([
    { source: 'DM pendant', ability: 'WIS', value: 1 },
    ...registry
      .get('race', 'race.human')
      .abilityBonuses.map((bonus) => ({ source: 'race.human', ...bonus })),
  ]);
  expect(changed.build.overrides).toEqual(before.build.overrides);
  expect(changed.build.proficiencies).toEqual(before.build.proficiencies);
  expect(changed.live).toEqual(before.live);
  await expect(stat(page, 'CHA score')).toContainText('22');
  await expect(stat(page, 'CHA modifier')).toContainText('+8');
  await page.reload();
  await saved(page);
  expect(await readSaved(page, file.build.id)).toEqual(changed);
  await undo(page).click();
  await saved(page);
  const restored = await readSaved(page, file.build.id);
  expect(restored.build).toEqual(before.build);
  expect(restored.live).toEqual(before.live);
});
