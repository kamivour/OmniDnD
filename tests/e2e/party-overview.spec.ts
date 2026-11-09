import { expect, importPartyFool, test } from './fixtures';

test('the DM sees a table, picks columns and sorts without a page scroll', async ({ page }) => {
  await importPartyFool(page, 'dm');
  await page.goto('/campaigns/table-one/party');
  const table = page.getByRole('table');
  await expect(table.getByRole('link', { name: 'Party Fool' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'AC', exact: true })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'STR save', exact: true })).toHaveCount(0);

  await page.getByText(/^Columns \(/).click();
  await page.getByRole('checkbox', { name: 'STR save', exact: true }).check();
  await expect(table.getByRole('columnheader', { name: 'STR save', exact: true })).toBeVisible();

  await table.getByRole('button', { name: 'AC', exact: true }).click();
  await expect(table.getByRole('columnheader', { name: 'AC', exact: true })).toHaveAttribute(
    'aria-sort',
    'ascending',
  );

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a player sees cards, not the DM table', async ({ page }) => {
  await importPartyFool(page, 'player');
  await page.goto('/campaigns/table-one/party');
  await expect(page.getByRole('article', { name: 'Party Fool' })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});
