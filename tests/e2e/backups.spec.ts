import { expect, test, type Page } from './fixtures';

const ID = 'the-fool';

async function saved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

test('backups: export, change, restore from the file, keep a recovery point, survive reload', async ({
  page,
}, info) => {
  await page.goto(`/characters/${ID}/settings`);
  await saved(page);
  await expect(page.getByText('You have not saved a backup file yet.')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export all data', exact: true }).click();
  const file = info.outputPath('backup.json');
  await (await download).saveAs(file);
  await expect(page.getByText('You have not saved a backup file yet.')).toBeHidden();

  await page.goto(`/characters/${ID}/combat`);
  await saved(page);
  await page.getByRole('button', { name: 'Start combat', exact: true }).click();
  await saved(page);
  await expect(page.getByRole('button', { name: 'Start combat', exact: true })).toBeHidden();

  await page.goto(`/characters/${ID}/settings`);
  await saved(page);
  await page.getByLabel('Restore backup file', { exact: true }).setInputFiles(file);
  const sheet = page.getByRole('dialog', { name: 'Restore this backup file?' });
  await expect(sheet).toContainText('The Fool');
  await sheet.getByRole('button', { name: 'Replace and restore', exact: true }).click();
  await expect(page.getByText(/^Restored\./)).toBeVisible();
  await saved(page);

  await page.reload();
  await saved(page);
  await page.getByText(/^Recovery points/).click();
  await expect(page.getByText('Before a restore')).toBeVisible();

  await page.goto(`/characters/${ID}/combat`);
  await saved(page);
  await expect(page.getByRole('button', { name: 'Start combat', exact: true })).toBeVisible();
});

test('backups: a wrong file is refused and changes nothing', async ({ page }, info) => {
  await page.goto(`/characters/${ID}/settings`);
  await saved(page);
  const file = info.outputPath('wrong.json');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(file, '{"hello":"world"}');
  await page.getByLabel('Restore backup file', { exact: true }).setInputFiles(file);
  await expect(page.getByRole('alert')).toContainText('not an OmniDnD backup');
});
