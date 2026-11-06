import { expect, test } from './fixtures';

// Builds without a sync provider (the default) stay guest-only: no account UI, no cloud code.
test('guest build shows no account section and loads no sync library', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Character JSON' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Account' })).toHaveCount(0);
  await page.goto('/characters/the-fool/settings');
  await expect(page.getByRole('heading', { name: 'Character JSON' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Account' })).toHaveCount(0);
  expect(scripts.filter((url) => /supabase|runner-/i.test(url))).toEqual([]);
});
