import { expect, test, type Page } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/characters/the-fool/spells');
});

/** Spell row trigger (the HUD also has an End concentration button naming Faerie Fire). */
const row = (page: Page, name: string) =>
  page.getByRole('main').getByRole('button', { name: new RegExp(`^${name}`) });

test('groups spells by level with slot pips', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Cantrips' })).toBeVisible();
  const main = page.getByRole('main');
  await expect(main.getByRole('img', { name: 'Level 1 spell slots: 3 of 4 left' })).toBeVisible();
  await expect(main.getByRole('img', { name: 'Level 2 spell slots: 1 of 2 left' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Use one: Level 2 spell slots' })).toBeVisible();
});

test('rows show their main type; the concentrating spell is marked Active', async ({ page }) => {
  await expect(row(page, 'Healing Word')).toContainText('Healing ·');
  await expect(row(page, 'Faerie Fire')).toContainText('Active');
  await expect(row(page, 'Suggestion')).not.toContainText('Active');
});

test('type filter matches any tag', async ({ page }) => {
  const types = page.getByRole('group', { name: 'Spell type' });
  await types.getByRole('button', { name: 'Control', exact: true }).click();
  // Suggestion (main type) and Dissonant Whispers (second tag) both match.
  await expect(row(page, 'Suggestion')).toBeVisible();
  await expect(row(page, 'Dissonant Whispers')).toBeVisible();
  await expect(row(page, 'Healing Word')).toHaveCount(0);

  await types.getByRole('button', { name: 'Healing', exact: true }).click();
  await expect(row(page, 'Healing Word')).toBeVisible();
});

test('filters narrow the list and Clear resets it', async ({ page }) => {
  await page.getByRole('button', { name: 'Conc', exact: true }).click();
  await expect(row(page, 'Faerie Fire')).toBeVisible();
  await expect(row(page, 'Healing Word')).toHaveCount(0);

  await page.getByRole('button', { name: 'Clear' }).click();
  await page.getByRole('searchbox', { name: 'Search spells' }).fill('word');
  await expect(row(page, 'Healing Word')).toBeVisible();
  await expect(row(page, 'Faerie Fire')).toHaveCount(0);
});

test.describe('mobile', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile only');

  test('tap opens a sheet; upcast choice shows the upcast hint', async ({ page }) => {
    await row(page, 'Dissonant Whispers').tap();
    const sheet = page.getByRole('dialog', { name: 'Dissonant Whispers' });
    await sheet.getByRole('button', { name: /^L2/ }).tap();
    await expect(sheet.getByText('Upcast to L2')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Cast Dissonant Whispers (L2)' })).toBeVisible();
  });
});

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('click pins the spell with a slot picker', async ({ page }) => {
    await row(page, 'Healing Word').click();
    const panel = page.getByRole('complementary', { name: 'Pinned detail' });
    await expect(panel).toContainText('1d4 + 5 HP');
    await expect(panel.getByRole('button', { name: 'Cast Healing Word (L1)' })).toBeVisible();
  });
});
