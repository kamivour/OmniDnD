import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import { ExportFileSchema, type ExportFile } from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

const main = (page: Page) => page.getByRole('main');
const potion = (page: Page) => main(page).getByRole('article', { name: 'Potion of Healing' });

async function saved(page: Page) {
  await expect(page.locator('[role="status"][aria-label="Local save status"]')).toContainText(
    'Saved locally',
  );
}

function fixture(): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = 'items';
  file.build.name = 'items';
  file.build.items = [
    { instanceId: 'potion', itemId: 'item.potion-of-healing-common' },
    { instanceId: 'acid', itemId: 'item.acid-vial' },
    { instanceId: 'pack', itemId: 'item.backpack' },
  ];
  file.live.characterId = 'items';
  file.live.hp = 5;
  file.live.items = {
    potion: { qty: 2, equipped: false, attuned: false },
    acid: { qty: 1, equipped: false, attuned: false },
    pack: { qty: 1, equipped: false, attuned: false },
  };
  file.events = [];
  return file;
}

test('drinks a potion with an entered roll in combat, warns on a second action and undoes', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/');
  await saved(page);
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: 'items.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture())),
  });
  const importing = page.getByRole('dialog', { name: 'Import character', exact: true });
  await importing.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(importing).toBeHidden();
  await page.goto('/characters/items/combat');
  await saved(page);
  await main(page).getByRole('button', { name: 'Start combat', exact: true }).click();
  await saved(page);
  await main(page).getByRole('button', { name: 'Start Turn', exact: true }).click();
  await saved(page);

  await main(page).getByRole('tab', { name: 'Items', exact: true }).click();
  const panel = main(page).getByRole('tabpanel', { name: 'Items', exact: true });
  await expect(panel.getByRole('article')).toHaveCount(2);
  await expect(potion(page)).toContainText('Action to use or give · regains 2d4 + 2 HP');
  const drink = potion(page).getByRole('button', { name: 'Drink: Potion of Healing' });
  await expect(drink).toBeDisabled();
  await potion(page).getByLabel('2d4 roll').fill('6');
  await drink.click();
  await saved(page);
  await expect(potion(page)).toContainText('× 1');
  await expect(page.getByRole('banner')).toContainText('13');
  await expect(panel).toContainText('Action used');

  const acid = main(page).getByRole('article', { name: 'Acid (vial)' });
  await acid.getByRole('button', { name: 'Throw: Acid (vial)' }).click();
  const warning = page.getByRole('dialog', { name: 'Check this action', exact: true });
  await expect(warning).toContainText('Action already used');
  await warning.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(acid).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
  await page.screenshot({
    path: info.outputPath(`combat-items-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });

  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await saved(page);
  await expect(potion(page)).toContainText('× 2');
});
