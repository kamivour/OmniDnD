import { GAME_ICONS } from '../../src/ui/icons/game-icons';
import { expect, test, type Page } from './fixtures';

interface DatabaseSnapshot {
  builds: unknown[];
  live: unknown[];
  campaigns: unknown[];
  events: unknown[];
  settings: unknown[];
}

const bookmark = (page: Page, title: string) =>
  page.getByRole('article', { name: title, exact: true });
const undo = (page: Page) =>
  new URL(page.url()).pathname.startsWith('/characters/')
    ? page
        .getByRole('region', { name: 'Character log', exact: true })
        .getByRole('button', { name: 'Undo last command', exact: true })
    : page.getByRole('button', { name: 'Undo management', exact: true });
const hp = (page: Page) =>
  page
    .getByRole('banner', { name: 'Character HUD', exact: true })
    .getByRole('button', { name: 'Adjust hit points', exact: true });

const REFERENCE_LINKS = [
  ['D&D Beyond', 'https://www.dndbeyond.com/'],
  ['Basic Rules (2014)', 'https://www.dndbeyond.com/sources/dnd/basic-rules-2014'],
  ['SRD 5.1', 'https://media.dndbeyond.com/compendium-images/srd/5.1/SRD_CC_v5.1.pdf'],
  ['5e.tools (2014)', 'https://2014.5e.tools/'],
  ['D&D 5e API', 'https://www.dnd5eapi.co/'],
  ['Open5e', 'https://open5e.com/'],
  ['Roll20', 'https://roll20.net/'],
  ['Hero Forge', 'https://www.heroforge.com/'],
] as const;

const SRD_ATTRIBUTION =
  'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.';

async function expectSaved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

async function readDatabase(page: Page): Promise<DatabaseSnapshot> {
  return page.evaluate(async () => {
    const requestValue = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await requestValue(indexedDB.open('omnidnd'));
    try {
      const names = ['builds', 'live', 'campaigns', 'events', 'settings'];
      const transaction = db.transaction(names, 'readonly');
      const [builds, live, campaigns, events, settings] = await Promise.all(
        names.map((name) => requestValue(transaction.objectStore(name).getAll())),
      );
      return { builds, live, campaigns, events, settings } as DatabaseSnapshot;
    } finally {
      db.close();
    }
  });
}

function characterData({ builds, live, campaigns, events }: DatabaseSnapshot) {
  return { builds, live, campaigns, events };
}

async function openCharacterReference(page: Page, isMobile: boolean) {
  await page.goto('/characters/the-fool');
  await expectSaved(page);
  if (isMobile) {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    const more = page.getByRole('dialog', { name: 'More', exact: true });
    await more.getByRole('link', { name: 'Reference', exact: true }).click();
    await expect(more).toHaveCount(0);
  } else {
    await page
      .getByRole('navigation', { name: 'Main', exact: true })
      .filter({ visible: true })
      .getByRole('link', { name: 'Reference', exact: true })
      .click();
  }
  await expect(page).toHaveURL('/characters/the-fool/reference');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Reference', exact: true }),
  ).toBeVisible();
}

test('Reference offers the eight named sources with edition guidance and secure external links', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expectSaved(page);
  await page.getByRole('link', { name: 'Reference', exact: true }).click();
  await expect(page).toHaveURL('/reference');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Reference', exact: true }),
  ).toBeVisible();
  for (const [name, href] of REFERENCE_LINKS) {
    const link = page.getByRole('link', { name, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', href);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /\bnoreferrer\b/);
  }
  await expect(page.getByText(/OmniDnD uses 2014 rules/)).toBeVisible();
  await expect(page.getByText(/choose 2014 or SRD 5\.1 material/i)).toBeVisible();
  await expect(page.getByText(/new tab/i)).toBeVisible();
  await expect(page.locator('main a[target="_blank"]')).toHaveCount(REFERENCE_LINKS.length);
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('reference-sources.png'), fullPage: true });
});

