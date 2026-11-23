import { expect, test } from './fixtures';
import { importReview, reviewFile, reviewState, saved } from './review-fixtures';

test('Alchemist makes a rolled elixir in Long Rest and uses it in Features', async ({ page }) => {
  const file = reviewFile('alchemist-experimental-elixir');
  const classId = 'class.artificer';
  file.campaign.sources = ['PHB', 'TCE'];
  file.build.classes = [{ classId, level: 3, subclassId: 'subclass.artificer.alchemist' }];
  file.build.hpEntries = [1, 2, 3].map((level) => ({
    level,
    classId,
    method: level === 1 ? 'max' : 'average',
    value: level === 1 ? 8 : 5,
  }));
  file.build.spells = [];
  file.build.items = [{ itemId: 'item.alchemists-supplies', instanceId: 'supplies' }];
  file.live.items = { supplies: { qty: 1, equipped: false, attuned: false } };
  await importReview(page, file, 'combat');
  if (page.viewportSize()!.width < 640) {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'More', exact: true })
      .getByRole('button', { name: 'Long Rest', exact: true })
      .click();
  } else
    await page
      .getByRole('button', { name: 'Long Rest', exact: true })
      .filter({ visible: true })
      .click();
  const rest = page.getByRole('dialog', { name: 'Long Rest', exact: true });
  await rest.getByLabel('Elixir roll 1').selectOption('3');
  await rest.getByRole('checkbox', { name: 'Review prepared spells after resting' }).uncheck();
  await rest.getByRole('button', { name: 'Apply Long Rest', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Review infusions', exact: true });
  await review.getByRole('button', { name: 'Done with infusions', exact: true }).click();
  await page.goto(`/characters/${file.build.id}/features`);
  await saved(page);
  const panel = page.getByRole('region', { name: 'Experimental Elixirs', exact: true });
  await panel.getByLabel(/Available elixirs/).selectOption({ label: '1. Resilience' });
  await panel.getByRole('button', { name: 'Use elixir', exact: true }).click();
  await saved(page);
  const live = (await reviewState(page, file.build.id)).live;
  expect(live.experimentalElixirs).toEqual([]);
  expect(live.effects).toContainEqual(
    expect.objectContaining({ name: 'Resilience elixir', endsAt: live.clock.seconds + 600 }),
  );
});

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
