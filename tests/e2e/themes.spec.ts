import { expect, test, type Page } from './fixtures';
import { VISIBLE_THEMES } from '../../src/theme/themes';

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

const running = (page: Page) =>
  page.evaluate(
    () =>
      document
        .getAnimations()
        .filter(
          (animation) => animation.playState === 'running' && !(animation instanceof CSSTransition),
        ).length,
  );

test('theme effects: still on phones and when Off, moving on computers', async ({
  page,
  isMobile,
}) => {
  await page.goto(`/characters/${ID}/settings`);
  // Phones default to lite; on a computer, choose Off to get the same still page.
  if (!isMobile) await page.getByRole('radio', { name: /^Off/ }).check();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.fx))
    .toBe(isMobile ? 'lite' : 'off');
  for (const { name } of VISIBLE_THEMES) {
    await page.getByRole('radio', { name: new RegExp(`^${name}`) }).check();
    await expect.poll(() => running(page), name).toBe(0);
    await expect(page.locator('.omni-ambient')).toHaveCount(0);
  }
  if (isMobile) return;

  await page.getByRole('radio', { name: /^Auto/ }).check();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.fx)).toBe('full');
  // Windows ties reduced motion to its own animations, so Auto still moves on computers (D197).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.fx)).toBe('full');
  for (const theme of VISIBLE_THEMES) {
    await page.getByRole('radio', { name: new RegExp(`^${theme.name}`) }).check();
    await expect(page.locator('.omni-ambient'), theme.id).toHaveCount(theme.ambient ? 1 : 0);
    if (theme.title || theme.ambient)
      await expect.poll(() => running(page), theme.id).toBeGreaterThan(0);
  }
});

test('Tidewater: a tap ripples on phones and computers, and Off removes it', async ({ page }) => {
  await page.goto(`/characters/${ID}/settings`);
  await page.getByRole('radio', { name: /^Tidewater/ }).check();
  const button = page.getByRole('button', { name: 'Export JSON' });
  const ripples = page.locator('.omni-ripple');
  const press = async () => {
    await button.scrollIntoViewIfNeeded();
    await button.dispatchEvent('pointerdown', { button: 0, clientX: 10, clientY: 10 });
  };

  await press();
  await expect(ripples).toHaveCount(1);
  // The ring cleans itself up and leaves the button where it was.
  await expect(ripples).toHaveCount(0);

  await page.getByRole('radio', { name: /^Off/ }).check();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.fx)).toBe('off');
  await press();
  await expect(ripples).toHaveCount(0);
});