test('Credits has required SRD, icon and font attribution and returns to its own Reference context', async ({
  page,
  isMobile,
}, testInfo) => {
  for (const path of ['/reference', '/characters/the-fool/reference']) {
    if (path.startsWith('/characters')) await openCharacterReference(page, isMobile);
    else {
      await page.goto(path);
      await expectSaved(page);
    }
    const credits = page.getByRole('link', { name: 'Credits', exact: true });
    await expect(credits).toHaveAttribute('href', `${path}/credits`);
    await credits.click();
    await expect(page).toHaveURL(`${path}/credits`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Credits', exact: true }),
    ).toBeVisible();
    await expect(page.getByText(SRD_ATTRIBUTION, { exact: true })).toBeVisible();
    await expect(
      page.locator('main a[href="https://creativecommons.org/licenses/by/4.0/legalcode"]'),
    ).toBeVisible();
    await expect(
      page.locator('main a[href="https://creativecommons.org/licenses/by/3.0/"]'),
    ).toBeVisible();
    for (const { author, name } of Object.values(GAME_ICONS)) {
      const source = page.locator(
        `main a[href="https://game-icons.net/1x1/${author}/${name}.html"]`,
      );
      await expect(source).toHaveCount(1);
      await expect(source.locator('..')).toContainText(author);
    }
    await expect(page.getByRole('region', { name: 'Lucide', exact: true })).toContainText(
      'ISC license',
    );
    const fonts = page.getByRole('region', { name: 'Fonts', exact: true });
    await expect(fonts).toContainText('Inter');
    await expect(fonts).toContainText('Cinzel');
    await expect(fonts).toContainText('SIL Open Font License 1.1');
    for (const [name, href, notice] of [
      ['Lucide license and notices', '/licenses/lucide.txt', 'ISC License'],
      ['Inter license', '/licenses/inter.txt', 'SIL OPEN FONT LICENSE'],
      ['Cinzel license', '/licenses/cinzel.txt', 'SIL OPEN FONT LICENSE'],
    ] as const) {
      await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
      const response = await page.request.get(href);
      expect(response.ok()).toBe(true);
      expect(await response.text()).toContain(notice);
    }
    for (const link of await page.locator('main a[target="_blank"]').all()) {
      await expect(link).toHaveAttribute('rel', /\bnoreferrer\b/);
    }
    const back = page.getByRole('link', { name: 'Back to Reference', exact: true });
    await expect(back).toHaveAttribute('href', path);
    await expectNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(
        path.startsWith('/characters') ? 'character-credits.png' : 'credits.png',
      ),
      fullPage: true,
    });
    await back.click();
    await expect(page).toHaveURL(path);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Reference', exact: true }),
    ).toBeVisible();
  }
});

