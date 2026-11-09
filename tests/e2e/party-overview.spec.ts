import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import { ExportFileSchema } from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

async function importAs(page: Page, role: 'dm' | 'player') {
  await page.goto('/');
  const file = ExportFileSchema.parse(seed);
  file.campaign.id = 'table-one';
  file.campaign.name = 'Table One';
  file.campaign.role = role;
  file.build.id = 'party-fool';
  file.build.name = 'Party Fool';
  file.build.campaignId = file.campaign.id;
  file.live.characterId = file.build.id;
  file.events = [];
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: 'party-fool.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  const dialog = page.getByRole('dialog', { name: 'Import character', exact: true });
  await dialog.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test('the DM sees a table, picks columns and sorts without a page scroll', async ({ page }) => {
  await importAs(page, 'dm');
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
  await importAs(page, 'player');
  await page.goto('/campaigns/table-one/party');
  await expect(page.getByRole('article', { name: 'Party Fool' })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});
