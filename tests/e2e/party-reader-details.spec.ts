import { expect, test, type Page } from './fixtures';
import { importReview, reviewFile, reviewState } from './review-fixtures';

function detail(page: Page, name: string) {
  return page.viewportSize()!.width < 1024
    ? page.getByRole('dialog', { name, exact: true })
    : page.getByRole('complementary', { name: 'Pinned detail' });
}

test('shared inventory opens the right instance, weapon facts and nested custom gear', async ({
  page,
}) => {
  const file = reviewFile('party-inventory');
  file.build.partyOwner = { userId: 'friend', name: 'Ana' };
  file.build.customItems = [
    {
      kind: 'item',
      id: 'item.custom.tallies',
      name: 'Carved tallies',
      ruleset: '5e-2014',
      source: 'HB',
      srd: false,
      category: 'gear',
      summary: { effect: 'A set of carved counters to mark loans.' },
    },
  ];
  file.build.items = [
    { instanceId: 'trident', itemId: 'item.trident-of-fish-command' },
    { instanceId: 'bag', itemId: 'item.bag-of-holding', notes: 'Private bag annotation' },
    { instanceId: 'pouch', itemId: 'item.pouch', container: 'bag' },
    { instanceId: 'tallies', itemId: 'item.custom.tallies', container: 'pouch' },
    { instanceId: 'first', itemId: 'item.wand-of-magic-missiles' },
    { instanceId: 'second', itemId: 'item.wand-of-magic-missiles', container: 'bag' },
    { instanceId: 'empty', itemId: 'item.potion-of-healing-common' },
  ];
  file.live.items = Object.fromEntries(
    file.build.items.map(({ instanceId }) => [
      instanceId,
      {
        qty: instanceId === 'empty' ? 0 : 1,
        equipped: instanceId === 'trident',
        attuned: false,
        ...(instanceId === 'first'
          ? { charges: 2 }
          : instanceId === 'second'
            ? { charges: 5 }
            : {}),
      },
    ]),
  );
  await importReview(page, file, 'inventory', false);
  const before = await reviewState(page, file.build.id);
  const inventory = page.getByRole('region', { name: 'Inventory', exact: true });
  await inventory.getByRole('button', { name: 'Equipped', exact: true }).click();
  await inventory.getByRole('button', { name: 'Trident of Fish Command', exact: true }).click();
  const trident = detail(page, 'Trident of Fish Command');
  await expect(trident.getByText('Piercing', { exact: true })).toBeVisible();
  await expect(trident.getByRole('button', { name: 'Versatile' })).toBeVisible();
  await page.keyboard.press('Escape');
  await inventory.getByRole('button', { name: 'Equipped', exact: true }).click();
  const search = inventory.getByRole('searchbox', { name: 'Search inventory' });
  await search.fill('wand of magic missiles');
  const wands = inventory.getByRole('button', { name: 'Wand of Magic Missiles', exact: true });
  await expect(wands).toHaveCount(2);
  await wands.filter({ hasText: '5/7 charges' }).click();
  await expect(detail(page, 'Wand of Magic Missiles').getByText('×1 · 5/7 charges')).toBeVisible();
  await page.keyboard.press('Escape');
  await wands.filter({ hasText: '2/7 charges' }).click();
  await expect(detail(page, 'Wand of Magic Missiles').getByText('×1 · 2/7 charges')).toBeVisible();
  await page.keyboard.press('Escape');
  await search.fill('tallies');
  const tallies = inventory.getByRole('button', { name: 'Carved tallies' });
  await expect(tallies).toContainText('Bag of Holding › Pouch');
  await tallies.click();
  await expect(
    detail(page, 'Carved tallies').getByText('A set of carved counters to mark loans.'),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await search.fill('potion of healing');
  await expect(
    inventory.getByRole('button', { name: 'Potion of Healing', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Private bag annotation', { exact: false })).toHaveCount(0);
  expect(await reviewState(page, file.build.id)).toEqual(before);
});

test('shared spellbook separates Pact Magic and opens prepared and unprepared spells', async ({
  page,
}) => {
  const file = reviewFile('party-spellbook');
  file.build.partyOwner = { userId: 'friend', name: 'Ana' };
  file.build.classes = [
    { classId: 'class.wizard', level: 3 },
    { classId: 'class.warlock', level: 2 },
    { classId: 'class.paladin', level: 3, subclassId: 'subclass.paladin.devotion' },
  ];
  file.build.hpEntries = file.build.classes
    .flatMap(({ classId, level }) => Array.from({ length: level }, () => classId))
    .map((classId, i) => ({
      classId,
      level: i + 1,
      method: i === 0 ? 'max' : 'average',
      value: i === 0 ? 6 : 4,
    }));
  file.build.spells = [
    {
      classId: 'class.wizard',
      known: ['spell.magic-missile', 'spell.sleep'],
      prepared: ['spell.magic-missile'],
    },
    { classId: 'class.paladin', known: [], prepared: ['spell.bless'] },
    { classId: 'class.warlock', known: ['spell.eldritch-blast'] },
  ];
  file.live.slotsUsed[1] = 4;
  file.live.pactSlotsUsed = 1;
  file.live.concentration = { spellId: 'spell.bless' };
  await importReview(page, file, 'spells', false);
  const before = await reviewState(page, file.build.id);
  const spells = page.getByRole('region', { name: 'Spells', exact: true });
  await expect(spells.getByRole('img', { name: 'Level 1: 0 of 4 left' })).toBeVisible();
  await expect(
    spells.getByRole('img', { name: 'Pact Magic · Level 1: 1 of 2 left' }),
  ).toBeVisible();
  await expect(spells.getByRole('button', { name: 'Bless', exact: true })).toContainText(
    'Prepared · Concentrating',
  );
  await expect(spells.getByRole('button', { name: 'Protection from Evil and Good' })).toContainText(
    'Always prepared',
  );
  await spells.getByRole('searchbox', { name: 'Search spells' }).fill('sleep');
  const sleep = spells.getByRole('button', { name: 'Sleep', exact: true });
  await expect(sleep).toContainText('In spellbook');
  await sleep.click();
  const preview = detail(page, 'Sleep');
  await expect(preview).toBeVisible();
  await expect(preview.getByText(/5d8/i)).toBeVisible();
  expect(await reviewState(page, file.build.id)).toEqual(before);
  await page.keyboard.press('Escape');
  await expect(sleep).toBeFocused();
  await expect(spells.getByRole('searchbox', { name: 'Search spells' })).toHaveValue('sleep');
});
