import { expect, test, type Page } from './fixtures';

const campaign = (page: Page) => page.getByRole('article', { name: 'Campaign #273', exact: true });

async function turnOnCustomOrigin(page: Page) {
  await page.goto('/');
  await campaign(page).getByRole('link', { name: 'Campaign settings', exact: true }).click();
  await page
    .getByRole('group', { name: 'Optional rules', exact: true })
    .getByRole('checkbox', { name: /^Tasha's custom origin/ })
    .check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL('/');
}

async function openNewCharacter(page: Page) {
  await page.goto('/');
  await campaign(page).getByRole('link', { name: 'New character', exact: true }).click();
}

test('new character points to the rule, then moves every racial increase', async ({ page }) => {
  await openNewCharacter(page);
  await page.getByLabel('Race', { exact: true }).selectOption('race.hill-dwarf');
  await expect(page.getByRole('link', { name: 'Campaign settings' }).last()).toHaveAttribute(
    'href',
    /\/campaigns\/.+\/settings$/,
  );
  await expect(page.getByText("Tasha's custom origin lets you move")).toBeVisible();

  await turnOnCustomOrigin(page);
  await openNewCharacter(page);
  await page.getByLabel('Name', { exact: true }).fill('Moved Dwarf');
  await page.getByLabel('Race', { exact: true }).selectOption('race.hill-dwarf');
  await page.getByLabel('Class', { exact: true }).selectOption('class.wizard');
  await page.getByLabel('Background', { exact: true }).selectOption('background.acolyte');
  for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
    await page.getByLabel(`${ability} base`, { exact: true }).fill('13');
  }
  await page.getByLabel('Move racial increases to other abilities').check();
  await expect(page.getByLabel('Increase 1 (+2)')).toHaveValue('CON');
  await expect(page.getByLabel('Increase 2 (+1)')).toHaveValue('WIS');
  await page.getByLabel('Increase 1 (+2)').selectOption('INT');
  await page.getByLabel('Increase 2 (+1)').selectOption('DEX');
  await expect(page.getByRole('row', { name: /^INT/ })).toContainText('15');
  await expect(page.getByRole('row', { name: /^CON/ })).toContainText('13');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/(?!new$)[^/]+$/);
});

test('the sheet moves all three Half-Elf increases', async ({ page }) => {
  await turnOnCustomOrigin(page);
  await page.goto('/characters/the-fool/sheet');
  const main = page.getByRole('main');
  await main.getByRole('button', { name: 'Edit character', exact: true }).click();
  const section = main.getByRole('region', { name: 'Custom origin', exact: true });
  await expect(section.getByLabel('Increase 1 (+2)')).toHaveValue('CHA');
  await expect(section.getByLabel('Increase 3 (+1)')).toHaveValue('');
  await section.getByLabel('Increase 1 (+2)').selectOption('DEX');
  await section.getByLabel('Increase 2 (+1)').selectOption('CHA');
  await expect(section.getByLabel('Increase 3 (+1)').locator('option[value="DEX"]')).toBeDisabled();
  await section.getByLabel('Increase 3 (+1)').selectOption('CON');
  await section.getByRole('button', { name: 'Apply custom origin', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Character log', exact: true })).toContainText(
    'Custom origin: DEX +2, CHA +1, CON +1',
  );
});
