import { expect, test } from './fixtures';

test('guided build picks class skills, kit and spells, then opens the saved sheet', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('article', { name: 'Campaign #273', exact: true })
    .getByRole('link', { name: 'New character', exact: true })
    .click();
  await page.getByLabel('Name', { exact: true }).fill('Guided Verse');
  await page.getByLabel('Race', { exact: true }).selectOption('race.half-elf');
  await page.getByLabel('Class', { exact: true }).selectOption('class.bard');
  await page.getByLabel('Background', { exact: true }).selectOption('background.charlatan');
  for (const [ability, score] of Object.entries({
    STR: 11,
    DEX: 14,
    CON: 12,
    INT: 12,
    WIS: 12,
    CHA: 18,
  })) {
    await page.getByLabel(`${ability} base`, { exact: true }).fill(String(score));
  }
  await page.getByLabel('DEX racial bonus', { exact: true }).check();
  await page.getByLabel('CON racial bonus', { exact: true }).check();

  await page.getByLabel(/^Guided build/).check();
  await expect(page.getByText('Class skills: choose 3')).toBeVisible();
  await expect(page.getByText('Spells appear once')).toHaveCount(0);

  // Missing choices are reported, not guessed.
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Choose 3 different class skills');

  for (const skill of ['Athletics', 'Insight', 'Persuasion']) {
    await page.getByRole('checkbox', { name: skill, exact: true }).check();
  }
  for (const instrument of ['Flute', 'Lyre', 'Drum']) {
    await page.getByRole('checkbox', { name: instrument, exact: true }).check();
  }
  await page.getByLabel('Weapon', { exact: true }).selectOption({ label: 'Rapier' });
  for (const spell of ['Vicious Mockery', 'Minor Illusion']) {
    await page.getByRole('checkbox', { name: spell }).check();
  }
  for (const spell of ['Healing Word', 'Charm Person', 'Dissonant Whispers', 'Thunderwave']) {
    await page.getByRole('checkbox', { name: new RegExp(`^${spell}`) }).check();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/[^/]+$/);
  await expect(page.getByText('Guided Verse').first()).toBeVisible();
});
