import { expect, test } from './fixtures';

test('the Bench keeps a character out of every campaign, and Undo brings it back', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Move The Fool', exact: true }).click();
  const move = page.getByRole('dialog', { name: 'Move character', exact: true });
  const target = move.getByLabel('Move to campaign');
  await expect(target).toHaveValue('__new-bench__');
  await expect(target.locator('option:checked')).toHaveText('Bench · not in a campaign');
  await move.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(move).toHaveCount(0);

  const bench = page.getByRole('article', { name: 'Bench', exact: true });
  await expect(bench.getByRole('article', { name: 'The Fool', exact: true })).toBeVisible();
  await expect(bench).toContainText('never shared');
  await expect(page.getByRole('article', { name: 'The Fool', exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('bench.png'), fullPage: true });

  await page.getByRole('button', { name: 'Undo management', exact: true }).click();
  await expect(bench).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'The Fool', exact: true })).toBeVisible();
});
