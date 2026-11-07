import { expect, test, type Page } from './fixtures';

const ID = 'the-fool';

async function saved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

test('dice roller: off by default, on in Settings, roll and history, stays after reload', async ({
  page,
}) => {
  await page.goto(`/characters/${ID}/settings`);
  await saved(page);
  await expect(page.getByRole('button', { name: 'Open dice roller', exact: true })).toBeHidden();

  await page.getByLabel('Show dice roller', { exact: true }).check();
  const open = page.getByRole('button', { name: 'Open dice roller', exact: true });
  await expect(open).toBeVisible();
  await open.click();
  const tray = page.getByRole('dialog', { name: 'Dice roller', exact: true });
  await tray.getByRole('button', { name: 'd20', exact: true }).click();
  await tray.getByLabel('Expression', { exact: true }).fill('2d6+3');
  await tray.getByRole('button', { name: 'Roll', exact: true }).click();
  const history = tray.getByRole('region', { name: 'Roll history' });
  await expect(history.getByRole('listitem')).toHaveCount(2);
  await expect(history).toContainText('2d6+3');
  await page.keyboard.press('Escape');

  await page.goto(`/characters/${ID}/combat`);
  await saved(page);
  await page.getByRole('button', { name: 'Start combat', exact: true }).click();
  await saved(page);
  const roll = page.getByRole('button', { name: /^Roll .* to hit$/ }).first();
  await roll.click();
  await expect(page.getByRole('status', { name: /to hit result$/ }).first()).not.toBeEmpty();

  await page.reload();
  await saved(page);
  await expect(open).toBeVisible();
  await page.goto(`/characters/${ID}/settings`);
  await page.getByLabel('Show dice roller', { exact: true }).uncheck();
  await expect(open).toBeHidden();
});
