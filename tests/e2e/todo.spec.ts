import { expect, test } from './fixtures';

test('skipped level choices wait on the To do list and clear when chosen', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('article', { name: 'Campaign #273', exact: true })
    .getByRole('link', { name: 'New character', exact: true })
    .click();
  await page.getByLabel('Name', { exact: true }).fill('Todo Hero');
  await page.getByLabel('Race', { exact: true }).selectOption('race.human');
  await page.getByLabel('Class', { exact: true }).selectOption('class.fighter');
  await page.getByLabel('Background', { exact: true }).selectOption('background.acolyte');
  await page.getByLabel('Level', { exact: true }).fill('3');
  for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
    await page.getByLabel(`${ability} base`, { exact: true }).fill('12');
  }
  for (const at of [2, 3]) await page.getByLabel(`Level ${at} roll (d10)`).fill('6');
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/[^/]+$/);

  // Home names what is waiting, and the list opens.
  await expect(page.getByRole('region', { name: 'To do' })).toContainText('choices are waiting');
  await page.getByRole('link', { name: 'Open list' }).click();
  await expect(page.getByRole('heading', { name: 'To do' })).toBeVisible();
  await expect(page.getByText('Choose a Fighter subclass')).toBeVisible();

  // Choose the subclass; the item clears.
  const subclass = page.getByRole('listitem').filter({ hasText: 'Choose a Fighter subclass' });
  await subclass.getByRole('button', { name: 'Choose', exact: true }).click();
  await subclass.getByLabel('Subclass', { exact: true }).selectOption('subclass.fighter.champion');
  await subclass.getByRole('button', { name: 'Save choice' }).click();
  await expect(page.getByText('Choose a Fighter subclass')).toHaveCount(0);

  // Fighting Style: pick one.
  const style = page.getByRole('listitem').filter({ hasText: 'Fighting Style' });
  await style.getByRole('button', { name: 'Choose', exact: true }).click();
  await style.getByRole('checkbox', { name: 'Defense' }).check();
  await style.getByRole('button', { name: 'Save choice' }).click();
  await expect(page.getByText('Nothing left to decide.')).toBeVisible();
});
