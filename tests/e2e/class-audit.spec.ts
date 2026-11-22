import { expect, test } from './fixtures';
import { importReview, reviewFile, reviewState, saved } from './review-fixtures';

test('Bladesinger starts Bladesong from Combat and can undo it', async ({ page }) => {
  const file = reviewFile('bladesong-audit');
  const classId = 'class.wizard';
  const featureId = 'feature.wizard.bladesinging-bladesong';
  file.campaign.sources = ['PHB', 'TCE'];
  file.build.classes = [{ classId, level: 2, subclassId: 'subclass.wizard.bladesinging' }];
  file.build.hpEntries = [1, 2].map((level) => ({
    level,
    classId,
    method: level === 1 ? 'max' : 'average',
    value: level === 1 ? 6 : 4,
  }));
  file.build.spells = [];
  await importReview(page, file, 'combat');
  const main = page.getByRole('main');
  await main.getByRole('tab', { name: 'Bonus', exact: true }).click();
  const song = main.getByRole('listitem').filter({ hasText: 'Bladesong' });
  await song.getByRole('button', { name: /^Use/ }).click();
  await saved(page);
  const beforeUndo = (await reviewState(page, file.build.id)).live;
  expect(beforeUndo.featureUsesSpent[featureId]).toBe(1);
  expect(beforeUndo.effects).toContainEqual(
    expect.objectContaining({
      sourceId: featureId,
      endsAt: beforeUndo.clock.seconds + 60,
    }),
  );
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await saved(page);
  const afterUndo = (await reviewState(page, file.build.id)).live;
  expect(afterUndo.featureUsesSpent[featureId]).toBeUndefined();
  expect(afterUndo.effects.some((entry) => entry.sourceId === featureId)).toBe(false);
});

test('Wizard replaces one cantrip during a long rest', async ({ page }) => {
  const file = reviewFile('wizard-cantrip-formulas');
  const classId = 'class.wizard';
  file.campaign.sources = ['PHB', 'TCE'];
  file.campaign.optionalRules.optionalClassFeatures = true;
  file.build.classes = [{ classId, level: 3, subclassId: 'subclass.wizard.evocation' }];
  file.build.hpEntries = [1, 2, 3].map((level) => ({
    level,
    classId,
    method: level === 1 ? 'max' : 'average',
    value: level === 1 ? 6 : 4,
  }));
  file.build.spells = [{ classId, known: ['spell.light', 'spell.fire-bolt'] }];
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
  const dialog = page.getByRole('dialog', { name: 'Long Rest', exact: true });
  await dialog.getByLabel('Wizard cantrip to replace').selectOption('spell.light');
  await dialog.getByLabel('New Wizard cantrip').selectOption('spell.ray-of-frost');
  await dialog.getByRole('checkbox', { name: 'Review prepared spells after resting' }).uncheck();
  await dialog.getByRole('button', { name: 'Apply Long Rest', exact: true }).click();
  await expect(dialog).toBeHidden();
  await saved(page);
  expect((await reviewState(page, file.build.id)).build.spells[0]?.known).toEqual([
    'spell.ray-of-frost',
    'spell.fire-bolt',
  ]);
});

test('Stars Druid casts Guiding Bolt from Star Map or with a slot from one Spellbook row', async ({
  page,
}) => {
  const file = reviewFile('stars-star-map');
  const classId = 'class.druid';
  const featureId = 'feature.druid.stars-star-map';
  file.campaign.sources = ['PHB', 'TCE'];
  file.build.classes = [{ classId, level: 2, subclassId: 'subclass.druid.stars' }];
  file.build.hpEntries = [1, 2].map((level) => ({
    level,
    classId,
    method: level === 1 ? 'max' : 'average',
    value: level === 1 ? 8 : 5,
  }));
  file.build.spells = [];
  file.live.slotsUsed = file.live.slotsUsed.map(() => 0);
  await importReview(page, file, 'spells');
  const main = page.getByRole('main');
  const spell = main.getByRole('button', { name: /^Guiding Bolt\b/ });
  await expect(spell).toHaveCount(1);
  const row = spell.locator('..');
  await row.getByRole('button', { name: 'Cast', exact: true }).click();
  const cast = page.getByRole('dialog', { name: 'Cast Guiding Bolt', exact: true });
  await cast.getByRole('button', { name: 'Cast Guiding Bolt (free)', exact: true }).click();
  await expect(cast).toBeHidden();
  await saved(page);
  const afterFree = (await reviewState(page, file.build.id)).live;
  expect(afterFree.featureUsesSpent[featureId]).toBe(1);
  expect(afterFree.slotsUsed[1]).toBe(0);
  await row.getByRole('button', { name: 'Cast', exact: true }).click();
  await cast.getByRole('button', { name: /^L1\b/ }).click();
  await cast.getByRole('button', { name: 'Cast Guiding Bolt (L1)', exact: true }).click();
  await expect(cast).toBeHidden();
  await saved(page);
  const afterSlot = (await reviewState(page, file.build.id)).live;
  expect(afterSlot.featureUsesSpent[featureId]).toBe(1);
  expect(afterSlot.slotsUsed[1]).toBe(1);
});

