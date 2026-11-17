import { expect, test } from './fixtures';
import { importReview, reviewFile, reviewState, saved } from './review-fixtures';

test('changing a saved skill protects dependent expertise and succeeds after repicking it', async ({
  page,
}) => {
  const file = reviewFile('proficiency-review');
  file.build.proficiencies.skills = [];
  file.build.proficiencies.expertise = [];
  file.build.featureIds = ['feature.feat.skill-expert'];
  file.build.proficiencyPicks = {
    'feature.skill-versatility': { skills: ['athletics', 'animal-handling'] },
    'feature.feat.skill-expert': { expertise: ['athletics'] },
  };
  await importReview(page, file, 'todo');
  const before = await reviewState(page, file.build.id);
  const savedChoices = page.getByRole('region', { name: 'Saved choices' });
  const row = (name: string) => savedChoices.getByRole('listitem').filter({ hasText: name });
  const versatility = row('Skill Versatility');
  await versatility.getByRole('button', { name: 'Change', exact: true }).click();
  await versatility.getByRole('checkbox', { name: 'Athletics', exact: true }).uncheck();
  await versatility.getByRole('checkbox', { name: 'Arcana', exact: true }).check();
  await versatility.getByRole('button', { name: 'Save choice', exact: true }).click();
  await expect(
    page.getByText(
      'Expertise in athletics needs this proficiency. Change that expertise pick first.',
      { exact: true },
    ),
  ).toBeVisible();
  expect(await reviewState(page, file.build.id)).toEqual(before);
  await versatility.getByRole('button', { name: 'Close', exact: true }).click();
  const expertise = row('Skill Expert');
  await expertise.getByRole('button', { name: 'Change', exact: true }).click();
  await expertise.getByRole('checkbox', { name: 'Athletics', exact: true }).uncheck();
  await expertise.getByRole('checkbox', { name: 'Animal Handling', exact: true }).check();
  await expertise.getByRole('button', { name: 'Save choice', exact: true }).click();
  await saved(page);
  await versatility.getByRole('button', { name: 'Change', exact: true }).click();
  await versatility.getByRole('checkbox', { name: 'Athletics', exact: true }).uncheck();
  await versatility.getByRole('checkbox', { name: 'Arcana', exact: true }).check();
  await versatility.getByRole('button', { name: 'Save choice', exact: true }).click();
  await saved(page);
  await page.reload();
  expect((await reviewState(page, file.build.id)).build.proficiencyPicks).toMatchObject({
    'feature.skill-versatility': { skills: ['animal-handling', 'arcana'] },
    'feature.feat.skill-expert': { expertise: ['animal-handling'] },
  });
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
    await saved(page);
  }
  expect(await reviewState(page, file.build.id)).toEqual(before);
});
