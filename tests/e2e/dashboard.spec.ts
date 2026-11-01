import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/characters/the-fool');
});

test('resources are grouped: spell slots, features, Hit Dice', async ({ page }) => {
  for (const name of ['Spell slots', 'Features & traits', 'Hit Dice (d8)']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  const main = page.getByRole('main');
  await expect(main.getByRole('img', { name: 'Level 1 spell slots: 3 of 4 left' })).toBeVisible();
  await expect(main.getByRole('img', { name: 'Bardic Inspiration: 4 of 5 left' })).toBeVisible();
  await expect(main.getByRole('img', { name: 'Hit Dice: 3 of 3 left' })).toBeVisible();
});

test('pips sit between the − and + buttons', async ({ page }) => {
  const main = page.getByRole('main');
  const use = main.getByRole('button', { name: 'Use one: Level 1 spell slots' });
  const pips = main.getByRole('img', { name: /^Level 1 spell slots/ });
  const restore = main.getByRole('button', { name: 'Restore one: Level 1 spell slots' });
  const [u, p, r] = await Promise.all([
    use.boundingBox(),
    pips.boundingBox(),
    restore.boundingBox(),
  ]);
  if (!u || !p || !r) throw new Error('stepper not rendered');
  expect(u.x + u.width).toBeLessThanOrEqual(p.x);
  expect(p.x + p.width).toBeLessThanOrEqual(r.x);

  await use.click();
  await expect(page.getByRole('status')).toContainText('Use one: Level 1 spell slots');
});

test('concentration is separate from effects on you', async ({ page }) => {
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Concentration' })).toBeVisible();
  await expect(main.getByText('Targets that failed the save are outlined.')).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Effects on you' })).toBeVisible();
});

test('shows abilities and passives from the fixture', async ({ page }) => {
  await expect(page.getByText('CHA', { exact: true })).toBeVisible();
  await expect(page.getByText('+5', { exact: true })).toBeVisible();
  await expect(page.getByText(/Passive\s+Perception/)).toBeVisible();
});

test('quick access lists the four pinned shortcuts', async ({ page }) => {
  for (const name of ['V. Mockery', 'Healing Word', 'Cutting Words', 'Rapier']) {
    await expect(page.getByRole('button', { name })).toBeVisible();
  }
});

test.describe('mobile', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile only');

  test('tapping a resource label opens its description', async ({ page }) => {
    await page.getByRole('button', { name: 'Level 1', exact: true }).tap();
    const sheet = page.getByRole('dialog', { name: 'Level 1 spell slots' });
    await expect(sheet).toContainText('Your level 1 spell slots');
    await expect(sheet).toContainText('3 of 4 left');
  });
});

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('hovering a resource label shows its description', async ({ page }) => {
    await page.getByRole('button', { name: 'Hit Dice', exact: true }).hover();
    await expect(page.getByRole('tooltip')).toContainText('short rest');
  });
});
