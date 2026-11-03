import { expect, test, type Page } from './fixtures';

const hud = (page: Page) =>
  page.getByRole('banner', { name: 'Character HUD', exact: true, includeHidden: true });
const hp = (page: Page) =>
  hud(page).getByRole('button', { name: 'Adjust hit points', includeHidden: true });

async function enterHitPoints(
  page: Page,
  mode: 'Damage' | 'Heal' | 'Temp HP',
  amount: number,
  screenshotPath?: string,
) {
  await hp(page).click();
  const dialog = page.getByRole('dialog', { name: 'Hit points', exact: true });
  await dialog.getByRole('tab', { name: mode, exact: true }).click();
  for (const digit of String(amount))
    await dialog.getByRole('button', { name: digit, exact: true }).click();
  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/characters/the-fool');
});

test('HUD shows the saved Fool state and computed values', async ({ page, isMobile }, info) => {
  await expect(hp(page)).toHaveText(/11\s*\/\s*19/);
  await expect(hud(page).getByRole('img', { name: 'L1: 0 of 4 left', exact: true })).toBeVisible();
  await expect(hud(page).getByRole('img', { name: 'L2: 2 of 2 left', exact: true })).toBeVisible();
  await expect(hud(page).getByRole('img', { name: 'BI: 3 of 5 left', exact: true })).toBeVisible();
  await expect(hud(page)).not.toContainText('Faerie Fire');
  await expect(hud(page).getByTitle('Armor class', { exact: true })).toContainText('13');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 21, 33)');
  await page.screenshot({
    path: info.outputPath(`hud-${isMobile ? '375' : '1440'}.png`),
    fullPage: true,
  });
});

test('damage changes HUD hit points and toast Undo restores them', async ({ page }, info) => {
  await enterHitPoints(page, 'Damage', 5, info.outputPath('hp-adjustment.png'));
  await expect(hp(page)).toHaveText(/6\s*\/\s*19/);
  await expect(page.getByRole('dialog', { name: 'Hit points', exact: true })).toBeHidden();
  await page
    .getByRole('status', { name: 'Command feedback' })
    .getByRole('button', { name: 'Undo', exact: true })
    .click();
  await expect(hp(page)).toHaveText(/11\s*\/\s*19/);
  await expect(page.getByRole('status', { name: 'Command feedback' })).toContainText('Undo:');
});

test('slot adjustment follows the character between screens', async ({ page }) => {
  await hud(page).getByRole('button', { name: 'Adjust spell slots', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Spell slots', exact: true });
  await dialog.getByRole('button', { name: 'Restore one: Level 1 spell slots' }).click();
  await page.keyboard.press('Escape');
  await expect(hud(page).getByRole('img', { name: 'L1: 1 of 4 left', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Spells', exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/characters\/the-fool\/spells$/);
  await expect(hud(page).getByRole('img', { name: 'L1: 1 of 4 left', exact: true })).toBeVisible();
});

test('class resources spend and restore through the HUD', async ({ page }) => {
  await hud(page).getByRole('button', { name: 'Adjust class resources', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Class resources', exact: true });
  await dialog.getByRole('button', { name: 'Use one: Bardic Inspiration' }).click();
  await page.keyboard.press('Escape');
  await expect(hud(page).getByRole('img', { name: 'BI: 2 of 5 left', exact: true })).toBeVisible();
  await hud(page).getByRole('button', { name: 'Adjust class resources', exact: true }).click();
  await dialog.getByRole('button', { name: 'Restore one: Bardic Inspiration' }).click();
  await page.keyboard.press('Escape');
  await expect(hud(page).getByRole('img', { name: 'BI: 3 of 5 left', exact: true })).toBeVisible();
});

test('replacing temp HP warns; Cancel preserves it and override remains undoable', async ({
  page,
}) => {
  await enterHitPoints(page, 'Temp HP', 10);
  await expect(hp(page)).toContainText('+10');
  await enterHitPoints(page, 'Temp HP', 5);
  const warning = page.getByRole('dialog', { name: 'Check this action', exact: true });
  await expect(warning).toContainText("Temp HP don't stack");
  await warning.getByRole('button', { name: 'Cancel', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Hit points', exact: true });
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Apply', exact: true })).toBeFocused();
  await expect(editor.getByLabel('Temp HP amount', { exact: true })).toHaveText('5');
  await expect(hp(page)).toContainText('+10');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await warning.getByRole('button', { name: 'Do anyway', exact: true }).click();
  await expect(hp(page)).toBeFocused();
  await expect(hp(page)).toContainText('+5');
  await page
    .getByRole('status', { name: 'Command feedback' })
    .getByRole('button', { name: 'Undo', exact: true })
    .click();
  await expect(hp(page)).toContainText('+10');
});

test('armor class shows its calculation', async ({ page }) => {
  await hud(page).getByTitle('Armor class', { exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Armor class', exact: true });
  await expect(dialog).toContainText('Leather');
  await expect(dialog).toContainText('DEX');
  await expect(dialog).toContainText('13');
});

test('conditions use commands and remain undoable', async ({ page }, info) => {
  await hud(page).getByRole('button', { name: 'Adjust conditions and effects' }).click();
  const dialog = page.getByRole('dialog', { name: 'Conditions and effects', exact: true });
  await dialog.getByRole('checkbox', { name: /^poisoned$/i }).check();
  await expect(dialog.getByRole('checkbox', { name: /^poisoned$/i })).toBeChecked();
  await page.screenshot({ path: info.outputPath('status-adjustment.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(
    hud(page).getByRole('button', { name: 'Adjust conditions and effects' }),
  ).not.toContainText('Status');
  await page
    .getByRole('status', { name: 'Command feedback' })
    .getByRole('button', { name: 'Undo', exact: true })
    .click();
  await expect(
    hud(page).getByRole('button', { name: 'Adjust conditions and effects' }),
  ).toContainText('Status');
});

test.describe('mobile', () => {
  test.skip(({ isMobile }) => !isMobile, '375 px mobile only');

  test('HUD fits two rows without horizontal overflow', async ({ page }) => {
    const bounds = await hud(page).boundingBox();
    if (!bounds) throw new Error('character HUD not rendered');
    expect(bounds.height).toBeLessThanOrEqual(112);
    expect(bounds.width).toBe(375);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      )
      .toBeLessThanOrEqual(0);
  });
});
