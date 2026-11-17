import { expect, test } from './fixtures';
import { importReview, reviewFile, reviewState, saved } from './review-fixtures';

test('Steady Aim keeps speed at zero through Dash, reload and Undo until turn end', async ({
  page,
}) => {
  const file = reviewFile('steady-review');
  file.campaign.optionalRules.optionalClassFeatures = true;
  file.campaign.sources = ['PHB', 'TCE'];
  file.build.classes = [{ classId: 'class.rogue', level: 3 }];
  file.build.hpEntries = file.build.hpEntries.map((x) => ({ ...x, classId: 'class.rogue' }));
  file.build.spells = [];
  file.build.featureIds = [];
  file.live.combat = {
    round: 1,
    turnActive: true,
    economy: {
      actionUsed: false,
      bonusUsed: false,
      reactionUsed: false,
      objectInteractionUsed: false,
      movementUsed: 0,
      bonusActionSpellCast: false,
      otherSpellCast: false,
    },
  };
  await importReview(page, file, 'features');
  await page.getByRole('button', { name: 'Use Steady Aim', exact: true }).click();
  await saved(page);
  await page.goto('/characters/steady-review/combat');
  const economy = page.getByRole('region', { name: 'Turn economy', exact: true });
  await expect(economy).toContainText('0 / 0 ft left');
  await page.getByRole('main').getByRole('button', { name: 'Dash', exact: true }).click();
  await page.getByRole('button', { name: 'Take Dash', exact: true }).click();
  await saved(page);
  await page.reload();
  await expect(economy).toContainText('0 / 0 ft left');
  expect((await reviewState(page, file.build.id)).live.combat?.economy).toMatchObject({
    dashCount: 1,
    speedZero: true,
    movementUsed: 0,
  });
  await page.getByRole('button', { name: 'End Turn', exact: true }).click();
  await saved(page);
  await expect(economy).toContainText('30 / 30 ft left');
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await expect(economy).toContainText('0 / 0 ft left');
  await saved(page);
});
