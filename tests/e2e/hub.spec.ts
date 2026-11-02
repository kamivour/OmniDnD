import { expect, test } from './fixtures';

test('landing lists campaigns and opens a character', async ({ page }) => {
  await page.goto('/');
  const campaign = page.getByRole('article', { name: 'Campaign #273' });
  await expect(campaign).toContainText('Milestone · HP rolled · Abilities rolled');
  await expect(campaign.getByRole('link', { name: 'New character' })).toBeVisible();
  await campaign.getByRole('link', { name: /The Fool/ }).click();
  await expect(page).toHaveURL(/\/characters\/the-fool$/);
  await expect(page.getByRole('heading', { name: 'Spell slots' })).toBeVisible();
});

test('the character frame links back to all campaigns', async ({ page, isMobile }) => {
  await page.goto('/characters/the-fool');
  if (isMobile) {
    // Mobile: the link lives in the More sheet.
    await page.getByRole('button', { name: 'More' }).click();
  }
  await page.getByRole('link', { name: 'All campaigns' }).filter({ visible: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Campaigns' })).toBeVisible();
});

test('campaign settings show the saved methods', async ({ page }) => {
  await page.goto('/campaigns/273/settings');
  await expect(page.getByLabel('Name')).toHaveValue('Campaign #273');
  await expect(page.getByRole('radio', { name: /^Milestone/ })).toBeChecked();
  await expect(
    page.getByRole('radio', { name: /^Rolled.*table and type the result/ }),
  ).toBeChecked();
});

test('new campaign starts from XP, average HP, standard array', async ({ page }) => {
  await page.goto('/campaigns/new');
  await expect(page.getByRole('radio', { name: /^XP/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /^Average/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /^Standard array/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /^Allow negative/ })).toBeChecked();
});

test('new character computes max HP from typed rolls', async ({ page }) => {
  await page.goto('/campaigns/273/characters/new');
  const total = page.getByRole('row', { name: /Max HP/ });

  await page.getByLabel('Level', { exact: true }).fill('3');
  await expect(total).toContainText('Hit Dice 3d8');
  await page.getByLabel('Level 2 roll (d8)').fill('4');
  await page.getByLabel('Level 3 roll (d8)').fill('4');
  await expect(total).toContainText('—');

  await page.getByLabel('CON base').fill('12');
  await expect(total).toContainText('19');
});

test('a low roll with negative CON lowers max HP (campaign allows negative)', async ({ page }) => {
  await page.goto('/campaigns/273/characters/new');
  await page.getByLabel('Level', { exact: true }).fill('2');
  await page.getByLabel('Level 2 roll (d8)').fill('1');
  await page.getByLabel('CON base').fill('6');

  const level2 = page
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: '2', exact: true }) });
  await expect(level2.getByRole('cell').last()).toHaveText('-1');
  // Level 1: 8 − 2 = 6. Level 2: 1 − 2 = −1.
  await expect(page.getByRole('row', { name: /Max HP/ }).getByRole('cell')).toHaveText('5');
});
