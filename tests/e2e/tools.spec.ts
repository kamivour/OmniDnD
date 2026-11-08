import { expect, test, type Page } from './fixtures';

async function noOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(0);
}

test('find a free map maker, hide AI tools and see a link that opens in a new tab', async ({
  page,
}) => {
  await page.goto('/reference');
  await page.getByRole('link', { name: 'Tools', exact: true }).click();
  await expect(page).toHaveURL(/\/reference\/tools$/);
  await expect(page.getByRole('heading', { name: 'Maps and battle maps' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dungeondraft', exact: true })).toBeVisible();

  await page.getByLabel('Free only').check();
  await expect(page.getByRole('link', { name: 'Dungeondraft', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Dungeon Scrawl', exact: true })).toBeVisible();

  await expect(page.getByRole('link', { name: 'Stable Diffusion', exact: true })).toBeVisible();
  await page.getByLabel('Hide AI tools').check();
  await expect(page.getByRole('link', { name: 'Stable Diffusion', exact: true })).toHaveCount(0);

  await page.getByLabel('Search tools').fill('map maker');
  const link = page.getByRole('link', { name: 'Dungeon Scrawl', exact: true });
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('href', /dungeonscrawl\.com/);
  await noOverflow(page);

  await page.getByLabel('Search tools').fill('zzzzqq');
  await expect(page.getByText('Nothing matches.')).toBeVisible();
});

test('other game systems are marked as not supported', async ({ page }) => {
  await page.goto('/reference/tools');
  await expect(page.getByRole('heading', { name: 'Other game systems' })).toBeVisible();
  await expect(page.getByText('Not supported by this app.').first()).toBeVisible();
  await noOverflow(page);
});
