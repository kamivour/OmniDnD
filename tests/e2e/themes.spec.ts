import { expect, test, type Page } from './fixtures';

const ID = 'the-fool';

const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);
const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

async function noOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(0);
}

test('themes: System follows the device, Parchment and Dark are chosen and remembered', async ({
  page,
  isMobile,
}, info) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(`/characters/${ID}/settings`);
  await expect.poll(() => theme(page)).toBe('parchment');

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => theme(page)).toBe('dark');
  const darkBackground = await background(page);

  await page.getByRole('radio', { name: /^Parchment/ }).check();
  await expect.poll(() => theme(page)).toBe('parchment');
  expect(await background(page)).not.toBe(darkBackground);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`parchment-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });

  await page.goto(`/characters/${ID}`);
  await expect.poll(() => theme(page)).toBe('parchment');
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`parchment-sheet-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });

  await page.reload();
  await expect.poll(() => theme(page)).toBe('parchment');

  await page.goto(`/characters/${ID}/settings`);
  await page.getByRole('radio', { name: /^Dark/ }).check();
  await expect.poll(() => theme(page)).toBe('dark');
  expect(await background(page)).toBe(darkBackground);
});
