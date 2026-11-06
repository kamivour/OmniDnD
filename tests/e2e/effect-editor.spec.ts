import { expect, test, type Page } from './fixtures';

const main = (page: Page) => page.getByRole('main');
const effects = (page: Page) =>
  main(page).getByRole('region', { name: 'Effects on you', exact: true });
const editor = (page: Page) => page.getByRole('dialog');
const log = (page: Page) => page.getByRole('region', { name: 'Character log', exact: true });

async function saved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

async function noOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
}

test('add, edit and end an effect with a damage defense', async ({ page }) => {
  await page.goto('/characters/the-fool/explore');
  await saved(page);
  await effects(page).getByRole('button', { name: 'Add effect', exact: true }).click();
  await editor(page).getByLabel('Name', { exact: true }).fill('Potion of Fire Resistance');
  await editor(page).getByLabel('Lasts', { exact: true }).selectOption('hours');
  await editor(page).getByLabel('Amount', { exact: true }).fill('1');
  await editor(page).locator('summary', { hasText: 'Damage resistance' }).click();
  await editor(page).getByLabel('Fire', { exact: true }).selectOption('resistances');
  await noOverflow(page);
  await editor(page).getByRole('button', { name: 'Add effect', exact: true }).click();
  await expect(editor(page)).toHaveCount(0);
  await expect(effects(page)).toContainText('Potion of Fire Resistance');
  await expect(effects(page)).toContainText('1 h left');
  await saved(page);

  await page.goto('/characters/the-fool/sheet');
  await expect(main(page)).toContainText('Fire (Potion of Fire Resistance)');

  await page.goto('/characters/the-fool/explore');
  await effects(page)
    .getByRole('button', { name: 'Edit effect: Potion of Fire Resistance', exact: true })
    .click();
  await expect(editor(page).getByLabel('Fire', { exact: true })).toHaveValue('resistances');
  await editor(page).getByLabel('Also ends', { exact: true }).selectOption('long-rest');
  await editor(page).getByRole('button', { name: 'Save effect', exact: true }).click();
  await expect(effects(page)).toContainText('or until a long rest');
  await saved(page);

  await effects(page).getByRole('button', { name: /^End/ }).first().click();
  await expect(effects(page)).not.toContainText('Potion of Fire Resistance');
  await log(page).getByRole('button', { name: 'Undo last command', exact: true }).click();
  await expect(effects(page)).toContainText('Potion of Fire Resistance');
  await saved(page);
  await page.reload();
  await expect(effects(page)).toContainText('or until a long rest');
});

test('turn timing ends an effect at the start of your next turn', async ({ page }) => {
  await page.goto('/characters/the-fool/combat');
  await saved(page);
  await main(page).getByRole('button', { name: 'Start combat', exact: true }).click();
  await main(page).getByRole('button', { name: 'Start Turn', exact: true }).click();
  await effects(page).getByRole('button', { name: 'Add effect', exact: true }).click();
  await editor(page).getByLabel('Name', { exact: true }).fill('Shielded by ally');
  await editor(page).getByLabel('Lasts', { exact: true }).selectOption('none');
  await editor(page).getByLabel('Also ends', { exact: true }).selectOption('turn-start');
  await editor(page).getByRole('button', { name: 'Add effect', exact: true }).click();
  await expect(effects(page)).toContainText('Shielded by ally');
  await main(page).getByRole('button', { name: 'End Turn', exact: true }).click();
  await expect(effects(page)).toContainText('Shielded by ally');
  await main(page).getByRole('button', { name: 'Start Turn', exact: true }).click();
  await expect(effects(page)).not.toContainText('Shielded by ally');
  await saved(page);
});
