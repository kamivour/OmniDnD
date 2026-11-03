import { expect, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/characters/the-fool');
});

test('resources are grouped: spell slots, features, Hit Dice', async ({ page }) => {
  for (const name of ['Spell slots', 'Features & traits', 'Hit Dice']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  const main = page.getByRole('main');
  await expect(main.getByRole('img', { name: 'Level 1 spell slots: 0 of 4 left' })).toBeVisible();
  await expect(main.getByRole('img', { name: 'Bardic Inspiration: 3 of 5 left' })).toBeVisible();
  await expect(main.getByRole('img', { name: 'd8 Hit Dice: 3 of 3 left' })).toBeVisible();
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

  await expect(use).toBeDisabled();
  await restore.click();
  await expect(pips).toHaveAccessibleName('Level 1 spell slots: 1 of 4 left');
  await expect(use).toBeEnabled();
  await use.click();
  await expect(pips).toHaveAccessibleName('Level 1 spell slots: 0 of 4 left');
});

test('concentration is separate from effects on you', async ({ page }) => {
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Concentration' })).toBeVisible();
  await expect(main.getByRole('region', { name: 'Concentration', exact: true })).toContainText(
    'None',
  );
  await expect(main.getByRole('heading', { name: 'Effects on you' })).toBeVisible();
  await expect(main.getByRole('region', { name: 'Effects on you', exact: true })).toContainText(
    'None',
  );
});

test('shows computed abilities and passives from the saved character', async ({ page }) => {
  const abilities = page.getByRole('region', { name: 'Abilities', exact: true });
  await expect(abilities.getByText('CHA', { exact: true })).toBeVisible();
  await expect(abilities.getByText('+5', { exact: true })).toBeVisible();
  await expect(abilities).toContainText(/Passive\s+Perception/);
});

test('quick access starts from the saved favorites', async ({ page }) => {
  const quick = page.getByRole('region', { name: 'Quick access', exact: true });
  for (const name of ['Vicious Mockery', 'Healing Word', 'Cutting Words', 'Rapier']) {
    await expect(quick.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await expect(
    quick.getByRole('button', { name: 'Manage quick access', exact: true }),
  ).toBeVisible();
});

test.describe('mobile', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile only');

  test('tapping a resource label opens its description', async ({ page }) => {
    await page.getByRole('button', { name: 'Level 1', exact: true }).tap();
    const sheet = page.getByRole('dialog', { name: 'Level 1 spell slots' });
    await expect(sheet).toContainText('Spell slots return after a long rest.');
    await expect(sheet).toContainText('0 of 4 left');
  });
});

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('hovering a resource label shows its description', async ({ page }) => {
    await page.getByRole('button', { name: 'd8 Hit Dice', exact: true }).hover();
    await expect(page.getByRole('tooltip')).toContainText('short rest');
  });
});
