import { expect, test } from './fixtures';
import { importReview, reviewFile, reviewState } from './review-fixtures';

test('Find reaches Join a campaign from an owned character', async ({ page }) => {
  await page.goto('/characters/the-fool');
  await page.getByRole('button', { name: 'Find', exact: true }).first().click();
  await page.getByRole('combobox', { name: 'Find', exact: true }).fill('campaign id');
  await page.getByRole('option', { name: /Join a campaign/ }).click();
  await expect(page).toHaveURL(/\/join$/);
  await expect(page.getByRole('heading', { name: 'Join a campaign', exact: true })).toBeVisible();
});

test('party characters use a separate reader on every character route, including offline', async ({
  page,
  context,
}) => {
  const file = reviewFile('viewer-friend');
  file.build.partyOwner = { userId: 'friend', name: 'Ana' };
  file.build.journal.notes = 'Private cached note';
  await importReview(page, file, 'sheet', false);
  const before = await reviewState(page, file.build.id);
  await expect(page.getByRole('note', { name: 'View only' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Edit|Cast |Apply damage|Undo last command/ }),
  ).toHaveCount(0);
  for (const name of ['Spells', 'Equipment', 'Features', 'Companions', 'Sheet']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByText('Private cached note', { exact: true })).toHaveCount(0);
  expect(await reviewState(page, file.build.id)).toEqual(before);
  await page.goto('/characters/viewer-friend/combat');
  await expect(page.getByRole('note', { name: 'View only' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('party-reader.png'), fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await context.unrouteAll({ behavior: 'wait' });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('note', { name: 'View only' })).toBeVisible();
  expect(await reviewState(page, file.build.id)).toEqual(before);
});
