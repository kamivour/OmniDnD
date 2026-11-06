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

test('quick tables open and show exhaustion levels', async ({ page }) => {
  await page.goto('/reference');
  await page.getByText('Exhaustion (2014)', { exact: true }).click();
  await expect(page.getByText('Speed reduced to 0.', { exact: true })).toBeVisible();
  await noOverflow(page);
});

test('reference search finds a creature and opens its statblock', async ({ page }, info) => {
  await page.goto('/reference');
  await page.getByRole('searchbox', { name: 'Search rules', exact: true }).fill('goblin');
  const hit = page.getByRole('listitem').filter({ hasText: 'Goblin · Creature' }).first();
  await hit.getByText('Show statblock', { exact: false }).click();
  await expect(hit.getByText('Small humanoid (goblinoid), neutral evil')).toBeVisible();
  await expect(hit.getByText('AC 15', { exact: true })).toBeVisible();
  await expect(hit.getByText('Scimitar.', { exact: false })).toBeVisible();
  await expect(hit.getByText('Nimble Escape.', { exact: false })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`creature-statblock-${page.viewportSize()!.width}.png`),
    animations: 'disabled',
  });
});
