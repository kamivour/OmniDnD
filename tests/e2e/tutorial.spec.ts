import { expect, test } from './fixtures';

test.describe('first visit', () => {
  test.use({ showTutorial: true });

  test('shows Welcome once; Skip on the first card never shows it again', async ({ page }) => {
    await page.goto('/');
    const card = page.getByRole('dialog', { name: 'Welcome to OmniDnD' });
    await expect(card).toBeVisible();
    await expect(card.getByText('1 of 7')).toBeVisible();
    await card.getByRole('button', { name: 'Skip tutorial' }).click();
    await expect(card).toBeHidden();
    await page.reload();
    await page.waitForTimeout(800);
    await expect(page.getByTestId('tour')).toHaveCount(0);
  });

  test('walks every step, highlights real elements and can be replayed from Settings', async ({
    page,
  }) => {
    await page.goto('/');
    const card = page.getByTestId('tour').getByRole('dialog');
    await expect(card).toBeVisible();
    for (let step = 1; step <= 7; step += 1) {
      await expect(card.getByText(`${step} of 7`)).toBeVisible();
      const box = await card.boundingBox();
      const viewport = page.viewportSize()!;
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
      await card.getByRole('button', { name: step === 7 ? 'Done' : 'Next' }).click();
    }
    await expect(page.getByTestId('tour')).toHaveCount(0);

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Replay: Welcome' }).click();
    await expect(page.getByRole('dialog', { name: 'Welcome to OmniDnD' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tour')).toHaveCount(0);
    await page.getByRole('button', { name: 'Reset tips' }).click();
    await page.goto('/');
    await expect(page.getByRole('dialog', { name: 'Welcome to OmniDnD' })).toBeVisible();
  });

  test('Find opens Settings → Tutorial', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Skip tutorial' }).click();
    await page.getByRole('button', { name: 'Find' }).click();
    await page.getByRole('combobox').fill('tour');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByRole('heading', { name: 'Tutorial' })).toBeVisible();
  });
});

test.describe('character tour', () => {
  test.use({ showTutorial: true });

  test('starts on the first character visit and highlights the workspace', async ({ page }) => {
    // The Welcome chapter is already finished on this device.
    await page.addInitScript(() => {
      if (!localStorage.getItem('omnidnd.tutorial'))
        localStorage.setItem(
          'omnidnd.tutorial',
          JSON.stringify({ done: ['welcome'], tipsOn: true }),
        );
    });
    await page.goto('/characters/the-fool');
    await expect(page.getByRole('dialog', { name: 'Your numbers' })).toBeVisible();
    const card = page.getByTestId('tour').getByRole('dialog');
    await expect(card.getByText('1 of 5')).toBeVisible();
    for (let step = 1; step <= 5; step += 1) {
      await expect(card.getByText(`${step} of 5`)).toBeVisible();
      const box = await card.boundingBox();
      const viewport = page.viewportSize()!;
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      await card.getByRole('button', { name: step === 5 ? 'Done' : 'Next' }).click();
    }
    await expect(page.getByTestId('tour')).toHaveCount(0);
    await page.reload();
    await page.waitForTimeout(800);
    await expect(page.getByTestId('tour')).toHaveCount(0);
  });
});