test('Lore Bard learns two bonus spells and finds them in Spellbook', async ({ page }) => {
  const file = reviewFile('lore-bard-magical-secrets');
  const classId = 'class.bard';
  const featureId = 'feature.bard.additional-magical-secrets';
  file.build.classes = [{ classId, level: 6, subclassId: 'subclass.bard.lore' }];
  file.build.hpEntries = Array.from({ length: 6 }, (_, index) => ({
    level: index + 1,
    classId,
    method: index === 0 ? 'max' : 'average',
    value: index === 0 ? 8 : 5,
  }));
  await importReview(page, file, 'todo');
  const group = page
    .getByRole('listitem')
    .filter({ hasText: 'Additional Magical Secrets: choose spells' });
  await group.getByRole('button', { name: 'Choose', exact: true }).click();
  const search = group.getByRole('searchbox', { name: 'Search spells' });
  await search.fill('Counterspell');
  await group.getByRole('checkbox', { name: 'Counterspell', exact: true }).check();
  await search.fill('Revivify');
  await group.getByRole('checkbox', { name: 'Revivify', exact: true }).check();
  await group.getByRole('button', { name: 'Save choice', exact: true }).click();
  await saved(page);
  expect((await reviewState(page, file.build.id)).build.featSpells?.[featureId]?.spellIds).toEqual([
    'spell.counterspell',
    'spell.revivify',
  ]);
  await page.goto(`/characters/${file.build.id}/spells`);
  const main = page.getByRole('main');
  await expect(main.getByRole('button', { name: /^Counterspell\b/ })).toBeVisible();
  await expect(main.getByRole('button', { name: /^Revivify\b/ })).toBeVisible();
});

test('Wizard recovers chosen slots at short rest and Undo restores spending', async ({ page }) => {
  const file = reviewFile('wizard-arcane-recovery');
  const classId = 'class.wizard';
  file.build.classes = [{ classId, level: 4, subclassId: 'subclass.wizard.evocation' }];
  file.build.hpEntries = Array.from({ length: 4 }, (_, index) => ({
    level: index + 1,
    classId,
    method: index === 0 ? 'max' : 'average',
    value: index === 0 ? 6 : 4,
  }));
  file.build.spells = [];
  file.live.slotsUsed = file.live.slotsUsed.map((_, level) => [0, 2, 1][level] ?? 0);
  await importReview(page, file, 'combat');
  if (page.viewportSize()!.width < 640) {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'More', exact: true })
      .getByRole('button', { name: 'Short Rest', exact: true })
      .click();
  } else
    await page
      .getByRole('button', { name: 'Short Rest', exact: true })
      .filter({ visible: true })
      .click();
  const dialog = page.getByRole('dialog', { name: 'Short Rest', exact: true });
  await dialog.getByLabel('Level 2 slots to recover').selectOption('1');
  await expect(dialog.getByText('2 / 2 slot levels selected')).toBeVisible();
  await dialog.getByRole('button', { name: 'Apply Short Rest', exact: true }).click();
  await expect(dialog).toBeHidden();
  await saved(page);
  expect((await reviewState(page, file.build.id)).live.slotsUsed.slice(1, 3)).toEqual([2, 0]);
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await saved(page);
  expect((await reviewState(page, file.build.id)).live.slotsUsed.slice(1, 3)).toEqual([2, 1]);
});

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
