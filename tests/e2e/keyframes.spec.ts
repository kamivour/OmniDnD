import { expect, test } from '@playwright/test';
import { join } from 'node:path';

/**
 * Key-frame screenshots for M1 sign-off. Skipped unless OMNI_SHOTS is set to an output folder:
 *   OMNI_SHOTS=./shots npx playwright test keyframes
 */
const dir = process.env.OMNI_SHOTS;

const FRAMES = [
  { name: 'campaigns', path: '/' },
  { name: 'campaign-settings', path: '/campaigns/273/settings' },
  { name: 'new-character', path: '/campaigns/273/characters/new' },
  { name: 'home', path: '/characters/the-fool' },
  { name: 'combat', path: '/characters/the-fool/combat' },
  { name: 'spells', path: '/characters/the-fool/spells' },
];

test.skip(!dir, 'set OMNI_SHOTS to capture key frames');

for (const frame of FRAMES) {
  test(`capture ${frame.name}`, async ({ page }, info) => {
    await page.goto(frame.path);
    // Stylesheet loaded (a refused asset request would capture an unstyled page).
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 21, 33)');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: join(dir ?? '', `${frame.name}-${info.project.name}.png`),
      fullPage: true,
    });
  });
}
