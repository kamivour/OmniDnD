import { readFile } from 'node:fs/promises';
import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import { ExportFileSchema, type ExportFile } from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

const main = (page: Page) => page.getByRole('main');

async function saved(page: Page) {
  await expect(page.locator('[role="status"][aria-label="Local save status"]')).toContainText(
    'Saved locally',
  );
}

function fixture(): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = 'custom';
  file.build.name = 'custom';
  file.build.items = [{ instanceId: 'pack', itemId: 'item.backpack' }];
  file.live.characterId = 'custom';
  file.live.items = { pack: { qty: 1, equipped: false, attuned: false } };
  file.events = [];
  return file;
}

test('creates a custom weapon that attacks, edits it, and keeps it in the export', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/');
  await saved(page);
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: 'custom.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture())),
  });
  const importing = page.getByRole('dialog', { name: 'Import character', exact: true });
  await importing.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(importing).toBeHidden();
  await page.goto('/characters/custom/inventory');
  await saved(page);

  await main(page).getByRole('button', { name: 'Create item', exact: true }).click();
  const form = page.getByRole('form', { name: 'Create custom item' });
  await form.getByLabel('Name', { exact: true }).fill('Moon Blade');
  await form.getByLabel('Type', { exact: true }).selectOption('weapon');
  await form.getByRole('button', { name: 'Create item', exact: true }).click();
  await expect(form).toContainText('Choose which weapon it is based on.');
  await form.getByLabel('Based on', { exact: true }).selectOption({ label: 'Rapier' });
  await form.getByLabel('Rarity', { exact: true }).selectOption('rare');
  await form.getByLabel('Description', { exact: true }).fill('A test blade that glows.');
  await form.getByLabel('Maximum charges', { exact: true }).fill('3');
  await form.getByLabel('Dice', { exact: true }).fill('1d3');
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
  await page.screenshot({
    path: info.outputPath(`custom-item-form-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  await form.getByRole('button', { name: 'Create item', exact: true }).click();
  await expect(form).toBeHidden();
  await saved(page);

  const blade = main(page).getByRole('article', { name: 'Moon Blade' });
  await expect(blade).toContainText('weapon');
  await blade.getByRole('checkbox', { name: 'Equipped: Moon Blade', exact: true }).check();
  await saved(page);

  await main(page)
    .getByRole('button', { name: 'Edit custom item: Moon Blade', exact: true })
    .click();
  const edit = page.getByRole('form', { name: 'Edit custom item' });
  await edit.getByLabel('Name', { exact: true }).fill('Star Blade');
  await edit.getByRole('button', { name: 'Save item', exact: true }).click();
  await expect(edit).toBeHidden();
  await saved(page);
  await expect(main(page).getByRole('article', { name: 'Star Blade' })).toBeVisible();

  await page.goto('/characters/custom/combat');
  await saved(page);
  await expect(main(page)).toContainText('Star Blade');

  await page.goto('/characters/custom/settings');
  await saved(page);
  const downloading = page.waitForEvent('download');
  await main(page).getByRole('button', { name: 'Export JSON', exact: true }).click();
  const exported = ExportFileSchema.parse(
    JSON.parse(await readFile((await (await downloading).path())!, 'utf8')),
  );
  expect(exported.build.customItems).toEqual([
    expect.objectContaining({
      id: 'item.custom.moon-blade',
      name: 'Star Blade',
      baseItemId: 'item.rapier',
      charges: { max: 3, recharge: 'dawn', regain: { dice: '1d3' } },
    }),
  ]);
});
