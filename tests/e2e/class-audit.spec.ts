import { expect, test } from './fixtures';
import { importReview, reviewFile, reviewState, saved } from './review-fixtures';

test('Rune Knight learns two eligible runes from To do', async ({ page }) => {
  const classId = 'class.fighter';
  const file = reviewFile('audit-rune-knight');
  file.campaign.sources = ['PHB', 'TCE'];
  file.build.classes = [{ classId, level: 3, subclassId: 'subclass.fighter.rune-knight' }];
  file.build.hpEntries = [1, 2, 3].map((level) => ({
    level,
    classId,
    method: level === 1 ? 'max' : 'average',
    value: level === 1 ? 10 : 6,
  }));
  file.build.featureIds = [];
  file.build.spells = [];
  await importReview(page, file, 'todo');

  const runes = page.getByRole('main').getByRole('listitem').filter({ hasText: 'Runes: pick 2' });
  await runes.getByRole('button', { name: 'Choose', exact: true }).click();
  await expect(runes.getByRole('checkbox')).toHaveCount(4);
  await runes.getByRole('checkbox', { name: 'Cloud Rune', exact: true }).check();
  await runes.getByRole('checkbox', { name: 'Frost Rune', exact: true }).check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await runes.getByRole('button', { name: 'Save choice', exact: true }).click();
  await saved(page);
  expect((await reviewState(page, file.build.id)).build.featureIds).toEqual(
    expect.arrayContaining([
      'feature.fighter.rune-knight-inscribed-cloud',
      'feature.fighter.rune-knight-inscribed-frost',
    ]),
  );
  await page.reload();
  await saved(page);
  await expect(runes).toHaveCount(0);
});

test('Paladin learns Blessed Warrior cantrips and sees both Glory Channel Divinity options', async ({
  page,
}) => {
  const file = reviewFile('audit-paladin');
  file.campaign.sources = ['PHB', 'TCE'];
  file.campaign.optionalRules = { ...file.campaign.optionalRules, optionalClassFeatures: true };
  file.build.classes = [
    { classId: 'class.paladin', level: 3, subclassId: 'subclass.paladin.glory' },
  ];
  file.build.hpEntries = [1, 2, 3].map((level) => ({
    level,
    classId: 'class.paladin',
    method: level === 1 ? 'max' : 'average',
    value: level === 1 ? 10 : 6,
  }));
  file.build.featureIds = [];
  file.build.proficiencyPicks = {};
  file.build.spells = [];
  const base = '/characters/' + file.build.id;
  await importReview(page, file, 'todo');
  const main = page.getByRole('main');
  const style = main.getByRole('listitem').filter({ hasText: 'Fighting Style: pick 1' });
  await style.getByRole('button', { name: 'Choose', exact: true }).click();
  await style
    .getByRole('checkbox', { name: 'Fighting Style: Blessed Warrior', exact: true })
    .check();
  await style.getByRole('button', { name: 'Save choice', exact: true }).click();
  const cantrips = main.getByRole('listitem').filter({ hasText: 'Blessed Warrior: choose spells' });
  await cantrips.getByRole('button', { name: 'Choose', exact: true }).click();
  await cantrips.getByRole('checkbox', { name: 'Guidance', exact: true }).check();
  await cantrips.getByRole('checkbox', { name: 'Sacred Flame', exact: true }).check();
  await cantrips.getByRole('button', { name: 'Save choice', exact: true }).click();
  await saved(page);
  await page.goto(base + '/spells');
  await expect(main.getByRole('button', { name: /^Sacred Flame\b/ })).toBeVisible();
  await page.reload();
  await expect(main.getByRole('button', { name: /^Guidance\b/ })).toBeVisible();

  await page.goto(base + '/combat');
  await main.getByRole('tab', { name: 'Bonus', exact: true }).click();
  const inspiring = main.getByRole('listitem').filter({ hasText: 'Inspiring Smite' });
  await expect(inspiring).toBeVisible();
  await expect(main.getByText('Channel Divinity: Peerless Athlete', { exact: true })).toBeVisible();
  await inspiring.getByRole('button', { name: /^Use/ }).click();
  await saved(page);
  expect(
    (await reviewState(page, file.build.id)).live.featureUsesSpent[
      'feature.paladin.channel-divinity'
    ],
  ).toBe(1);
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await saved(page);
  expect(
    (await reviewState(page, file.build.id)).live.featureUsesSpent[
      'feature.paladin.channel-divinity'
    ],
  ).toBeUndefined();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
