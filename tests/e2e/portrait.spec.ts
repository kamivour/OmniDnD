import { expect, test, type Page } from './fixtures';

// A 1x1 PNG; the app crops it to a square JPEG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const main = (page: Page) => page.getByRole('main');

test('a portrait can be added from a picture file, shown in the HUD, and removed', async ({
  page,
}) => {
  await page.goto('/characters/the-fool/sheet');
  await main(page).getByRole('button', { name: 'Edit character', exact: true }).click();
  const form = main(page).getByRole('form', { name: 'Edit character build' });
  await form.getByLabel('Portrait file').setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(form.getByRole('button', { name: 'Remove portrait' })).toBeVisible();
  await form.getByRole('button', { name: 'Save changes' }).click();
  const stored = await page.evaluate(() => document.querySelector('main img')?.getAttribute('src'));
  expect(stored).toMatch(/^data:image\/jpeg;base64,/);

  await main(page).getByRole('button', { name: 'Edit character', exact: true }).click();
  await main(page)
    .getByRole('form', { name: 'Edit character build' })
    .getByRole('button', { name: 'Remove portrait' })
    .click();
  await main(page)
    .getByRole('form', { name: 'Edit character build' })
    .getByRole('button', { name: 'Save changes' })
    .click();
  await expect(page.locator('main img[src^="data:image/jpeg"]')).toHaveCount(0);
});

test('a file that is not a picture is refused with a message', async ({ page }) => {
  await page.goto('/characters/the-fool/sheet');
  await main(page).getByRole('button', { name: 'Edit character', exact: true }).click();
  const form = main(page).getByRole('form', { name: 'Edit character build' });
  await form.getByLabel('Portrait file').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  });
  await expect(form.getByRole('alert')).toContainText('Choose an image file');
});
