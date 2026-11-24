import { expect, test } from './fixtures';
import { importReview, reviewFile, reviewState } from './review-fixtures';

test('Verify character reports excess proficiencies without editing the saved character', async ({
  page,
}) => {
  const file = reviewFile('verify-character');
  for (const picks of Object.values(file.build.proficiencyPicks ?? {})) {
    file.build.proficiencies.skills.push(...(picks.skills ?? []));
    file.build.proficiencies.languages.push(...(picks.languages ?? []));
  }
  file.build.proficiencyPicks = {
    'feature.extra-language': { languages: ['Dwarvish'] },
    'feature.skill-versatility': { skills: ['athletics', 'history'] },
    'feature.bard.bonus-proficiencies': { skills: ['animal-handling', 'arcana', 'survival'] },
  };
  file.build.spells[0]!.known.push('spell.fireball');
  await importReview(page, file, 'sheet');
  const before = await reviewState(page, file.build.id);
  const verify = page.getByRole('button', { name: 'Verify character', exact: true });
  await verify.click();
  const dialog = page.getByRole('dialog', { name: 'Verify character' });
  await expect(
    dialog.getByText('15 skill proficiencies recorded · up to 10 from the build'),
  ).toBeVisible();
  await expect(dialog.getByText('4 languages recorded · up to 3 from the build')).toBeVisible();
  const spells = dialog.getByRole('region', { name: 'Spells' });
  await expect(spells.getByText("Fireball exceeds Bard's level 2 spell limit.")).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('verify-character.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(verify).toBeFocused();
  await verify.click();
  await spells.getByRole('link', { name: 'Open Spells' }).first().click();
  await expect(page).toHaveURL(/\/spells$/);
  await expect(dialog).toHaveCount(0);
  expect(await reviewState(page, file.build.id)).toEqual(before);
});

test('Find reaches verification from another owned screen', async ({ page }) => {
  await page.goto('/characters/the-fool/spells');
  await page.getByRole('button', { name: 'Find', exact: true }).first().click();
  await page.getByRole('combobox', { name: 'Find', exact: true }).fill('verify character');
  await page.getByRole('option', { name: /^Verify character/ }).click();
  await expect(page).toHaveURL(/\/sheet$/);
  await page.getByRole('button', { name: 'Verify character', exact: true }).click();
  await expect(page.getByText('No discrepancies found in the checks below.')).toBeVisible();
});
