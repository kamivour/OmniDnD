import { expect, test, type Page } from './fixtures';

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectTokens(page: Page) {
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(16, 21, 33)');
}

const HUB_ROUTES = [
  { path: '/', heading: 'Campaigns' },
  { path: '/campaigns/new', heading: 'New campaign' },
  { path: '/campaigns/273/settings', heading: 'Campaign settings' },
  { path: '/campaigns/273/characters/new', heading: 'New character' },
  { path: '/reference', heading: 'Reference' },
  { path: '/reference/credits', heading: 'Credits' },
  { path: '/settings', heading: 'Settings' },
];

const CHARACTER_ROUTES: { path: string; heading: string; notice?: string }[] = [
  { path: '/characters/the-fool', heading: 'Home' },
  {
    path: '/characters/the-fool/sheet',
    heading: 'Sheet',
    notice: 'Coming in milestone M7.',
  },
  { path: '/characters/the-fool/combat', heading: 'Combat' },
  { path: '/characters/the-fool/spells', heading: 'Spells' },
  {
    path: '/characters/the-fool/explore',
    heading: 'Explore',
    notice: 'Coming in milestone M7.',
  },
  {
    path: '/characters/the-fool/inventory',
    heading: 'Inventory',
    notice: 'Coming in Phase 2.',
  },
  {
    path: '/characters/the-fool/features',
    heading: 'Features',
    notice: 'Coming in Phase 2.',
  },
  {
    path: '/characters/the-fool/companions',
    heading: 'Companions',
    notice: 'Coming in Phase 2.',
  },
  { path: '/characters/the-fool/journal', heading: 'Journal', notice: 'Coming in Phase 2.' },
  {
    path: '/characters/the-fool/reference',
    heading: 'Reference',
    notice: 'Coming in milestone M3.',
  },
  {
    path: '/characters/the-fool/reference/credits',
    heading: 'Credits',
    notice: 'Coming in milestone M3.',
  },
  {
    path: '/characters/the-fool/settings',
    heading: 'Settings',
    notice: 'Coming in milestone M3.',
  },
];

for (const { path, heading } of HUB_ROUTES) {
  test(`${path} renders with tokens and no horizontal scroll`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expectTokens(page);
    await expectNoHorizontalScroll(page);
  });
}

for (const { path, heading, notice } of CHARACTER_ROUTES) {
  test(`${path} renders in the character frame`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeAttached();
    await expect(page.getByText('The Fool').first()).toBeVisible();
    await expectTokens(page);
    await expectNoHorizontalScroll(page);
    if (notice) await expect(page.getByText(notice, { exact: true })).toBeVisible();
  });
}

test('Companions opens from desktop navigation or mobile More', async ({ page, isMobile }) => {
  await page.goto('/characters/the-fool');
  if (isMobile) {
    await page.getByRole('button', { name: 'More', exact: true }).tap();
    const more = page.getByRole('dialog', { name: 'More', exact: true });
    await more.getByRole('link', { name: 'Companions', exact: true }).tap();
    await expect(more).toBeHidden();
  } else {
    await page
      .getByRole('navigation', { name: 'Main' })
      .filter({ visible: true })
      .getByRole('link', { name: 'Companions', exact: true })
      .click();
  }
  await expect(page).toHaveURL(/\/characters\/the-fool\/companions$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Companions' })).toBeVisible();
  await expect(page.getByText('Coming in Phase 2.', { exact: true })).toBeVisible();
});

test('unknown routes show not found', async ({ page }) => {
  await page.goto('/nope');
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
  await page.goto('/characters/the-fool/nope');
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
  await page.goto('/characters/nobody');
  await expect(page.getByRole('heading', { name: 'Character not found' })).toBeVisible();
});
