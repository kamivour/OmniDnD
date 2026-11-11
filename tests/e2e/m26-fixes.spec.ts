import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function openNewCharacter(page: Page) {
  await page.goto('/');
  await page
    .getByRole('article', { name: 'Campaign #273', exact: true })
    .getByRole('link', { name: 'New character', exact: true })
    .click();
}

test('Level can be cleared with Backspace and retyped; it is checked on leaving', async ({
  page,
}) => {
  await openNewCharacter(page);
  const level = page.getByLabel('Level', { exact: true });
  await level.click();
  await level.press('Control+a');
  await level.press('Backspace');
  await expect(level).toHaveValue('');
  await level.pressSequentially('7');
  await expect(level).toHaveValue('7');
  await level.press('Control+a');
  await level.press('Backspace');
  await level.blur();
  await expect(level).toHaveValue('7');
});

test('Enter in an ability score moves to the next score', async ({ page }) => {
  await openNewCharacter(page);
  const str = page.getByLabel('STR base', { exact: true });
  await str.fill('8');
  await str.press('Enter');
  await expect(page.getByLabel('DEX base', { exact: true })).toBeFocused();
  await expect(page).toHaveURL(/characters\/new$/);
});

test('alignment list says True Neutral', async ({ page }) => {
  await openNewCharacter(page);
  await expect(
    page.getByLabel('Alignment', { exact: true }).locator('option', { hasText: 'True Neutral' }),
  ).toHaveCount(1);
});

test('Pending at level 1 lists first-level spells, not cantrips, until Show all', async ({
  page,
}) => {
  await openNewCharacter(page);
  await page.getByLabel('Name', { exact: true }).fill('Pending Wizard');
  await page.getByLabel('Race', { exact: true }).selectOption('race.human');
  await page.getByLabel('Class', { exact: true }).selectOption('class.wizard');
  await page.getByLabel('Background', { exact: true }).selectOption('background.acolyte');
  for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
    await page.getByLabel(`${ability} base`, { exact: true }).fill('13');
  }
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/(?!new$)[^/]+$/);
  await page.goto(`${new URL(page.url()).pathname}/spells`);
  await page.getByRole('button', { name: /Pending.*spellbook spells/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Manage spells' });
  await expect(sheet.getByText('Add to spellbook')).toBeVisible();
  await expect(sheet.getByText('Cantrips to know')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Show all', exact: true }).click();
  await expect(sheet.getByText('Cantrips to know')).toBeVisible();
});
