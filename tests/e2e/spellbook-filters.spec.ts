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
const filters = (page: Page) => main(page).getByRole('region', { name: 'Filters', exact: true });
const row = (page: Page, name: string) =>
  main(page).getByRole('button', { name: new RegExp(`^${name}`) });
const star = (page: Page, name: string) =>
  main(page).getByRole('button', { name: `Favorite ${name}`, exact: true });
const chip = (page: Page, name: string) => filters(page).getByRole('button', { name, exact: true });
const type = (page: Page, name: string) =>
  filters(page)
    .getByRole('group', { name: 'Spell type', exact: true })
    .getByRole('button', { name, exact: true });

async function expectSaved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
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

function importedSeed(id: string): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = id;
  file.build.name = id;
  file.live.characterId = id;
  file.events = [];
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

test('combined filters match across groups; Clear resets every choice without character events', async ({
  page,
  isMobile,
}, info) => {
  const file = importedSeed('filter-bard');
  file.build.spells[0]!.known = file.build.spells[0]!.known.map((id) =>
    id === 'spell.disguise-self'
      ? 'spell.identify'
      : id === 'spell.dissonant-whispers'
        ? 'spell.detect-magic'
        : id,
  );
  file.build.favorites = ['spell.detect-magic', 'spell.identify'];
  await importCharacter(page, file);
  const initial = await readSavedCharacter(page, file.build.id);
  await expect(main(page)).toContainText('Cantrips 2 / 2');
  await expect(main(page)).toContainText('Known 6 / 6');
  await filters(page)
    .getByRole('searchbox', { name: 'Search spells', exact: true })
    .fill('  mAgIc  ');
  await filters(page).getByLabel('Level', { exact: true }).selectOption('1');
  await filters(page).getByLabel('School', { exact: true }).selectOption('divination');
  for (const name of ['A', 'Conc', 'Ritual', 'Castable now', 'Favorites'])
    await chip(page, name).click();
  await type(page, 'Utility').click();
  // A spell needs either selected type, while every other selected group still applies.
  await type(page, 'Damage').click();
  await expect(row(page, 'Detect Magic')).toBeVisible();
  await expect(main(page).getByRole('listitem')).toHaveCount(1);
  await expect(main(page)).toContainText('Cantrips 2 / 2');
  await expect(main(page)).toContainText('Known 6 / 6');
  await expect(
    main(page).getByLabel('Level 1 spell slots: 0 of 4 left', { exact: true }),
  ).toBeVisible();
  await expect(
    main(page).getByLabel('Level 2 spell slots: 2 of 2 left', { exact: true }),
  ).toBeVisible();

  await filters(page).getByLabel('School', { exact: true }).selectOption('illusion');
  await expect(row(page, 'Detect Magic')).toHaveCount(0);
  await expect(main(page)).toContainText('No spells match these filters.');
  await filters(page).getByLabel('School', { exact: true }).selectOption('divination');
  await chip(page, 'A').click();
  await chip(page, 'BA').click();
  await expect(main(page).getByRole('listitem')).toHaveCount(0);
  await chip(page, 'BA').click();
  await chip(page, 'A').click();
  await expect(row(page, 'Detect Magic')).toBeVisible();
  expect(await readSavedCharacter(page, file.build.id)).toEqual(initial);
  await expectNoOverflow(page);
  await page.screenshot({
    path: info.outputPath(`combined-filters-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });

  await chip(page, 'Clear').click();
  await expect(filters(page).getByRole('searchbox', { name: 'Search spells' })).toHaveValue('');
  await expect(filters(page).getByLabel('Level', { exact: true })).toHaveValue('all');
  await expect(filters(page).getByLabel('School', { exact: true })).toHaveValue('all');
  for (const name of [
    'A',
    'BA',
    'Conc',
    'Ritual',
    'Castable now',
    'Favorites',
    'Utility',
    'Damage',
  ]) {
    await expect(chip(page, name)).toHaveAttribute('aria-pressed', 'false');
  }
  await expect(chip(page, 'Clear')).toHaveCount(0);
  await expect(main(page).getByRole('listitem')).toHaveCount(8);
  expect(await readSavedCharacter(page, file.build.id)).toEqual(initial);
});

test('favorites support click and keyboard, persist and undo, and restore focus when a row disappears', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/characters/the-fool/spells');
  await expectSaved(page);
  const initial = await readSavedCharacter(page);
  await star(page, 'Healing Word').click();
  await expect(star(page, 'Healing Word')).toHaveAttribute('aria-pressed', 'true');
  await expectSaved(page);
  const first = await readSavedCharacter(page);
  expect(first.build).toEqual({ ...initial.build, favorites: ['spell.healing-word'] });
  expect(first.live).toEqual(initial.live);
  expect(first.events.map((event) => event.command)).toEqual(['setSpellFavorite']);
  await star(page, 'Vicious Mockery').focus();
  await page.keyboard.press('Space');
  await expect(star(page, 'Vicious Mockery')).toHaveAttribute('aria-pressed', 'true');
  await expectSaved(page);
  const both = await readSavedCharacter(page);
  expect(both.build).toEqual({
    ...initial.build,
    favorites: ['spell.healing-word', 'spell.vicious-mockery'],
  });
  expect(both.live).toEqual(initial.live);
  expect(both.events.map((event) => event.command)).toEqual([
    'setSpellFavorite',
    'setSpellFavorite',
  ]);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expectSaved(page);
  await expect(star(page, 'Healing Word')).toHaveAttribute('aria-pressed', 'true');
  await expect(star(page, 'Vicious Mockery')).toHaveAttribute('aria-pressed', 'true');
  expect(await readSavedCharacter(page)).toEqual(both);
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await expectSaved(page);
  await expect(star(page, 'Vicious Mockery')).toHaveAttribute('aria-pressed', 'false');
  const undone = await readSavedCharacter(page);
  expect(undone.build).toEqual(first.build);
  expect(undone.live).toEqual(initial.live);
  expect(undone.events.map((event) => event.command)).toEqual([
    'setSpellFavorite',
    'setSpellFavorite',
    'undo',
  ]);
  expect(undone.events[1]?.undoneBy).toBe(undone.events[2]?.id);
  await chip(page, 'Favorites').click();
  await expect(main(page).getByRole('listitem')).toHaveCount(1);
  await expect(row(page, 'Healing Word')).toBeVisible();
  const bounds = await star(page, 'Healing Word').boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  await expectNoOverflow(page);
  await expect(page.getByRole('status', { name: 'Command feedback', exact: true })).toHaveText('', {
    timeout: 10_000,
  });
  await page.screenshot({
    path: info.outputPath(`favorites-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });
  await star(page, 'Healing Word').click();
  await expect(row(page, 'Healing Word')).toHaveCount(0);
  await expect(main(page).getByRole('listitem')).toHaveCount(0);
  await expect(chip(page, 'Favorites')).toBeFocused();
  await expect(chip(page, 'Favorites')).toHaveAttribute('aria-pressed', 'true');
  await expectSaved(page);
  const removed = await readSavedCharacter(page);
  expect(removed.build).toEqual(initial.build);
  expect(removed.live).toEqual(initial.live);
  expect(removed.events.map((event) => event.command)).toEqual([
    'setSpellFavorite',
    'setSpellFavorite',
    'undo',
    'setSpellFavorite',
  ]);
});

test('an imported book uses actual long casting times and tag overrides without Fool spells', async ({
  page,
}) => {
  const file = importedSeed('filter-wizard');
  file.build.classes = [{ classId: 'class.wizard', level: 3 }];
  file.build.hpEntries = file.build.hpEntries.map((entry, index) => ({
    ...entry,
    classId: 'class.wizard',
    value: index === 0 ? 6 : entry.value,
  }));
  file.build.spells = [
    {
      classId: 'class.wizard',
      known: ['spell.identify', 'spell.find-familiar', 'spell.magic-missile', 'spell.mage-hand'],
    },
  ];
  file.build.spellTags = { 'spell.identify': ['buff', 'utility'], 'spell.magic-missile': [] };
  file.live.featureUsesSpent = {};
  await importCharacter(page, file);
  const initial = await readSavedCharacter(page, file.build.id);
  await expect(main(page).getByRole('listitem')).toHaveCount(4);
  await expect(row(page, 'Healing Word')).toHaveCount(0);
  await expect(row(page, 'Dissonant Whispers')).toHaveCount(0);
  await expect(row(page, 'Vicious Mockery')).toHaveCount(0);
  await expect(chip(page, '1 min')).toBeVisible();
  await expect(chip(page, '1 h')).toBeVisible();
  await chip(page, '1 min').click();
  await expect(main(page).getByRole('listitem')).toHaveCount(1);
  await expect(row(page, 'Identify')).toBeVisible();
  await chip(page, '1 min').click();
  await chip(page, '1 h').click();
  await expect(main(page).getByRole('listitem')).toHaveCount(1);
  await expect(row(page, 'Find Familiar')).toBeVisible();
  await chip(page, 'Clear').click();
  await type(page, 'Buff').click();
  await expect(main(page).getByRole('listitem')).toHaveCount(1);
  await expect(row(page, 'Identify')).toBeVisible();
  await type(page, 'Utility').click();
  await expect(main(page).getByRole('listitem')).toHaveCount(4);
  await expect(row(page, 'Magic Missile')).toContainText('Utility');
  await type(page, 'Buff').click();
  await type(page, 'Damage').click();
  await type(page, 'Utility').click();
  await expect(main(page).getByRole('listitem')).toHaveCount(0);
  await chip(page, 'Clear').click();
  await expect(main(page).getByRole('listitem')).toHaveCount(4);
  await expectNoOverflow(page);
  expect(await readSavedCharacter(page, file.build.id)).toEqual(initial);
});

test('Castable now retains an eligible slotless ritual and hides a spent ordinary spell', async ({
  page,
}) => {
  const file = importedSeed('slotless-filter-bard');
  file.build.spells = [
    {
      classId: 'class.bard',
      known: ['spell.detect-magic', 'spell.healing-word', 'spell.minor-illusion'],
    },
  ];
  file.live.slotsUsed[2] = 2;
  await importCharacter(page, file);
  const initial = await readSavedCharacter(page, file.build.id);
  await chip(page, 'Castable now').click();
  await expect(row(page, 'Detect Magic')).toBeVisible();
  await expect(row(page, 'Minor Illusion')).toBeVisible();
  await expect(row(page, 'Healing Word')).toHaveCount(0);
  await expect(main(page).getByRole('listitem')).toHaveCount(2);
  await expect(main(page)).toContainText('Known 2 / 6');
  await expect(
    main(page).getByLabel('Level 1 spell slots: 0 of 4 left', { exact: true }),
  ).toBeVisible();
  await expect(
    main(page).getByLabel('Level 2 spell slots: 0 of 2 left', { exact: true }),
  ).toBeVisible();
  await chip(page, 'Ritual').click();
  await expect(main(page).getByRole('listitem')).toHaveCount(1);
  await expect(row(page, 'Detect Magic')).toBeVisible();
  await expect(row(page, 'Minor Illusion')).toHaveCount(0);
  expect(await readSavedCharacter(page, file.build.id)).toEqual(initial);
});
