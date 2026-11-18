import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import { ExportFileSchema } from '../../src/engine/schema';
import { expect, test } from './fixtures';

test('a multiclass character settles the remaining ASI after a feat, reloads and undoes', async ({
  page,
}) => {
  const file = ExportFileSchema.parse(seed);
  file.build.id = 'asi-review';
  file.build.name = 'ASI review';
  file.live.characterId = file.build.id;
  file.events = [];
  file.build.classes = [
    { classId: 'class.fighter', level: 4, subclassId: 'subclass.fighter.champion' },
    { classId: 'class.wizard', level: 4, subclassId: 'subclass.wizard.evocation' },
  ];
  file.build.hpEntries = file.build.classes.flatMap(({ classId }, index) =>
    Array.from({ length: 4 }, (_, at) => ({
      level: index * 4 + at + 1,
      classId,
      value: index === 0 && at === 0 ? 10 : 6,
      method: index === 0 && at === 0 ? ('max' as const) : ('average' as const),
    })),
  );
  file.build.spells = [];
  file.build.featureIds = ['feature.feat.alert'];
  file.build.abilityScores.bonuses = [];
  await page.goto('/settings');
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: 'asi-review.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(ExportFileSchema.parse(file))),
  });
  await page
    .getByRole('dialog', { name: 'Import character', exact: true })
    .getByRole('button', { name: 'Add character', exact: true })
    .click();
  await page.goto('/characters/asi-review/todo');
  const row = () =>
    page.getByRole('listitem').filter({ hasText: /^Ability score improvement or feat/ });
  await row().getByRole('button', { name: 'Choose', exact: true }).click();
  await row().getByRole('radio', { name: 'Raise ability scores', exact: true }).check();
  await row().getByLabel('Ability', { exact: true }).selectOption('INT');
  await row().getByRole('button', { name: 'Save choice', exact: true }).click();
  await expect(row()).toHaveCount(0);
  await expect(page.locator('[aria-label="Save status"]')).toContainText('Saved on this device');
  await page.reload();
  await expect(row()).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await expect(row()).toHaveCount(1);
  await expect(page.locator('[aria-label="Save status"]')).toContainText('Saved on this device');
});
