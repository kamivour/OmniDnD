import { expect, test, type Page } from './fixtures';

const open = (page: Page) => page.getByRole('button', { name: 'Find', exact: true }).first();
const box = (page: Page) => page.getByRole('combobox', { name: 'Find', exact: true });

async function noOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(0);
}

test.describe('Find from the Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/characters/the-fool');
    await expect(open(page)).toBeVisible();
  });

  test('"jump" reaches Movement and body by keyboard', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await box(page).fill('jump');
    await expect(page.getByRole('option', { name: /Movement and body/ })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/characters\/the-fool\/explore$/);
    await expect(page.getByRole('region', { name: 'Movement and body' })).toHaveClass(
      /omni-find-highlight/,
    );
  });

  test('"/" opens Find and Esc closes it', async ({ page }) => {
    await page.getByRole('main').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('/');
    await expect(box(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(box(page)).toHaveCount(0);
  });

  test('"pdf" opens the print view', async ({ page }) => {
    await open(page).click();
    await box(page).fill('pdf');
    await page.getByRole('option', { name: /Print view/ }).click();
    await expect(page).toHaveURL(/\/characters\/the-fool\/print$/);
  });

  test('a spell the character knows goes to the Spells screen', async ({ page }) => {
    await open(page).click();
    await box(page).fill('healing word');
    await expect(page.getByRole('group', { name: 'Your character' })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/spells$/);
  });

  test('a rule hit prefills the rules search', async ({ page }) => {
    await open(page).click();
    await box(page).fill('shatter');
    await expect(page.getByRole('group', { name: 'Rules' })).toBeVisible();
    await page.getByRole('group', { name: 'Rules' }).getByRole('option').first().click();
    await expect(page).toHaveURL(/\/reference\?q=/);
    await expect(page.getByRole('searchbox', { name: 'Search rules' })).toHaveValue(/shatter/i);
  });

  test('"long rest" opens the Long Rest sheet', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await box(page).fill('long rest');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Long Rest', exact: true })).toBeVisible();
  });

  test('a map tool opens in a new tab', async ({ page, context }) => {
    await open(page).click();
    await box(page).fill('map maker');
    await expect(page.getByRole('group', { name: 'Tools' })).toBeVisible();
    const popup = context.waitForEvent('page');
    await page.getByRole('group', { name: 'Tools' }).getByRole('option').first().click();
    const tab = await popup;
    expect(tab.url()).toMatch(/^https:\/\//);
    await tab.close();
  });

  test('fits the screen and shows a message when nothing matches', async ({ page }) => {
    await open(page).click();
    await box(page).fill('zzzzqq');
    await expect(page.getByText('Nothing found for “zzzzqq”.')).toBeVisible();
    await noOverflow(page);
  });
});

test('Find works without a character, and hides character-only places', async ({ page }) => {
  await page.goto('/');
  await noOverflow(page);
  await open(page).click();
  await box(page).fill('print');
  await expect(page.getByRole('option', { name: /Print view/ })).toHaveCount(0);
  await box(page).fill('tools');
  await page.getByRole('option', { name: /^Tools Outside tools/ }).click();
  await expect(page).toHaveURL(/\/reference\/tools$/);
});
