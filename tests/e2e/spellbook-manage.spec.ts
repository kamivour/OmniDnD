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
const manage = (page: Page) => page.getByRole('dialog', { name: 'Manage spells', exact: true });
const counts = (page: Page) => manage(page).locator('[aria-label="Spell selection counts"]');
const warning = (page: Page) =>
  page.getByRole('dialog', { name: 'Check this action', exact: true });
const row = (page: Page, name: string) =>
  main(page).getByRole('button', { name: new RegExp(`^${name}`) });

async function expectSaved(page: Page) {
  // Modal sheets intentionally hide the underlying toolbar from the accessibility tree.
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

function importedSeed(id: string, classId = 'class.bard'): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = id;
  file.build.name = id;
  file.live.characterId = id;
  file.events = [];
  if (classId !== 'class.bard') {
    file.build.classes = [{ classId, level: 3 }];
    file.build.hpEntries = file.build.hpEntries.map((entry, index) => ({
      ...entry,
      classId,
      value: index === 0 ? (classId === 'class.wizard' ? 6 : 8) : entry.value,
    }));
    file.build.spells = [];
    file.live.featureUsesSpent = {};
  }
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
  await page.goto(`/characters/${file.build.id}/spells`);
  await expectSaved(page);
}

async function openManage(page: Page) {
  await main(page).getByRole('button', { name: 'Manage', exact: true }).click();
  await expect(manage(page)).toBeVisible();
}

