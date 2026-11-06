import { expect, test, type Page } from './fixtures';

async function noOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(0);
}

test('reference search shows condition text and handles no match', async ({ page }) => {
  await page.goto('/reference');
  const search = page.getByRole('searchbox', { name: 'Search rules', exact: true });
  await search.fill('blind');
  await expect(page.getByText("can't see", { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Blinded', { exact: true }).first()).toBeVisible();
  await noOverflow(page);
  await search.fill('zzzzqq');
  await expect(page.getByText('Nothing found', { exact: false })).toBeVisible();
});
