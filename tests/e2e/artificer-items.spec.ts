import { expect, test } from './fixtures';
import { importReview, reviewFile, reviewState, saved } from './review-fixtures';

test('Artificer stores and uses a spell, then casts through an Arcane Firearm', async ({
  page,
}) => {
  const file = reviewFile('artificer-item-choices');
  const classId = 'class.artificer';
  file.campaign.sources = ['PHB', 'TCE'];
  file.build.classes = [{ classId, level: 11, subclassId: 'subclass.artificer.artillerist' }];
  file.build.hpEntries = Array.from({ length: 11 }, (_, index) => ({
    level: index + 1,
    classId,
    method: index === 0 ? 'max' : 'average',
    value: index === 0 ? 8 : 5,
  }));
  file.build.abilityScores.base.INT = 16;
  file.build.abilityScores.bonuses = [];
  file.build.spells = [];
  file.build.items = [
    { itemId: 'item.dagger', instanceId: 'dagger' },
    { itemId: 'item.wand', instanceId: 'wand' },
  ];
  file.live.items = {
    dagger: { qty: 1, equipped: true, attuned: false },
    wand: { qty: 1, equipped: false, attuned: false },
  };
  file.live.slotsUsed = file.live.slotsUsed.map(() => 0);
  file.live.lastLongRestEnd = file.live.clock.seconds;
  await importReview(page, file, 'features');
  const region = page.getByRole('region', { name: 'Spell-Storing Item', exact: true });
  await region.getByLabel('Item to store the spell in').selectOption('dagger');
  await region.getByLabel('Spell to store').selectOption('spell.web');
  await region.getByRole('button', { name: 'Store spell', exact: true }).click();
  await saved(page);
  await region.getByRole('button', { name: 'Use stored spell', exact: true }).click();
  await saved(page);
  expect((await reviewState(page, file.build.id)).live.storedSpellItem).toMatchObject({
    spellId: 'spell.web',
    spent: 1,
    limit: 6,
  });
  expect((await reviewState(page, file.build.id)).live.slotsUsed.slice(1, 3)).toEqual([0, 0]);

  const mark = page.getByRole('region', { name: 'Arcane Firearm', exact: true });
  await mark.getByLabel('Wand, staff or rod').selectOption('wand');
  await mark.getByRole('button', { name: 'Mark Arcane Firearm', exact: true }).click();
  await saved(page);
  await page.goto(`/characters/${file.build.id}/spells`);
  const row = page
    .getByRole('main')
    .getByRole('button', { name: /^Thunderwave\b/ })
    .locator('..');
  await row.getByRole('button', { name: 'Cast', exact: true }).click();
  const cast = page.getByRole('dialog', { name: 'Cast Thunderwave', exact: true });
  await cast.getByRole('checkbox', { name: /Cast through .* for \+1d8/ }).check();
  await cast.getByRole('button', { name: 'Cast Thunderwave (L1)', exact: true }).click();
  await expect(cast).toBeHidden();
  await saved(page);
  expect((await reviewState(page, file.build.id)).live.slotsUsed[1]).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
