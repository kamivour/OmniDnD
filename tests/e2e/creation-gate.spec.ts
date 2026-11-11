import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function openNewCharacter(page: Page) {
  await page.goto('/');
  await page
    .getByRole('article', { name: 'Campaign #273', exact: true })
    .getByRole('link', { name: 'New character', exact: true })
    .click();
}

const scores = { STR: 8, DEX: 14, CON: 13, INT: 15, WIS: 12, CHA: 10 };

test('a half-built character survives a reload', async ({ page }) => {
  await openNewCharacter(page);
  await page.getByLabel('Name', { exact: true }).fill('Reload Hero');
  await page.getByLabel('Race', { exact: true }).selectOption('race.human');
  await page.getByLabel('Class', { exact: true }).selectOption('class.wizard');
  await page.getByLabel('Level', { exact: true }).fill('3');
  await page.reload();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Reload Hero');
  await expect(page.getByLabel('Race', { exact: true })).toHaveValue('race.human');
  await expect(page.getByLabel('Class', { exact: true })).toHaveValue('class.wizard');
  await expect(page.getByLabel('Level', { exact: true })).toHaveValue('3');
  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Start over', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('');
});

test('a beginner builds a level 5 Wizard step by step', async ({ page }) => {
  await openNewCharacter(page);
  await page.getByRole('button', { name: 'Step by step', exact: true }).click();
  const next = page.getByRole('button', { name: 'Next', exact: true });
  await page.getByLabel('Name', { exact: true }).fill('Beginner Wizard');
  await next.click();
  await page.getByLabel('Race', { exact: true }).selectOption('race.human');
  await next.click();
  await page.getByLabel('Class', { exact: true }).selectOption('class.wizard');
  await expect(page.getByRole('article', { name: 'Wizard guide' })).toBeVisible();
  await next.click();
  await page.getByLabel('Background', { exact: true }).selectOption('background.acolyte');
  await next.click();
  await page.getByLabel('Level', { exact: true }).fill('5');
  await next.click();
  for (const [ability, score] of Object.entries(scores)) {
    await page.getByLabel(`${ability} base`, { exact: true }).fill(String(score));
  }
  await next.click();
  for (const at of [2, 3, 4, 5]) {
    await page.getByLabel(`Level ${at} roll (d6)`).fill('4');
  }
  await next.click();
  // Level 4 ability increase is the only forced pick; subclass comes at level 2.
  await page.locator('input[type="radio"][value="subclass.wizard.evocation"]').check();
  await page.getByRole('radio', { name: 'Raise ability scores' }).check();
  await next.click();
  await expect(page.getByText('Beginner Wizard: Human Wizard, level 5')).toBeVisible();
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/(?!new$)[^/]+$/);
});

test('an expert builds a Fighter on one page with hints off', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel('Show beginner hints').uncheck();
  await openNewCharacter(page);
  await page.getByLabel('Name', { exact: true }).fill('Expert Fighter');
  await page.getByLabel('Race', { exact: true }).selectOption('race.human');
  await page.getByLabel('Class', { exact: true }).selectOption('class.fighter');
  await page.getByLabel('Background', { exact: true }).selectOption('background.acolyte');
  await expect(page.getByRole('article', { name: /guide$/ })).toHaveCount(0);
  for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
    await page.getByLabel(`${ability} base`, { exact: true }).fill('13');
  }
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/(?!new$)[^/]+$/);
});

test('a beginner Fighter at level 1 starts from suggested scores', async ({ page }) => {
  // Suggestions need a standard-array campaign; the seeded one rolls scores.
  await page.goto('/campaigns/new');
  await page.getByLabel('Name', { exact: true }).fill('Array Table');
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page
    .getByRole('article', { name: 'Array Table', exact: true })
    .getByRole('link', { name: 'New character', exact: true })
    .click();
  await page.getByLabel('Name', { exact: true }).fill('Suggested Fighter');
  await page.getByLabel('Race', { exact: true }).selectOption('race.human');
  await page.getByLabel('Class', { exact: true }).selectOption('class.fighter');
  await page.getByLabel('Background', { exact: true }).selectOption('background.acolyte');
  await page.getByRole('button', { name: 'Suggested scores', exact: true }).click();
  await expect(page.getByLabel('STR base', { exact: true })).toHaveValue('15');
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/(?!new$)[^/]+$/);
});

for (const hero of [
  {
    classId: 'class.wizard',
    name: 'Wizard',
    die: 'd6',
    level: 3,
    subclass: 'subclass.wizard.evocation',
  },
  {
    classId: 'class.cleric',
    name: 'Cleric',
    die: 'd8',
    level: 2,
    subclass: 'subclass.cleric.life',
  },
]) {
  test(`a ${hero.name} built with the subclass skipped clears it from To do`, async ({ page }) => {
    await openNewCharacter(page);
    await page.getByLabel('Name', { exact: true }).fill(`Later ${hero.name}`);
    await page.getByLabel('Race', { exact: true }).selectOption('race.human');
    await page.getByLabel('Class', { exact: true }).selectOption(hero.classId);
    await page.getByLabel('Background', { exact: true }).selectOption('background.acolyte');
    await page.getByLabel('Level', { exact: true }).fill(String(hero.level));
    for (const [ability, score] of Object.entries(scores)) {
      await page.getByLabel(`${ability} base`, { exact: true }).fill(String(score));
    }
    for (let at = 2; at <= hero.level; at += 1) {
      await page.getByLabel(`Level ${at} roll (${hero.die})`).fill('4');
    }
    await page.getByRole('button', { name: 'Create character', exact: true }).click();
    await expect(page).toHaveURL(/\/characters\/(?!new$)[^/]+$/);
    await page.goto(page.url() + '/todo');
    const label = `Choose a ${hero.name} subclass`;
    const item = page.getByRole('listitem').filter({ hasText: label });
    await item.getByRole('button', { name: 'Choose', exact: true }).click();
    await item.locator(`input[type="radio"][value="${hero.subclass}"]`).check();
    await item.getByRole('button', { name: 'Save choice' }).click();
    await expect(page.getByText(label)).toHaveCount(0);
  });
}
