import { expect, test } from './fixtures';

test('step by step builds a level 1 Fighter and keeps entries when switching mode', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('article', { name: 'Campaign #273', exact: true })
    .getByRole('link', { name: 'New character', exact: true })
    .click();
  await page.getByRole('button', { name: 'Step by step', exact: true }).click();

  // Each step checks its own choices.
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Enter a name.');
  await page.getByLabel('Name', { exact: true }).fill('Step Hero');
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(page.getByLabel('Race', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0);
  await page.getByLabel('Race', { exact: true }).selectOption('race.human');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Class', { exact: true }).selectOption('class.fighter');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Background', { exact: true }).selectOption('background.acolyte');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Enter a base score');

  // Switching to One page keeps what was typed.
  await page.getByRole('button', { name: 'One page', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Step Hero');
  await page.getByRole('button', { name: 'Step by step', exact: true }).click();

  for (const [ability, score] of Object.entries({
    STR: 15,
    DEX: 13,
    CON: 14,
    INT: 8,
    WIS: 12,
    CHA: 10,
  })) {
    await page.getByLabel(`${ability} base`, { exact: true }).fill(String(score));
  }
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(page.getByText('Step Hero: Human Fighter, level 1')).toBeVisible();
  await expect(page.getByText('Max HP', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/[^/]+$/);
});