test('bookmarks are shared, saved, logged separately and undoable after reload', async ({
  page,
  isMobile,
}, testInfo) => {
  await page.goto('/characters/the-fool');
  await expectSaved(page);
  await hp(page).click();
  const damage = page.getByRole('dialog', { name: 'Hit points', exact: true });
  await damage.getByRole('button', { name: '5', exact: true }).click();
  await damage.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(hp(page)).toHaveText(/6\s*\/\s*19/);
  await expectSaved(page);
  const before = characterData(await readDatabase(page));
  await page.goto('/');
  await page.getByRole('link', { name: 'Reference', exact: true }).click();
  await expect(page).toHaveURL('/reference');
  await expect(page.getByRole('heading', { name: 'Bookmarks', exact: true })).toBeVisible();
  await expect(page.getByText('No bookmarks yet.', { exact: true })).toBeVisible();

  const add = page.getByRole('button', { name: 'Add bookmark', exact: true });
  await add.click();
  const adding = page.getByRole('dialog', { name: 'Add bookmark', exact: true });
  await expect(adding.getByLabel('Title', { exact: true })).toBeFocused();
  await adding.getByLabel('Title', { exact: true }).fill('Campaign notes');
  await adding.getByLabel('URL', { exact: true }).fill('https://example.com/campaign?day=1#recap');
  await adding.getByRole('button', { name: 'Save bookmark', exact: true }).click();
  await expect(adding).toHaveCount(0);
  await expect(add).toBeFocused();
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  const original = bookmark(page, 'Campaign notes');
  await expect(original.getByRole('link', { name: 'Campaign notes', exact: true })).toHaveAttribute(
    'href',
    'https://example.com/campaign?day=1#recap',
  );
  await expect(original.getByRole('link', { name: 'Campaign notes', exact: true })).toHaveAttribute(
    'target',
    '_blank',
  );
  await expect(original.getByRole('link', { name: 'Campaign notes', exact: true })).toHaveAttribute(
    'rel',
    /\bnoreferrer\b/,
  );
  await original.getByRole('button', { name: 'Edit bookmark', exact: true }).click();
  const editing = page.getByRole('dialog', { name: 'Edit bookmark', exact: true });
  await expect(editing.getByLabel('Title', { exact: true })).toHaveValue('Campaign notes');
  await expect(editing.getByLabel('URL', { exact: true })).toHaveValue(
    'https://example.com/campaign?day=1#recap',
  );
  await editing.getByLabel('Title', { exact: true }).fill('Table rulings');
  await editing.getByLabel('URL', { exact: true }).fill('http://example.org/rules');
  await editing.getByRole('button', { name: 'Save bookmark', exact: true }).click();
  await expect(editing).toHaveCount(0);
  const edited = bookmark(page, 'Table rulings');
  await expect(edited.getByRole('button', { name: 'Edit bookmark', exact: true })).toBeFocused();
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  await expect(original).toHaveCount(0);
  await expect(edited.getByRole('link', { name: 'Table rulings', exact: true })).toHaveAttribute(
    'href',
    'http://example.org/rules',
  );
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('reference-bookmarks.png'), fullPage: true });

  await openCharacterReference(page, isMobile);
  await expect(hp(page)).toHaveText(/6\s*\/\s*19/);
  await expect(edited).toBeVisible();
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('character-reference.png'), fullPage: true });
  await edited.getByRole('button', { name: 'Remove bookmark', exact: true }).click();
  await expect(edited).toHaveCount(0);
  await expectSaved(page);
  await expect(add).toBeFocused();
  await undo(page).click();
  await expect(edited).toBeVisible();
  await expectSaved(page);
  await edited.getByRole('button', { name: 'Remove bookmark', exact: true }).click();
  await expect(edited).toHaveCount(0);
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  await expect(edited).toHaveCount(0);
  await undo(page).click();
  await expect(edited).toBeVisible();
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  await expect(edited).toBeVisible();
  expect(characterData(await readDatabase(page))).toEqual(before);

  await page.goto('/reference');
  await expectSaved(page);
  await expect(edited).toBeVisible();
  await undo(page).click();
  await expect(original).toBeVisible();
  await expect(edited).toHaveCount(0);
  await expectSaved(page);
  await undo(page).click();
  await expect(original).toHaveCount(0);
  await expect(page.getByText('No bookmarks yet.', { exact: true })).toBeVisible();
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  await expect(undo(page)).toBeDisabled();
  expect(characterData(await readDatabase(page))).toEqual(before);
});

test('invalid bookmark URLs and dismissed forms leave the saved workspace untouched', async ({
  page,
}, testInfo) => {
  await page.goto('/reference');
  await expectSaved(page);
  const before = await readDatabase(page);
  const add = page.getByRole('button', { name: 'Add bookmark', exact: true });
  await add.click();
  const dialog = page.getByRole('dialog', { name: 'Add bookmark', exact: true });
  await dialog.getByLabel('Title', { exact: true }).fill('Unsafe bookmark');
  for (const url of [
    'not a URL',
    'javascript:alert(1)',
    'data:text/html,unsafe',
    'ftp://example.com',
  ]) {
    await dialog.getByLabel('URL', { exact: true }).fill(url);
    await dialog.getByRole('button', { name: 'Save bookmark', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText(/HTTP|https?:\/\//i);
    await expect(dialog).toBeVisible();
    expect(await readDatabase(page)).toEqual(before);
  }
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('bookmark-validation.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(add).toBeFocused();
  await expect(bookmark(page, 'Unsafe bookmark')).toHaveCount(0);
  expect(await readDatabase(page)).toEqual(before);
  await add.click();
  await dialog.getByLabel('Title', { exact: true }).fill('Draft bookmark');
  await dialog.getByLabel('URL', { exact: true }).fill('https://example.com/draft');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(add).toBeFocused();
  await page.reload();
  await expectSaved(page);
  await expect(page.getByText('No bookmarks yet.', { exact: true })).toBeVisible();
  expect(await readDatabase(page)).toEqual(before);
});

test('reference search shows Xanathar content with its book', async ({ page }) => {
  for (const path of ['/reference', '/characters/the-fool/reference']) {
    await page.goto(path);
    await page.getByRole('searchbox', { name: 'Search rules', exact: true }).fill('toll the dead');
    await expect(
      page.getByRole('listitem').filter({ hasText: 'Toll the Dead · Spell · XGE' }),
    ).toBeVisible();
  }
});
