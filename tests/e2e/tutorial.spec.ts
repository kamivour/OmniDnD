import { expect, importPartyFool, test } from './fixtures';
import { CHAPTERS } from '../../src/ui/tutorial/steps';

test.describe('first visit', () => {
  test.use({ showTutorial: true });

  test('shows Welcome once; Skip on the first card never shows it again', async ({ page }) => {
    await page.goto('/');
    const card = page.getByRole('dialog', { name: 'Welcome to OmniDnD' });
    await expect(card).toBeVisible();
    await expect(card.getByText('1 of 8')).toBeVisible();
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
    for (let step = 1; step <= 8; step += 1) {
      await expect(card.getByText(`${step} of 8`)).toBeVisible();
      const box = await card.boundingBox();
      const viewport = page.viewportSize()!;
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
      await card.getByRole('button', { name: step === 8 ? 'Done' : 'Next' }).click();
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

test.describe('screen tips', () => {
  test.use({ showTutorial: true });
  const seed =
    (tipsOn: boolean) =>
    async ({ page }: { page: import('@playwright/test').Page }) => {
      await page.addInitScript((on) => {
        if (!localStorage.getItem('omnidnd.tutorial'))
          localStorage.setItem(
            'omnidnd.tutorial',
            JSON.stringify({ done: ['welcome', 'character'], tipsOn: on }),
          );
      }, tipsOn);
    };

  for (const [route, title] of [
    ['combat', 'Start combat'],
    ['spells', 'Slots'],
    ['inventory', 'Your gear'],
  ] as const) {
    test(`${route} tip shows once and Skip is remembered`, async ({ page }) => {
      await seed(true)({ page });
      await page.goto(`/characters/the-fool/${route}`);
      const card = page.getByRole('dialog', { name: title });
      await expect(card).toBeVisible();
      await card.getByRole('button', { name: 'Skip tutorial' }).click();
      await page.reload();
      await page.waitForTimeout(800);
      await expect(page.getByTestId('tour')).toHaveCount(0);
    });
  }

  test('no tips when the switch is off', async ({ page }) => {
    await seed(false)({ page });
    await page.goto('/characters/the-fool/combat');
    await page.waitForTimeout(800);
    await expect(page.getByTestId('tour')).toHaveCount(0);
  });
});

test.describe('targets', () => {
  // These appear only when there is something to show (account-card: sync builds, signed out); the card centers without them.
  const OPTIONAL = new Set(['todo', 'combat-economy', 'account-card']);
  const ROUTES: Record<string, string> = {
    welcome: '/',
    character: '/characters/the-fool',
    combat: '/characters/the-fool/combat',
    spells: '/characters/the-fool/spells',
    inventory: '/characters/the-fool/inventory',
    party: '/campaigns/table-one/party',
    'party-dm': '/campaigns/table-one/party',
  };
  const ROLES: Record<string, 'dm' | 'player'> = { party: 'player', 'party-dm': 'dm' };

  for (const chapter of CHAPTERS) {
    test(`${chapter.id}: every highlighted element exists`, async ({ page }) => {
      const route = ROUTES[chapter.id] ?? '/';
      const role = ROLES[chapter.id];
      if (role) await importPartyFool(page, role);
      for (const step of chapter.steps) {
        if (!step.target || OPTIONAL.has(step.target)) continue;
        const where = step.target === 'sheet-edit' ? '/characters/the-fool/sheet' : route;
        await page.goto(where);
        await expect
          .poll(
            () =>
              page.evaluate(
                (id) =>
                  [...document.querySelectorAll(`[data-tour="${id}"]`)].some(
                    (node) => node.getClientRects().length > 0,
                  ),
                step.target,
              ),
            { message: `${chapter.id}/${step.id} → ${step.target}` },
          )
          .toBe(true);
      }
    });
  }
});
