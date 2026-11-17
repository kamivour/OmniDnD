import { expect, test } from './fixtures';
import { importReview, reviewFile, reviewState, saved } from './review-fixtures';
import { freshEconomy } from '../../src/engine/commands/shared';

function artificer(id: string, level = 9) {
  const file = reviewFile(id);
  file.campaign.sources = ['PHB', 'TCE'];
  file.build.classes = [
    { classId: 'class.artificer', level, subclassId: 'subclass.artificer.artillerist' },
  ];
  file.build.abilityScores.base.INT = 16;
  file.build.abilityScores.bonuses = [];
  file.build.featureIds = [];
  file.build.spells = [];
  file.build.proficiencyPicks = {};
  file.build.hpEntries = Array.from({ length: level }, (_, index) => ({
    level: index + 1,
    classId: 'class.artificer',
    method: index ? 'average' : 'max',
    value: index ? 5 : 8,
  }));
  file.live.combat = { round: 1, turnActive: true, economy: freshEconomy() };
  return file;
}

for (const form of ['Flamethrower', 'Force Ballista', 'Protector']) {
  test(`create and activate only the selected cannon form: ${form}`, async ({ page }) => {
    const file = artificer(`cannon-${form.replaceAll(' ', '-')}`);
    await importReview(page, file, 'companions?from=eldritch-cannon');
    const dialog = page.getByRole('dialog', { name: 'Add companion', exact: true });
    await expect(dialog.getByLabel('Form', { exact: true })).toHaveValue('');
    await dialog.getByRole('button', { name: 'Add companion', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Choose a companion form.');
    await dialog.getByLabel('Form', { exact: true }).selectOption(form);
    await dialog.getByLabel('Cannon size', { exact: true }).selectOption('Tiny');
    await dialog.getByLabel('Has legs', { exact: false }).uncheck();
    await dialog.getByRole('button', { name: 'Add companion', exact: true }).click();
    await expect(dialog).toBeHidden();
    await saved(page);
    const card = page.getByRole('region', { name: 'Companion: Eldritch Cannon', exact: true });
    await expect(card).toContainText('Tiny magical object');
    await expect(card).toContainText('45/45');
    if (form === 'Flamethrower') await expect(card).toContainText('3d8 fire');
    if (form === 'Force Ballista') await expect(card).toContainText('3d8 force');
    if (form === 'Protector') await expect(card).toContainText('1d8+3 temporary HP');
    await expect(card.getByRole('button', { name: /^Command:/ })).toHaveCount(0);
    await page.reload();
    await saved(page);
    await card.getByRole('button', { name: `Activate ${form}`, exact: true }).click();
    await saved(page);
    expect((await reviewState(page, file.build.id)).live.combat!.economy.bonusUsed).toBe(true);
    await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
    await saved(page);
    expect((await reviewState(page, file.build.id)).live.combat!.economy.bonusUsed).toBe(false);
    await card.getByRole('button', { name: 'Edit Eldritch Cannon', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Edit Eldritch Cannon', exact: true });
    await expect(editor.getByLabel('Form', { exact: true })).toHaveValue(form);
    await expect(editor.getByLabel('Form', { exact: true })).toBeDisabled();
    await page.screenshot({ path: test.info().outputPath(`cannon-${form}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('summon forms show different attacks and compute upcast HP, AC and damage', async ({
  page,
}) => {
  const file = artificer('summon-forms');
  await importReview(page, file, 'companions');
  await page.getByRole('button', { name: 'Add companion', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add companion', exact: true });
  const families = [
    ['Bestial Spirit', ['Air', 'Land', 'Water']],
    ['Fey Spirit', ['Fuming', 'Mirthful', 'Tricksy']],
    ['Shadow Spirit', ['Fury', 'Despair', 'Fear']],
    ['Undead Spirit', ['Ghostly', 'Putrid', 'Skeletal']],
    ['Aberrant Spirit', ['Beholderkin', 'Slaad', 'Star Spawn']],
    ['Construct Spirit', ['Clay', 'Metal', 'Stone']],
    ['Elemental Spirit', ['Air', 'Earth', 'Fire', 'Water']],
    ['Celestial Spirit', ['Avenger', 'Defender']],
    ['Draconic Spirit', ['Chromatic', 'Gem', 'Metallic']],
    ['Fiendish Spirit', ['Demon', 'Devil', 'Yugoloth']],
  ] as const;
  for (const label of [
    'Imp (Chain familiar)',
    'Sprite (Chain familiar)',
    'Warhorse (Find Steed)',
    'Camel (Find Steed)',
    "Hawk (Ranger's companion)",
  ]) {
    await dialog.getByLabel('Template', { exact: true }).selectOption(label);
    await expect(dialog.getByLabel('Name', { exact: true })).not.toHaveValue('');
  }
  for (const [family, forms] of families) {
    await dialog.getByLabel('Template', { exact: true }).selectOption(family);
    for (const form of forms) {
      await dialog.getByLabel('Form', { exact: true }).selectOption(form);
      await expect(dialog.locator('[aria-label="Computed companion preview"]')).toContainText(form);
    }
  }
  await dialog.getByLabel('Template', { exact: true }).selectOption('Undead Spirit');
  await dialog.getByLabel('Form', { exact: true }).selectOption('Skeletal');
  await dialog.getByLabel('Spell slot level', { exact: true }).selectOption('5');
  await dialog.getByRole('button', { name: 'Add companion', exact: true }).click();
  await expect(dialog).toBeHidden();
  await saved(page);
  const card = page.getByRole('region', { name: 'Companion: Undead Spirit', exact: true });
  await expect(card).toContainText('Skeletal · slot 5');
  await expect(card).toContainText('AC 16');
  await expect(card).toContainText('40/40');
  await expect(card).toContainText('Grave Bolt +7 · 2d4+8 necrotic');
  await expect(card).not.toContainText('Deathly Touch');
  await page.reload();
  await saved(page);
  await expect(card).toContainText('Skeletal · slot 5');
  const state = await reviewState(page, file.build.id);
  expect(state.build.companions![0]!.profile).toMatchObject({
    family: 'undead',
    form: 'Skeletal',
    spellLevel: 5,
    castingClassId: 'class.artificer',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('summon-form.png'), fullPage: true });
});

test('old cannon records can be configured without healing or resetting their timer', async ({
  page,
}) => {
  const file = artificer('old-cannon');
  file.build.companions = [
    {
      id: 'old',
      name: 'Old cannon',
      type: 'summon',
      kind: 'Small construct',
      ac: 18,
      maxHp: 45,
      speed: { walk: 15 },
      abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      attacks: [],
      traits: [],
      uses: [],
      sourceId: 'feature.artificer.artillerist-eldritch-cannon',
      durationSeconds: 3600,
    },
  ];
  const endsAt = file.live.clock.seconds + 1800;
  file.live.companions = {
    old: { hp: 17, tempHp: 4, status: 'active', conditions: [], usesSpent: {}, endsAt },
  };
  await importReview(page, file, 'companions');
  const card = page.getByRole('region', { name: 'Companion: Old cannon', exact: true });
  await card.getByRole('button', { name: 'Edit Old cannon', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit Old cannon', exact: true });
  await editor.getByRole('button', { name: 'Configure companion form', exact: true }).click();
  await editor.getByLabel('Form', { exact: true }).selectOption('Protector');
  await editor.getByRole('button', { name: 'Save companion', exact: true }).click();
  await expect(editor).toBeHidden();
  await saved(page);
  expect((await reviewState(page, file.build.id)).live.companions!.old).toMatchObject({
    hp: 17,
    tempHp: 4,
    endsAt,
  });
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await saved(page);
  expect((await reviewState(page, file.build.id)).build.companions![0]!.profile).toBeUndefined();
});

test('refresh an older Steel Defender template without healing it', async ({ page }) => {
  const file = artificer('old-defender', 15);
  file.build.classes[0]!.subclassId = 'subclass.artificer.battle-smith';
  file.build.companions = [
    {
      id: 'old',
      name: 'Old defender',
      type: 'summon',
      kind: 'Medium construct',
      ac: 15,
      maxHp: 75,
      speed: { walk: 40 },
      abilities: { STR: 14, DEX: 12, CON: 14, INT: 4, WIS: 10, CHA: 6 },
      attacks: [],
      traits: [],
      uses: [],
      sourceId: 'feature.artificer.battle-smith-steel-defender',
      limit: { key: 'steel-defender', max: 1 },
    },
  ];
  file.live.companions = {
    old: { hp: 17, tempHp: 0, status: 'active', conditions: [], usesSpent: {} },
  };
  await importReview(page, file, 'companions');
  const card = page.getByRole('region', { name: 'Companion: Old defender', exact: true });
  await expect(card).toContainText('AC 15');
  await card.getByRole('button', { name: 'Edit Old defender', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit Old defender', exact: true });
  await editor.getByLabel('Refresh from template', { exact: true }).selectOption('Steel Defender');
  await editor.getByRole('button', { name: 'Save companion', exact: true }).click();
  await expect(editor).toBeHidden();
  await saved(page);
  await expect(card).toContainText('AC 17');
  await expect(card).toContainText('17/80');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('refreshed-defender.png'), fullPage: true });
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await saved(page);
  await expect(card).toContainText('AC 15');
  await expect(card).toContainText('17/75');
});
