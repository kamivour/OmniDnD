import { expect, test } from './fixtures';

test.use({ showRoles: true });

test('new campaign asks for a role, saves it and offers the DM option on characters', async ({
  page,
}) => {
  await page.goto('/campaigns/new');
  const ask = page.getByRole('dialog', { name: 'How will you use this campaign?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: /I'm the DM/ }).click();
  await expect(ask).toBeHidden();
  await expect(page.getByRole('radio', { name: /I'm the DM/ })).toBeChecked();
  await page.getByLabel('Name', { exact: true }).fill('Role test');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await expect(page).toHaveURL('/');

  await page
    .getByRole('article', { name: 'Role test', exact: true })
    .getByRole('link', { name: 'New character', exact: true })
    .click();
  const who = page.getByRole('dialog', { name: 'Who plays this character?' });
  await expect(who).toBeVisible();
  await expect(who.getByRole('button', { name: /The DM/ })).toBeVisible();
  await who.getByRole('button', { name: /Another player/ }).click();
  await expect(page.getByText('Played by: Another player')).toBeVisible();
});

test('a player campaign does not offer the DM character option; Skip uses the default', async ({
  page,
}) => {
  await page.goto('/campaigns/new');
  await expect(page.getByRole('dialog', { name: 'How will you use this campaign?' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('radio', { name: /I'm a player/ })).toBeChecked();
  await page.getByLabel('Name', { exact: true }).fill('Player test');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await page
    .getByRole('article', { name: 'Player test', exact: true })
    .getByRole('link', { name: 'New character', exact: true })
    .click();
  const who = page.getByRole('dialog', { name: 'Who plays this character?' });
  await expect(who.getByRole('button', { name: /Another player/ })).toBeVisible();
  await expect(who.getByRole('button', { name: /The DM/ })).toHaveCount(0);
});

test("Don't ask again stops the questions", async ({ page }) => {
  await page.goto('/campaigns/new');
  const ask = page.getByRole('dialog', { name: 'How will you use this campaign?' });
  await ask.getByLabel("Don't ask again on this device").check();
  await ask.getByRole('button', { name: /I'm a player/ }).click();
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
