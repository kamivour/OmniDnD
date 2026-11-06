import { expect, test, type Page } from './fixtures';

const main = (page: Page) => page.getByRole('main');
const reminders = (page: Page) =>
  main(page).getByRole('region', { name: 'Roll reminders', exact: true });

async function saved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

test('conditions and exhaustion show roll reminders and save tags', async ({ page }) => {
  await page.goto('/characters/the-fool');
  await saved(page);
  await expect(reminders(page)).toHaveCount(0);

  await main(page).getByRole('button', { name: 'Edit conditions', exact: true }).click();
  await page.getByRole('checkbox', { name: 'stunned', exact: true }).check();
  await page.getByLabel('Exhaustion', { exact: true }).selectOption('1');
  await page.keyboard.press('Escape');

  await expect(reminders(page)).toContainText('STR and DEX saves: fail automatically');
  await expect(reminders(page)).toContainText('Ability checks');
  const abilities = main(page).getByRole('region', { name: 'Abilities', exact: true });
  await expect(abilities.getByText('Auto-fail', { exact: true })).toHaveCount(2);
  await expect(main(page).getByRole('list', { name: 'Exhaustion effects' })).toContainText(
    'Level 1: Disadvantage on ability checks',
  );
  await expect(main(page).getByRole('region', { name: 'Conditions', exact: true })).toContainText(
    'STR and DEX saves fail',
  );
  await saved(page);

  await page.goto('/characters/the-fool/combat');
  await expect(reminders(page)).toContainText('Attacks against you');
});