test('blank spell selections use class choices, save counts, and undo without changing play state', async ({
  page,
  isMobile,
}, info) => {
  const file = importedSeed('manage-blank-bard');
  file.build.spells = [];
  await importCharacter(page, file);
  const initial = await readSavedCharacter(page, file.build.id);
  await openManage(page);
  await expect(counts(page)).toHaveText('0 / 2 cantrips0 / 6 known');
  await manage(page).getByRole('searchbox', { name: 'Search available spells' }).fill('Mage Hand');
  const cantrip = manage(page).getByRole('checkbox', { name: 'Know Mage Hand', exact: true });
  await cantrip.focus();
  await page.keyboard.press('Space');
  await expect(cantrip).toBeChecked();
  await expectSaved(page);
  await manage(page)
    .getByRole('searchbox', { name: 'Search available spells' })
    .fill('Detect Magic');
  await manage(page).getByRole('checkbox', { name: 'Know Detect Magic', exact: true }).check();
  await expectSaved(page);
  await expect(counts(page)).toContainText('1 / 2 cantrips');
  await expect(counts(page)).toContainText('1 / 6 known');
  await expect(manage(page).getByRole('button', { name: 'Remove known Mage Hand' })).toBeVisible();
  await manage(page).getByRole('searchbox', { name: 'Search available spells' }).fill('Fireball');
  await expect(manage(page).getByRole('checkbox')).toHaveCount(0);
  await expect(
    manage(page).getByRole('button', { name: 'Remove known Detect Magic' }),
  ).toBeVisible();
  await expect(manage(page).getByRole('button', { name: 'Done', exact: true })).toBeInViewport();
  await expectNoOverflow(page);
  await page.screenshot({
    path: info.outputPath(`manage-selections-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });
  const chosen = await readSavedCharacter(page, file.build.id);
  expect(chosen.build).toEqual({
    ...initial.build,
    spells: [{ classId: 'class.bard', known: ['spell.mage-hand', 'spell.detect-magic'] }],
  });
  expect(chosen.live).toEqual(initial.live);
  expect(chosen.events.map((event) => event.command)).toEqual([
    'changeSpellSelection',
    'changeSpellSelection',
  ]);
  await manage(page).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(main(page).getByRole('button', { name: 'Manage', exact: true })).toBeFocused();
  await expect(main(page)).toContainText('Cantrips 1 / 2');
  await expect(main(page)).toContainText('Known 1 / 6');
  await page.reload();
  await expectSaved(page);
  expect(await readSavedCharacter(page, file.build.id)).toEqual(chosen);
  await openManage(page);
  await manage(page).getByRole('button', { name: 'Undo last command', exact: true }).click();
  await expectSaved(page);
  const undone = await readSavedCharacter(page, file.build.id);
  expect(undone.build.spells).toEqual([{ classId: 'class.bard', known: ['spell.mage-hand'] }]);
  expect(undone.live).toEqual(initial.live);
  expect(undone.events.at(-1)?.command).toBe('undo');
  await manage(page).getByRole('button', { name: 'Remove known Mage Hand', exact: true }).click();
  await expectSaved(page);
  expect((await readSavedCharacter(page, file.build.id)).build.spells).toEqual([]);
});

test('base-limit warnings cancel safely; replacement is atomic and retains tags and favorites', async ({
  page,
}) => {
  const file = importedSeed('manage-full-bard');
  file.build.favorites = ['spell.disguise-self', 'item.rapier'];
  file.build.spellTags = { 'spell.disguise-self': ['buff', 'utility'] };
  await importCharacter(page, file);
  const initial = await readSavedCharacter(page, file.build.id);
  await openManage(page);
  await manage(page)
    .getByRole('searchbox', { name: 'Search available spells' })
    .fill('Detect Magic');
  const extra = manage(page).getByRole('checkbox', { name: 'Know Detect Magic', exact: true });
  await extra.click();
  await expect(warning(page)).toContainText('7/6 known spells');
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(extra).not.toBeChecked();
  await expect(extra).toBeFocused();
  expect(await readSavedCharacter(page, file.build.id)).toEqual(initial);
  await extra.click();
  await warning(page).getByRole('button', { name: 'Do anyway', exact: true }).click();
  await expectSaved(page);
  const overridden = await readSavedCharacter(page, file.build.id);
  expect(overridden.events).toHaveLength(1);
  expect(overridden.events[0]?.override).toBe(true);
  expect(overridden.live).toEqual(initial.live);
  await manage(page).getByRole('button', { name: 'Undo last command', exact: true }).click();
  await expectSaved(page);
  await manage(page)
    .getByRole('button', { name: 'Replace known Disguise Self', exact: true })
    .click();
  await expect(
    manage(page).getByRole('searchbox', { name: 'Search available spells' }),
  ).toBeFocused();
  await manage(page).getByRole('button', { name: 'Cancel replacement', exact: true }).click();
  // The opener unmounts while choosing; cancellation must still return focus inside Manage.
  await expect
    .poll(() => manage(page).evaluate((element) => element.contains(document.activeElement)))
    .toBe(true);
  await manage(page)
    .getByRole('button', { name: 'Replace known Disguise Self', exact: true })
    .click();
  await manage(page)
    .getByRole('searchbox', { name: 'Search available spells' })
    .fill('Detect Magic');
  await manage(page).getByRole('button', { name: 'Choose Detect Magic', exact: true }).click();
  await expect(warning(page)).toHaveCount(0);
  await expectSaved(page);
  await expect(counts(page)).toContainText('6 / 6 known');
  await expect(
    manage(page).getByRole('button', { name: 'Remove known Disguise Self' }),
  ).toHaveCount(0);
  await expect(
    manage(page).getByRole('button', { name: 'Remove known Detect Magic' }),
  ).toBeVisible();
  await expect
    .poll(() => manage(page).evaluate((element) => element.contains(document.activeElement)))
    .toBe(true);
  const replaced = await readSavedCharacter(page, file.build.id);
  expect(replaced.events.map((event) => event.command)).toEqual([
    'changeSpellSelection',
    'undo',
    'changeSpellSelection',
  ]);
  expect(replaced.events[2]?.override).toBeUndefined();
  expect(replaced.build).toEqual({
    ...initial.build,
    spells: initial.build.spells.map((entry) => ({
      ...entry,
      known: entry.known.map((id) => (id === 'spell.disguise-self' ? 'spell.detect-magic' : id)),
    })),
  });
  expect(replaced.live).toEqual(initial.live);
  await page.reload();
  await expectSaved(page);
  await openManage(page);
  await manage(page).getByRole('button', { name: 'Undo last command', exact: true }).click();
  await expectSaved(page);
  const restored = await readSavedCharacter(page, file.build.id);
  expect(restored.build).toEqual(initial.build);
  expect(restored.live).toEqual(initial.live);
});

test('Wizard book and prepared choices stay separate, with an explicit retained-orphan warning', async ({
  page,
}) => {
  const file = importedSeed('manage-wizard', 'class.wizard');
  file.build.spells = [
    {
      classId: 'class.wizard',
      known: ['spell.mage-hand', 'spell.shield'],
      prepared: ['spell.shield'],
    },
  ];
  await importCharacter(page, file);
  const initial = await readSavedCharacter(page, file.build.id);
  await expect(main(page)).toContainText('Book 1');
  await expect(main(page)).toContainText('Prepared 1 / 4');
  await openManage(page);
  await expect(counts(page)).toContainText('1 in spellbook');
  await expect(counts(page)).toContainText('1 / 4 prepared');
  await manage(page)
    .getByRole('searchbox', { name: 'Search available spells' })
    .fill('Magic Missile');
  await expect(
    manage(page).getByRole('checkbox', { name: 'Prepare Magic Missile', exact: true }),
  ).toHaveCount(0);
  await manage(page).getByRole('checkbox', { name: 'Know Magic Missile', exact: true }).check();
  await expectSaved(page);
  await manage(page).getByRole('checkbox', { name: 'Prepare Magic Missile', exact: true }).check();
  await expectSaved(page);
  await expect(counts(page)).toContainText('2 in spellbook');
  await expect(counts(page)).toContainText('2 / 4 prepared');
  await manage(page).getByRole('button', { name: 'Remove known Shield', exact: true }).click();
  await expect(warning(page)).toContainText(
    'Shield is prepared but is not in your Wizard spellbook',
  );
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(
    manage(page).getByRole('button', { name: 'Remove known Shield', exact: true }),
  ).toBeFocused();
  await manage(page).getByRole('button', { name: 'Remove known Shield', exact: true }).click();
  await warning(page).getByRole('button', { name: 'Do anyway', exact: true }).click();
  await expectSaved(page);
  await expect(
    manage(page).getByRole('button', { name: 'Remove known Shield', exact: true }),
  ).toHaveCount(0);
  await expect(
    manage(page).getByRole('button', { name: 'Remove prepared Shield', exact: true }),
  ).toBeVisible();
  await expect(counts(page)).toContainText('1 in spellbook');
  await expect(counts(page)).toContainText('2 / 4 prepared');
  const retained = await readSavedCharacter(page, file.build.id);
  expect(retained.build.spells).toEqual([
    {
      classId: 'class.wizard',
      known: ['spell.mage-hand', 'spell.magic-missile'],
      prepared: ['spell.shield', 'spell.magic-missile'],
    },
  ]);
  expect(retained.live).toEqual(initial.live);
  expect(retained.events.at(-1)?.override).toBe(true);
  await manage(page).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(row(page, 'Shield')).toBeVisible();
  await expect(main(page)).toContainText('Book 1');
  await expect(main(page)).toContainText('Prepared 2 / 4');
});

test('prepared caster limits exclude learned cantrips and remain warning based', async ({
  page,
}) => {
  const file = importedSeed('manage-cleric', 'class.cleric');
  file.build.spells = [
    {
      classId: 'class.cleric',
      known: ['spell.guidance'],
      prepared: ['spell.bless', 'spell.cure-wounds', 'spell.detect-magic', 'spell.healing-word'],
    },
  ];
  await importCharacter(page, file);
  const initial = await readSavedCharacter(page, file.build.id);
  await openManage(page);
  await expect(counts(page)).toContainText('1 / 3 cantrips');
  await expect(counts(page)).toContainText('4 / 4 prepared');
  await manage(page)
    .getByRole('searchbox', { name: 'Search available spells' })
    .fill('Sacred Flame');
  await manage(page).getByRole('checkbox', { name: 'Know Sacred Flame', exact: true }).check();
  await expectSaved(page);
  await expect(counts(page)).toContainText('2 / 3 cantrips');
  await expect(counts(page)).toContainText('4 / 4 prepared');
  await manage(page).getByRole('searchbox', { name: 'Search available spells' }).fill('Aid');
  await expect(manage(page).getByRole('checkbox', { name: 'Know Aid', exact: true })).toHaveCount(
    0,
  );
  await manage(page).getByRole('checkbox', { name: 'Prepare Aid', exact: true }).click();
  await expect(warning(page)).toContainText('5/4 prepared spells');
  await warning(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(counts(page)).toContainText('4 / 4 prepared');
  await manage(page).getByRole('button', { name: 'Replace prepared Bless', exact: true }).click();
  await manage(page).getByRole('searchbox', { name: 'Search available spells' }).fill('Aid');
  await manage(page).getByRole('button', { name: 'Choose Aid', exact: true }).click();
  await expectSaved(page);
  await expect(warning(page)).toHaveCount(0);
  const changed = await readSavedCharacter(page, file.build.id);
  expect(changed.build.spells[0]?.known).toEqual(['spell.guidance', 'spell.sacred-flame']);
  expect(changed.build.spells[0]?.prepared).toEqual([
    'spell.aid',
    'spell.cure-wounds',
    'spell.detect-magic',
    'spell.healing-word',
  ]);
  expect(changed.events.map((event) => event.command)).toEqual([
    'changeSpellSelection',
    'changeSpellSelection',
  ]);
  expect(changed.live).toEqual(initial.live);
});

test('retained off-list and unsupported associations remain visible and removable', async ({
  page,
}) => {
  const file = importedSeed('manage-retained');
  file.build.spells = [
    { classId: 'class.bard', known: ['spell.fireball', 'spell.magic-missile'] },
    { classId: 'class.fighter', known: ['spell.cure-wounds'] },
  ];
  await importCharacter(page, file);
  const initial = await readSavedCharacter(page, file.build.id);
  await openManage(page);
  await manage(page)
    .getByRole('searchbox', { name: 'Search available spells' })
    .fill('Nothing matches');
  await expect(
    manage(page).getByRole('button', { name: 'Remove known Fireball', exact: true }),
  ).toBeVisible();
  await expect(manage(page).getByRole('checkbox')).toHaveCount(0);
  await manage(page).getByRole('button', { name: 'Remove known Fireball', exact: true }).click();
  await expectSaved(page);
  await expect(warning(page)).toHaveCount(0);
  await manage(page).getByLabel('Casting class', { exact: true }).selectOption('class.fighter');
  await expect(manage(page)).toContainText('No available choices');
  await expect(manage(page).getByRole('checkbox')).toHaveCount(0);
  await expect(
    manage(page).getByRole('button', { name: 'Replace known Cure Wounds', exact: true }),
  ).toBeDisabled();
  await manage(page).getByRole('button', { name: 'Remove known Cure Wounds', exact: true }).click();
  await expectSaved(page);
  await expect(warning(page)).toHaveCount(0);
  await expect(manage(page).getByLabel('Casting class', { exact: true })).toHaveValue('class.bard');
  const changed = await readSavedCharacter(page, file.build.id);
  expect(changed.build.spells).toEqual([{ classId: 'class.bard', known: ['spell.magic-missile'] }]);
  expect(changed.live).toEqual(initial.live);
  await manage(page).getByRole('button', { name: 'Undo last command', exact: true }).click();
  await expectSaved(page);
  expect((await readSavedCharacter(page, file.build.id)).build.spells).toEqual([
    { classId: 'class.bard', known: ['spell.magic-missile'] },
    { classId: 'class.fighter', known: ['spell.cure-wounds'] },
  ]);
});

test('ordered tags change the main row type; empty tags, reset and durable Undo preserve resources', async ({
  page,
  isMobile,
}, info) => {
  const file = importedSeed('manage-tags');
  file.build.spellTags = { 'spell.minor-illusion': ['control'] };
  await importCharacter(page, file);
  const initial = await readSavedCharacter(page, file.build.id);
  await openManage(page);
  const edit = manage(page).getByRole('button', {
    name: 'Edit tags for Healing Word',
    exact: true,
  });
  await edit.click();
  const tags = page.getByRole('dialog', { name: 'Tags: Healing Word', exact: true });
  await tags.getByRole('checkbox', { name: 'Buff', exact: true }).check();
  await expectSaved(page);
  await tags.getByRole('checkbox', { name: 'Control', exact: true }).check();
  await expectSaved(page);
  await tags.getByLabel('Main type', { exact: true }).selectOption('buff');
  await expectSaved(page);
  const ordered = await readSavedCharacter(page, file.build.id);
  expect(ordered.build.spellTags).toEqual({
    'spell.minor-illusion': ['control'],
    'spell.healing-word': ['buff', 'healing', 'control'],
  });
  expect(ordered.live).toEqual(initial.live);
  await expectNoOverflow(page);
  await page.screenshot({
    path: info.outputPath(`manage-tags-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });
  await tags.getByRole('button', { name: 'Done editing tags', exact: true }).click();
  await expect(edit).toBeFocused();
  await manage(page).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(row(page, 'Healing Word')).toContainText('Buff');
  const types = main(page).getByRole('group', { name: 'Spell type', exact: true });
  await types.getByRole('button', { name: 'Control', exact: true }).click();
  await expect(row(page, 'Healing Word')).toBeVisible();
  await types.getByRole('button', { name: 'Control', exact: true }).click();
  await page.reload();
  await expectSaved(page);
  expect(await readSavedCharacter(page, file.build.id)).toEqual(ordered);
  await openManage(page);
  await edit.click();
  for (const name of ['Buff', 'Healing', 'Control']) {
    await tags.getByRole('checkbox', { name, exact: true }).uncheck();
    await expectSaved(page);
  }
  await expect(tags.getByLabel('Main type', { exact: true })).toBeDisabled();
  await expect(tags).toContainText('No tags selected. This spell displays as Utility.');
  const empty = await readSavedCharacter(page, file.build.id);
  expect(empty.build.spellTags?.['spell.healing-word']).toEqual([]);
  await tags.getByRole('button', { name: 'Done editing tags', exact: true }).click();
  await manage(page).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(row(page, 'Healing Word')).toContainText('Utility');
  await openManage(page);
  await edit.click();
  await tags.getByRole('button', { name: 'Reset tags', exact: true }).click();
  await expectSaved(page);
  await expect(tags.getByRole('checkbox', { name: 'Healing', exact: true })).toBeChecked();
  await expect(tags.getByRole('button', { name: 'Reset tags', exact: true })).toBeDisabled();
  const reset = await readSavedCharacter(page, file.build.id);
  expect(reset.build.spellTags).toEqual(initial.build.spellTags);
  expect(reset.live).toEqual(initial.live);
  expect(reset.events.every((event) => event.command === 'setSpellTags')).toBe(true);
  await page.reload();
  await expectSaved(page);
  await openManage(page);
  await manage(page).getByRole('button', { name: 'Undo last command', exact: true }).click();
  await expectSaved(page);
  const undone = await readSavedCharacter(page, file.build.id);
  expect(undone.build).toEqual(empty.build);
  expect(undone.live).toEqual(initial.live);
  await manage(page).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(row(page, 'Healing Word')).toContainText('Utility');
});
