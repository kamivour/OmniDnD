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

test('a Bag of Holding records new catalogue items and custom contents directly', async ({
  page,
}) => {
  await importWithBag(page);
  const bag = page.getByRole('article', { name: 'Bag of Holding', exact: true });
  const put = bag.getByRole('button', { name: 'Put in Bag of Holding', exact: true });
  const picker = page.getByRole('dialog', { name: 'Put in Bag of Holding', exact: true });
  const contents = page.getByRole('region', { name: 'Bag of Holding', exact: true });
  const carriedWeight = page
    .getByRole('region', { name: 'Carried weight' })
    .getByText('Known item weight', { exact: true })
    .locator('..')
    .locator('dd');
  const before = await carriedWeight.textContent();

  await put.click();
  await picker.getByRole('button', { name: 'Create custom item', exact: true }).click();
  const custom = page.getByRole('form', { name: 'Create custom item', exact: true });
  await expect(custom.getByRole('combobox', { name: 'Container' })).toHaveValue('bag-1');
  await expect(custom.getByLabel('Name', { exact: true })).toBeFocused();
  await custom.getByLabel('Name', { exact: true }).fill('Water');
  await custom.getByLabel('Type', { exact: true }).selectOption('gear');
  await custom.getByLabel('Unit', { exact: true }).fill('liter');
  await custom.getByLabel('Weight per unit (lb)').fill('2.2');
  await custom.getByLabel('Quantity', { exact: true }).fill('40');
  await custom.getByRole('button', { name: 'Create item', exact: true }).click();
  await expect(custom).toBeHidden();
  await saved(page);
  await expect(put).toBeFocused();
  await expect(contents.getByRole('article', { name: 'Water', exact: true })).toBeVisible();
  await expect(bag).toContainText('Holds 88 of 500 lb');
  await expect(carriedWeight).toHaveText(before!);

  await put.click();
  await picker.getByRole('button', { name: 'Add from catalogue', exact: true }).click();
  const add = page.getByRole('dialog', { name: 'Add item', exact: true });
  const search = add.getByRole('searchbox', { name: 'Search items', exact: true });
  await expect(search).toBeFocused();
  await search.fill('dagger');
  await add.getByRole('button', { name: 'Select Dagger', exact: true }).click();
  await expect(add.getByRole('combobox', { name: 'Container' })).toHaveValue('bag-1');
  await add.getByLabel('Notes', { exact: true }).fill('Borrowed from a party member');
  await add.getByRole('button', { name: 'Add item', exact: true }).click();
  await expect(add).toBeHidden();
  await saved(page);
  await expect(contents.getByRole('article', { name: 'Dagger', exact: true })).toContainText(
    'Borrowed from a party member',
  );
  await expect(bag).toContainText('Holds 89 of 500 lb');
  await expect(carriedWeight).toHaveText(before!);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.reload();
  await expect(bag).toContainText('Holds 89 of 500 lb');
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await saved(page);
  await expect(bag).toContainText('Holds 88 of 500 lb');
});
