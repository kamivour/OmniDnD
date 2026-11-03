import { expect, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/characters/the-fool/combat');
});

test('no initiative order; the live header starts outside combat', async ({ page }) => {
  await expect(page.getByText('Turn order')).toHaveCount(0);
  const turn = page.getByRole('status', { name: 'Combat status', exact: true });
  await expect(turn).toContainText('No active combat');
  await expect(page.getByRole('button', { name: 'Start combat', exact: true })).toBeVisible();
});

test('live economy shows a manually spent Action with Bonus and Reaction available', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Start combat', exact: true }).click();
  await page.getByRole('button', { name: 'Start Turn', exact: true }).click();
  await page.getByRole('button', { name: 'Action available', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Action used', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Bonus available', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.getByRole('button', { name: 'React available', exact: true })).toBeVisible();
});

test('tabs switch between action groups', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Rapier' })).toBeVisible();
  await page.getByRole('tab', { name: 'Bonus' }).click();
  await expect(page.getByRole('button', { name: /Healing Word/ })).toBeVisible();
  await page.getByRole('tab', { name: 'React' }).click();
  await expect(page.getByRole('button', { name: /Cutting Words/ })).toBeVisible();
});

test('weapon actions require combat while previews remain available', async ({
  page,
  isMobile,
}) => {
  await expect(page.getByRole('button', { name: 'Attack', exact: true }).first()).toBeDisabled();
  await expect(page.getByRole('main')).toContainText('Start combat');
  await page.getByRole('button', { name: /^Rapier\b/ }).click();
  const preview = isMobile
    ? page.getByRole('dialog', { name: 'Rapier', exact: true })
    : page.getByRole('complementary', { name: 'Pinned detail', exact: true });
  await expect(preview).toContainText('+4 to hit');
});

test.describe('mobile', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile only');

  test('tapping a spell opens a sheet with slot picker and Cast', async ({ page }) => {
    await page.getByRole('tab', { name: 'Bonus' }).click();
    await page.getByRole('button', { name: /Healing Word/ }).tap();
    const sheet = page.getByRole('dialog', { name: 'Healing Word' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^L2/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(sheet.getByRole('button', { name: 'Cast Healing Word (L2)' })).toBeVisible();
  });

  test('HP buttons open the number pad', async ({ page }) => {
    await page.getByRole('button', { name: 'Damage' }).first().tap();
    await expect(page.getByRole('dialog', { name: 'Damage' })).toBeVisible();
  });
});

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('hover previews a spell, click pins it', async ({ page }) => {
    await page.getByRole('tab', { name: 'Spells' }).click();
    const row = page.getByRole('button', { name: /Dissonant Whispers/ });
    await row.hover();
    await expect(page.getByRole('tooltip')).toContainText('3d6 psychic');
    await row.click();
    await expect(page.getByRole('complementary', { name: 'Pinned detail' })).toContainText(
      'Dissonant Whispers',
    );
  });

  test('status column shows concentration, effects on you, and the full log', async ({ page }) => {
    const aside = page.getByRole('complementary', { name: 'Status and log' });
    await expect(aside.getByRole('heading', { name: 'Concentration' })).toBeVisible();
    await expect(aside.getByRole('heading', { name: 'Effects on you' })).toBeVisible();
    await expect(aside.getByText('Took 4 damage (HP 19 → 15)')).toBeVisible();
  });
});
