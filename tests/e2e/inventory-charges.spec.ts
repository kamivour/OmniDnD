import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import { ExportFileSchema, type ExportFile } from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

const main = (page: Page) => page.getByRole('main');
const wand = (page: Page) => main(page).getByRole('article', { name: 'Wand of Magic Missiles' });
const charges = (page: Page) =>
  wand(page).getByLabel('Charges: Wand of Magic Missiles', { exact: true });

async function saved(page: Page) {
  await expect(page.locator('[role="status"][aria-label="Local save status"]')).toContainText(
    'Saved locally',
  );
}

function fixture(): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = 'charges';
  file.build.name = 'charges';
  file.build.items = [{ instanceId: 'wand', itemId: 'item.wand-of-magic-missiles' }];
  file.live.characterId = 'charges';
  file.live.items = {
    wand: { qty: 1, equipped: false, attuned: false, charges: 2, rechargePending: true },
  };
  file.events = [];
  return file;
}

test('spends a charge, applies an entered regain roll and undoes it', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/');
  await saved(page);
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: 'charges.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture())),
  });
  const importing = page.getByRole('dialog', { name: 'Import character', exact: true });
  await importing.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(importing).toBeHidden();
  await page.goto('/characters/charges/inventory');
  await saved(page);

  const due = main(page).getByRole('region', { name: 'Recharges due' });
  await expect(due).toContainText('Wand of Magic Missiles');
  await expect(charges(page)).toHaveText('2/7 charges');
  await expect(wand(page)).toContainText('Regains 1d6 + 1 at dawn');

  await wand(page).getByRole('button', { name: 'Use 1 charge: Wand of Magic Missiles' }).click();
  await saved(page);
  await expect(charges(page)).toHaveText('1/7 charges');

  const prompt = wand(page).getByRole('group', { name: 'Recharge: Wand of Magic Missiles' });
  await expect(prompt).toContainText('roll 1d6 + 1');
  await prompt.getByLabel('1d6 roll').fill('5');
  await prompt.getByRole('button', { name: 'Apply', exact: true }).click();
  await saved(page);
  await expect(charges(page)).toHaveText('7/7 charges');
  await expect(due).toBeHidden();
  await expect(prompt).toBeHidden();

  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
  await page.screenshot({
    path: info.outputPath(`charges-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });

  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await saved(page);
  await expect(charges(page)).toHaveText('1/7 charges');
  await expect(due).toBeVisible();
});
