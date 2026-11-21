import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import { ExportFileSchema } from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

const saved = (page: Page) =>
  expect(page.locator('[role="status"][aria-label="Save status"]')).toContainText(
    'Saved on this device',
  );

async function importWithBag(page: Page) {
  const file = ExportFileSchema.parse(seed);
  file.build.id = 'bag-fool';
  file.build.name = 'Bag Fool';
  file.live.characterId = file.build.id;
  file.events = [];
  file.build.items.push({ instanceId: 'bag-1', itemId: 'item.bag-of-holding' });
  file.live.items['bag-1'] = { qty: 1, equipped: false, attuned: false };
  await page.goto('/settings');
  await saved(page);
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: 'bag-fool.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  const importing = page.getByRole('dialog', { name: 'Import character', exact: true });
  await importing.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(importing).toBeHidden();
  await saved(page);
  await page.goto('/characters/bag-fool/inventory');
  await saved(page);
}

test('a Bag of Holding shows its fill and its contents add no carried weight', async ({ page }) => {
  await importWithBag(page);
  const bag = page.getByRole('main').getByRole('article', { name: 'Bag of Holding', exact: true });
  await expect(bag).toContainText('Holds 0 of 500 lb · up to 64 cu ft · 0 items inside');
  await expect(bag).toContainText('Contents add no carried weight.');
  const itemWeight = page
    .getByRole('region', { name: 'Carried weight' })
    .locator('div', { has: page.getByText('Known item weight', { exact: true }) })
    .locator('dd');
  const before = parseFloat((await itemWeight.textContent()) ?? '');

  await bag.getByRole('button', { name: 'Put in Bag of Holding', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Put in Bag of Holding', exact: true });
  await sheet.getByRole('button', { name: /^Rations/ }).click();
  await expect(sheet).toBeHidden();
  await saved(page);
  await expect(bag).toContainText('Holds 12 of 500 lb');
  await expect(bag).toContainText('1 item inside');
  await expect(itemWeight).toHaveText(`${before - 12} lb`);

  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await saved(page);
  await expect(bag).toContainText('Holds 0 of 500 lb');
  await expect(itemWeight).toHaveText(`${before} lb`);
});
