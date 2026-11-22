import { expect, test } from './fixtures';
import { importReview, reviewFile, reviewState, saved } from './review-fixtures';

test('known infusion picker searches and learns separate replica recipes at the right level', async ({
  page,
}) => {
  const file = reviewFile('replicate-artificer');
  file.campaign.sources = ['PHB', 'TCE'];
  file.build.classes = [{ classId: 'class.artificer', level: 2 }];
  file.build.hpEntries = [
    { level: 1, classId: 'class.artificer', method: 'max', value: 8 },
    { level: 2, classId: 'class.artificer', method: 'average', value: 5 },
  ];
  file.build.spells = [];
  file.build.proficiencyPicks = {};
  file.build.featureIds = ['feature.artificer.infusion-enhanced-weapon'];
  await importReview(page, file, 'todo');
  const row = page.getByRole('listitem').filter({ hasText: 'Infusions: pick 3' });
  await row.getByRole('button', { name: 'Choose', exact: true }).click();
  await expect(row.getByText(/Artificer 2 · 1\/4 infusions known/)).toBeVisible();
  await row.getByText('Already known (1)', { exact: true }).click();
  await expect(row.getByText('Infusion: Enhanced Weapon', { exact: true })).toBeVisible();
  const standard = row.getByRole('group', { name: 'Standard infusions', exact: true });
  const recipes = row.getByRole('group', { name: 'Replicate Magic Item', exact: true });
  await expect(
    standard.getByRole('checkbox', { name: 'Infusion: Homunculus Servant', exact: true }),
  ).toBeVisible();
  await expect(recipes.getByRole('checkbox', { name: 'Winged Boots', exact: true })).toHaveCount(0);
  await expect(standard.getByRole('checkbox', { name: 'Bag of Holding', exact: true })).toHaveCount(
    0,
  );
  const search = row.getByRole('searchbox', { name: 'Search infusions', exact: true });
  await search.fill('bag of holding');
  const bag = recipes.getByRole('checkbox', { name: 'Bag of Holding', exact: true });
  await bag.check();
  await search.fill('sending stones');
  await expect(bag).toBeChecked();
  await recipes.getByRole('checkbox', { name: 'Sending Stones', exact: true }).check();
  await search.clear();
  const defense = standard.getByRole('checkbox', {
    name: 'Infusion: Enhanced Defense',
    exact: true,
  });
  await defense.check();
  await expect(recipes.getByRole('checkbox', { name: 'Alchemy Jug', exact: true })).toBeDisabled();
  await defense.uncheck();
  await row.getByRole('button', { name: 'Save choice', exact: true }).click();
  await saved(page);
  await page.reload();
  const remaining = page.getByRole('listitem').filter({ hasText: 'Infusions: pick 1' });
  await remaining.getByRole('button', { name: 'Choose', exact: true }).click();
  await remaining.getByText('Already known (3)', { exact: true }).click();
  const learnedRecipes = remaining.getByRole('group', { name: 'Known Replicate Magic Item' });
  await expect(learnedRecipes.getByText('Bag of Holding', { exact: true })).toBeVisible();
  await expect(learnedRecipes.getByText('Sending Stones', { exact: true })).toBeVisible();
  expect((await reviewState(page, file.build.id)).build.featureIds).toEqual([
    ...file.build.featureIds,
    'feature.artificer.infusion-replicate-magic-item-bag-of-holding',
    'feature.artificer.infusion-replicate-magic-item-sending-stones',
  ]);
  await page.goto(`/characters/${file.build.id}/features`);
  const panel = page.getByRole('region', { name: 'Infused items', exact: true });
  await expect(panel.getByText('Infusions known · 3/4', { exact: true })).toBeVisible();
  const known = panel.getByRole('combobox', { name: 'Known infusion', exact: true });
  await known.selectOption({ label: 'Bag of Holding' });
  await expect(known.locator('optgroup[label="Replicate Magic Item"] option:checked')).toHaveText(
    'Bag of Holding',
  );
  await expect(panel.getByText(/Record the replicated item in Inventory/)).toBeVisible();
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await saved(page);
  await page.goto(`/characters/${file.build.id}/todo`);
  await expect(page.getByText('Infusions: pick 3', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a long rest opens infusion assignment; bonuses survive reload and Undo removes only the infusion', async ({
  page,
}) => {
  const file = reviewFile('infusion-artificer');
  file.campaign.sources = ['PHB', 'TCE'];
  file.build.classes = [{ classId: 'class.artificer', level: 2 }];
  file.build.hpEntries = [
    { level: 1, classId: 'class.artificer', method: 'max', value: 8 },
    { level: 2, classId: 'class.artificer', method: 'average', value: 5 },
  ];
  file.build.spells = [];
  file.build.featureIds = ['feature.artificer.infusion-enhanced-weapon'];
  file.build.items = [{ instanceId: 'sword', itemId: 'item.shortsword' }];
  file.live.items = { sword: { qty: 1, equipped: true, attuned: false } };
  delete file.live.lastLongRestEnd;
  await importReview(page, file, 'features');
  await page.goto(`/characters/${file.build.id}/todo`);
  const knownChoices = page.getByRole('listitem').filter({ hasText: 'Infusions: pick 3' });
  await knownChoices.getByRole('button', { name: 'Choose', exact: true }).click();
  await expect(
    knownChoices.getByRole('checkbox', { name: 'Infusion: Radiant Weapon', exact: true }),
  ).toHaveCount(0);
  for (const name of ['Enhanced Defense', 'Enhanced Arcane Focus', 'Mind Sharpener'])
    await knownChoices.getByRole('checkbox', { name: `Infusion: ${name}`, exact: true }).check();
  await expect(
    knownChoices.getByRole('checkbox', { name: 'Infusion: Returning Weapon', exact: true }),
  ).toBeDisabled();
  await knownChoices.getByRole('button', { name: 'Save choice', exact: true }).click();
  await saved(page);
  await page.reload();
  await expect(page.getByText('Infusions: pick 3', { exact: true })).toHaveCount(0);
  expect(
    (await reviewState(page, file.build.id)).build.featureIds.filter((id) =>
      id.startsWith('feature.artificer.infusion-'),
    ),
  ).toHaveLength(4);
  await page.goto(`/characters/${file.build.id}/features`);
  await page.getByRole('button', { name: 'Find', exact: true }).first().click();
  await page.getByRole('combobox', { name: 'Find', exact: true }).fill('long rest');
  await page.getByRole('option', { name: /Long rest/ }).click();
  await page
    .getByRole('dialog', { name: 'Long Rest', exact: true })
    .getByRole('button', { name: 'Apply Long Rest', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Review infusions', exact: true });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('combobox', { name: 'Known infusion', exact: true })
    .selectOption('feature.artificer.infusion-enhanced-weapon');
  await dialog.getByRole('combobox', { name: 'Item to infuse', exact: true }).selectOption('sword');
  await dialog.getByRole('button', { name: 'Infuse item', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Infused items · 1/2', exact: true }),
  ).toBeVisible();
  await saved(page);
  expect((await reviewState(page, file.build.id)).live.infusions).toHaveLength(1);
  await page.screenshot({ path: test.info().outputPath('infusions.png'), fullPage: true });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Infused items · 1/2', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Infused items · 0/2', exact: true }),
  ).toBeVisible();
  await saved(page);
  const after = await reviewState(page, file.build.id);
  expect(after.live.infusions).toBeUndefined();
  expect(after.live.lastLongRestEnd).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('changing Point Buy to Rolled preserves Tasha class availability', async ({ page }) => {
  const file = reviewFile('source-artificer');
  file.campaign.id = 'source-check';
  file.build.campaignId = file.campaign.id;
  file.campaign.sources = ['PHB', 'TCE'];
  file.campaign.sourceParts = { TCE: ['options'] };
  file.campaign.abilityMethod = 'point-buy';
  await importReview(page, file, 'sheet');
  await page.goto('/campaigns/source-check/characters/new');
  await page.getByLabel('Class', { exact: true }).selectOption('class.artificer');
  await expect(page.getByLabel('STR base', { exact: true })).toHaveAttribute('min', '8');
  await page.goto('/campaigns/source-check/settings');
  await expect(
    page.getByRole('checkbox', { name: /^Tasha's Cauldron of Everything/ }),
  ).toBeChecked();
  await page.locator('input[name="abilities"][value="rolled"]').check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await saved(page);
  await page.goto('/campaigns/source-check/characters/new');
  await expect(
    page.getByLabel('Class', { exact: true }).locator('option[value="class.artificer"]'),
  ).toHaveCount(1);
  await page.getByLabel('Class', { exact: true }).selectOption('class.artificer');
  await expect(page.getByLabel('STR base', { exact: true })).toHaveAttribute('min', '3');
  await page.reload();
  await expect(
    page.getByLabel('Class', { exact: true }).locator('option[value="class.artificer"]'),
  ).toHaveCount(1);
  await page.goto('/campaigns/source-check/settings');
  await expect(page.locator('input[name="abilities"][value="rolled"]')).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: /^Tasha's Cauldron of Everything/ }),
  ).toBeChecked();
});
