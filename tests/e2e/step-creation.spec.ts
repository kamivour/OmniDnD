import { expect, test } from './fixtures';

test('step by step builds a level 1 Fighter and keeps entries when switching mode', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('article', { name: 'Campaign #273', exact: true })
    .getByRole('link', { name: 'New character', exact: true })
    .click();
  await page.getByRole('button', { name: 'Step by step', exact: true }).click();

  // Each step checks its own choices.
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Enter a name.');
  await page.getByLabel('Name', { exact: true }).fill('Step Hero');
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(page.getByLabel('Race', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0);
  await page.getByLabel('Race', { exact: true }).selectOption('race.human');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Class', { exact: true }).selectOption('class.fighter');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Background', { exact: true }).selectOption('background.acolyte');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Enter a base score');

  // Switching to One page keeps what was typed.
  await page.getByRole('button', { name: 'One page', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Step Hero');
  await page.getByRole('button', { name: 'Step by step', exact: true }).click();

  for (const [ability, score] of Object.entries({
    STR: 15,
    DEX: 13,
    CON: 14,
    INT: 8,
    WIS: 12,
    CHA: 10,
  })) {
    await page.getByLabel(`${ability} base`, { exact: true }).fill(String(score));
  }
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(page.getByText('Step Hero: Human Fighter, level 1')).toBeVisible();
  await expect(page.getByText('Max HP', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/[^/]+$/);
});

test('choice cards show strengths and weaknesses, and can be switched off', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('article', { name: 'Campaign #273', exact: true })
    .getByRole('link', { name: 'New character', exact: true })
    .click();
  await page.getByLabel('Class', { exact: true }).selectOption('class.fighter');
  const card = page.getByRole('article', { name: 'Fighter guide' });
  await expect(card.getByRole('region', { name: 'Strengths' })).toBeVisible();
  await expect(card.getByRole('region', { name: 'Weaknesses' })).toBeVisible();

  // Pick another class from the comparison list.
  await page.getByText('Compare classes').click();
  await page.getByRole('button', { name: /^Wizard/ }).click();
  await expect(page.getByLabel('Class', { exact: true })).toHaveValue('class.wizard');
  await expect(page.getByRole('article', { name: 'Wizard guide' })).toBeVisible();

  // The Settings switch hides the cards.
  await page.goto('/settings');
  await page.getByLabel('Show beginner hints').uncheck();
  await page.goBack();
  await expect(page.getByRole('article', { name: /guide$/ })).toHaveCount(0);
});

test('guided build tags recommended skills and spells with a reason', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('article', { name: 'Campaign #273', exact: true })
    .getByRole('link', { name: 'New character', exact: true })
    .click();
  await page.getByLabel('Name', { exact: true }).fill('Tagged');
  await page.getByLabel('Race', { exact: true }).selectOption('race.half-elf');
  await page.getByLabel('Class', { exact: true }).selectOption('class.bard');
  await page.getByLabel('Background', { exact: true }).selectOption('background.charlatan');
  for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
    await page.getByLabel(`${ability} base`, { exact: true }).fill('12');
  }
  await page.getByLabel(/^Guided build/).check();
  await expect(page.getByText(/Recommended:/).first()).toBeVisible();
  // The tag describes the box without changing its name.
  await expect(page.getByRole('checkbox', { name: 'Persuasion', exact: true })).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: 'Persuasion', exact: true }),
  ).toHaveAccessibleDescription(/Recommended/);
});

test('a level 4 Fighter picks a subclass and an ability increase during creation', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('article', { name: 'Campaign #273', exact: true })
    .getByRole('link', { name: 'New character', exact: true })
    .click();
  await page.getByRole('button', { name: 'Step by step', exact: true }).click();
  const next = page.getByRole('button', { name: 'Next', exact: true });
  await page.getByLabel('Name', { exact: true }).fill('Leveled Hero');
  await next.click();
  await page.getByLabel('Race', { exact: true }).selectOption('race.human');
  await next.click();
  await page.getByLabel('Class', { exact: true }).selectOption('class.fighter');
  await next.click();
  await page.getByLabel('Background', { exact: true }).selectOption('background.acolyte');
  await next.click();
  await page.getByLabel('Level', { exact: true }).fill('4');
  await next.click();
  for (const [ability, score] of Object.entries({
    STR: 15,
    DEX: 13,
    CON: 14,
    INT: 8,
    WIS: 12,
    CHA: 10,
  })) {
    await page.getByLabel(`${ability} base`, { exact: true }).fill(String(score));
  }
  await next.click();
  for (const at of [2, 3, 4]) {
    await page.getByLabel(`Level ${at} roll (d10)`).fill('6');
  }
  await next.click();

  // Level choices: subclass at 3, ability increase at 4.
  await expect(page.getByRole('group', { name: 'Level 3' })).toBeVisible();
  await page.getByLabel('Subclass', { exact: true }).selectOption('subclass.fighter.champion');
  await expect(page.getByRole('article', { name: 'Champion guide' })).toBeVisible();
  await page.getByRole('radio', { name: 'Raise ability scores' }).check();
  await next.click();

  await expect(page.getByText('Leveled Hero: Human Fighter, level 4')).toBeVisible();
  await expect(page.getByText('18 (+4)')).toBeVisible();
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/[^/]+$/);
});
