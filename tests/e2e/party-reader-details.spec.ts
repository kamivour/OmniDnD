import { expect, test, type Page } from './fixtures';
import { importReview, reviewFile, reviewState } from './review-fixtures';

function detail(page: Page, name: string) {
  return page.viewportSize()!.width < 1024
    ? page.getByRole('dialog', { name, exact: true })
    : page.getByRole('complementary', { name: 'Pinned detail' });
}

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
