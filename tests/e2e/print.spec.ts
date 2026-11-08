import { expect, test } from './fixtures';

test('print view shows the sheet on light paper and offers Print / Save as PDF', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('article', { name: 'Campaign #273', exact: true })
    .getByRole('link', { name: 'New character', exact: true })
    .click();
  await page.getByLabel('Name', { exact: true }).fill('Paper Wizard');
  await page.getByLabel('Race', { exact: true }).selectOption('race.human');
  await page.getByLabel('Class', { exact: true }).selectOption('class.wizard');
  await page.getByLabel('Background', { exact: true }).selectOption('background.acolyte');
  for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
    await page.getByLabel(`${ability} base`, { exact: true }).fill('13');
  }
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/[^/]+$/);

  await page.goto(page.url() + '/sheet');
  await page.getByRole('link', { name: 'Print', exact: true }).click();
  await expect(page).toHaveURL(/\/print$/);
  await expect(page.getByRole('heading', { name: 'Paper Wizard', level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Skills' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Spellcasting' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print / Save as PDF' })).toBeVisible();

  // Dark app theme, but the paper stays light, and the buttons vanish in print.
  await page.emulateMedia({ media: 'print' });
  const background = await page
    .locator('.print-sheet')
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(background).toBe('rgb(255, 255, 255)');
  await expect(page.getByRole('button', { name: 'Print / Save as PDF' })).toBeHidden();
});
