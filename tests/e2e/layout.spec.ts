import { expect, test, type Page } from './fixtures';

const spellPath = '/characters/the-fool/spells';
const healingWord = (page: Page) =>
  page.getByRole('main').getByRole('button', { name: /^Healing Word/ });
const navigation = (page: Page) =>
  page.getByRole('navigation', { name: 'Main' }).filter({ visible: true });

async function expectStyled(page: Page) {
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 21, 33)');
}

async function expectNoOverflow(page: Page) {
  await expectStyled(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
}

test.describe('desktop shell', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('navigation collapses; pinned detail reopens after navigation', async ({ page }, info) => {
    await page.goto(spellPath);
    await expectStyled(page);
    await expect(navigation(page)).toHaveCSS('width', '220px');
    await page.getByRole('button', { name: 'Collapse navigation' }).click();
    await expect(navigation(page)).toHaveCSS('width', '64px');
    await expect(navigation(page).getByRole('link', { name: 'Home', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Expand navigation' }).click();
    await expect(navigation(page)).toHaveCSS('width', '220px');

    await healingWord(page).click();
    const panel = page.getByRole('complementary', { name: 'Pinned detail' });
    await expect(panel).toContainText('Healing Word');
    await expect(panel).toHaveCSS('width', '360px');
    await expectNoOverflow(page);
    await page.screenshot({ path: info.outputPath('pinned-1440.png'), fullPage: true });
    await page.getByRole('button', { name: 'Close details' }).click();
    await expect(panel).toBeHidden();
    await expect(healingWord(page)).toBeFocused();
    await navigation(page).getByRole('link', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Open details' }).click();
    await expect(panel).toContainText('Healing Word');
    await expectNoOverflow(page);
  });

  test('resizing a pinned layout keeps content within viewport', async ({ page }, info) => {
    await page.goto(spellPath);
    await expectStyled(page);
    await healingWord(page).click();
    for (const width of [1024, 768, 375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoOverflow(page);
      if (width === 1024) {
        await expect(page.getByRole('complementary', { name: 'Pinned detail' })).toHaveCSS(
          'width',
          '360px',
        );
        await page.screenshot({ path: info.outputPath('pinned-1024.png'), fullPage: true });
      }
    }
    await expect(page.getByRole('complementary', { name: 'Pinned detail' })).toContainText(
      'Healing Word',
    );
  });
});

for (const touch of [false, true]) {
  test.describe(`tablet ${touch ? 'touch' : 'mouse'}`, () => {
    test.use({ viewport: { width: 768, height: 1024 }, isMobile: touch, hasTouch: touch });

    test('pin opens right drawer; Escape and backdrop restore focus', async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'one run per tablet input mode');
      await page.goto(spellPath);
      await expectStyled(page);
      await expect(navigation(page)).toHaveCSS('width', '64px');
      const trigger = healingWord(page);
      if (touch) await trigger.tap();
      else await trigger.click();

      const drawer = page.getByRole('dialog', { name: 'Details', exact: true });
      await expect(drawer).toContainText('Healing Word');
      const bounds = await drawer.boundingBox();
      if (!bounds) throw new Error('detail drawer not rendered');
      expect(bounds.width).toBe(360);
      expect(bounds.x + bounds.width).toBe(768);
      await expectNoOverflow(page);
      await page.screenshot({ path: info.outputPath('tablet-drawer.png'), fullPage: true });
      await page.keyboard.press('Escape');
      await expect(drawer).toBeHidden();
      await expect(trigger).toBeFocused();

      await trigger.press('Enter');
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
      const backdrop = page.getByTestId('sheet-backdrop');
      if (touch) await backdrop.tap({ position: { x: 120, y: 200 } });
      else await backdrop.click({ position: { x: 120, y: 200 } });
      await expect(drawer).toBeHidden();
      await expect(trigger).toBeFocused();

      await navigation(page).getByRole('link', { name: 'Combat', exact: true }).click();
      await page.getByRole('tab', { name: 'Bonus', exact: true }).click();
      if (touch) await healingWord(page).tap();
      else await healingWord(page).click();
      await expect(drawer.getByRole('button', { name: /^L1/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(
        drawer.getByRole('button', { name: 'Cast Healing Word (L1)', exact: true }),
      ).toBeVisible();
      await expectNoOverflow(page);
      await page.screenshot({ path: info.outputPath('tablet-combat-cast.png'), fullPage: true });
      await page.keyboard.press('Escape');
      await page.getByRole('tab', { name: 'Actions', exact: true }).click();
      await page.getByRole('main').getByRole('button', { name: /^Dash/ }).click();
      await drawer.getByRole('button', { name: 'Take Dash', exact: true }).click();
      await expect(page.getByRole('status', { name: 'Command feedback' })).toContainText('Dash');
    });
  });
}

test.describe('mobile shell', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile only');

  test('five navigation items and More route without covering content', async ({ page }, info) => {
    await page.goto('/characters/the-fool');
    await expectStyled(page);
    const nav = navigation(page);
    await expect(nav.getByRole('link')).toHaveText(['Home', 'Combat', 'Spells', 'Inv']);
    await nav.getByRole('link', { name: 'Combat', exact: true }).tap();
    await expect(nav.getByRole('link', { name: 'Combat', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expectNoOverflow(page);
    await page.screenshot({ path: info.outputPath('mobile-shell.png'), fullPage: true });
    await nav.getByRole('button', { name: 'More', exact: true }).tap();
    const more = page.getByRole('dialog', { name: 'More', exact: true });
    await more.getByRole('link', { name: 'Sheet', exact: true }).tap();
    await expect(more).toBeHidden();
    await expect(page).toHaveURL(/\/characters\/the-fool\/sheet$/);
    await expectNoOverflow(page);
  });
});
