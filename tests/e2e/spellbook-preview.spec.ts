import type { Locator } from '@playwright/test';
import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import { ExportFileSchema } from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

const spellPath = '/characters/the-fool/spells';
const main = (page: Page) => page.getByRole('main');
const hud = (page: Page) => page.getByRole('banner', { name: 'Character HUD', exact: true });
const row = (page: Page, name: string) =>
  main(page).getByRole('button', { name: new RegExp(`^${name}`) });
const panel = (page: Page) => page.getByRole('complementary', { name: 'Pinned detail' });
const navigation = (page: Page) =>
  page.getByRole('navigation', { name: 'Main' }).filter({ visible: true });
const slot = (detail: Locator, level: number) =>
  detail.getByRole('button', { name: new RegExp(`^L${level} `) });

async function expectSaved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

async function expectNoOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
}

async function adjustHudSlots(page: Page, direction: 'Use' | 'Restore', level: number, count = 1) {
  await hud(page).getByRole('button', { name: 'Adjust spell slots', exact: true }).click();
  const adjustment = page.getByRole('dialog', { name: 'Spell slots', exact: true });
  for (let index = 0; index < count; index += 1) {
    await adjustment
      .getByRole('button', { name: `${direction} one: Level ${level} spell slots`, exact: true })
      .click();
  }
  await page.keyboard.press('Escape');
  await expect(adjustment).toBeHidden();
  await expectSaved(page);
}

async function expectWhispersMetadata(detail: Locator) {
  await expect(detail).toContainText('L1 Enchantment');
  await expect(detail).toContainText('60 ft');
  await expect(detail).toContainText('WIS save DC 15');
  await expect(detail).toContainText('Instant · V');
  await expect(detail.getByText('Damage', { exact: true })).toBeVisible();
  await expect(detail.getByText('Control', { exact: true })).toBeVisible();
  await expect(detail).toContainText('A deafened creature succeeds automatically.');
  await expect(detail).toContainText('Success: Half damage and no forced movement.');
  await expect(detail).toContainText('Upcast: +1d6 per slot level above 1.');
}

test.describe('desktop previews', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop pointer and keyboard');

  test('hover and keyboard focus show registry metadata; Enter pins the same spell', async ({
    page,
  }, info) => {
    await page.goto(spellPath);
    await expectSaved(page);
    const trigger = row(page, 'Dissonant Whispers');
    await trigger.hover();
    const preview = page.getByRole('tooltip');
    await expectWhispersMetadata(preview);
    await expect(preview).toContainText('Click to pin');
    await expect(panel(page)).toBeHidden();
    await page.screenshot({
      path: info.outputPath('hover-preview-1440.png'),
      animations: 'disabled',
    });

    await page.mouse.move(0, 0);
    await expect(preview).toBeHidden();
    await trigger.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(trigger).toBeFocused();
    await expectWhispersMetadata(preview);
    await page.keyboard.press('Enter');
    await expectWhispersMetadata(panel(page));
    await expect(preview).toBeHidden();
    await expect(slot(panel(page), 2)).toHaveAttribute('aria-pressed', 'true');
    await expectNoOverflow(page);
    await page.screenshot({
      path: info.outputPath('pinned-preview-1440.png'),
      animations: 'disabled',
    });
    await panel(page).getByRole('button', { name: 'Close details', exact: true }).click();
    await expect(panel(page)).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('pinned slot selection stays live through HUD adjustments and navigation', async ({
    page,
  }) => {
    await page.goto(spellPath);
    await expectSaved(page);
    await row(page, 'Healing Word').click();
    const detail = panel(page);
    await expect(slot(detail, 1)).toBeDisabled();
    await expect(slot(detail, 2)).toHaveAttribute('aria-pressed', 'true');
    // Preserve an explicit higher-level choice when a lower slot becomes available.
    await slot(detail, 2).click();
    await adjustHudSlots(page, 'Restore', 1);
    await expect(slot(detail, 1)).toContainText('1 left');
    await expect(slot(detail, 2)).toHaveAttribute('aria-pressed', 'true');
    await expect(detail.getByRole('button', { name: 'Cast Healing Word (L2)' })).toBeEnabled();

    await adjustHudSlots(page, 'Use', 2, 2);
    await expect(slot(detail, 2)).toBeDisabled();
    await expect(slot(detail, 1)).toHaveAttribute('aria-pressed', 'true');
    await expect(detail.getByRole('button', { name: 'Cast Healing Word (L1)' })).toBeEnabled();
    await adjustHudSlots(page, 'Use', 1);
    await expect(slot(detail, 1)).toBeDisabled();
    await expect(detail.getByRole('button', { name: /^Cast Healing Word/ })).toBeDisabled();

    await detail.getByRole('button', { name: 'Close details', exact: true }).click();
    await navigation(page).getByRole('link', { name: 'Home', exact: true }).click();
    await adjustHudSlots(page, 'Restore', 1);
    await page.getByRole('button', { name: 'Open details', exact: true }).click();
    await expect(detail.getByRole('heading', { name: 'Healing Word', exact: true })).toBeVisible();
    await expect(slot(detail, 1)).toContainText('1 left');
    await expect(slot(detail, 1)).toHaveAttribute('aria-pressed', 'true');
    await expect(detail.getByRole('button', { name: 'Cast Healing Word (L1)' })).toBeEnabled();
    await expectNoOverflow(page);
  });
});

test.describe('mobile previews', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile touch and sheet focus');

  test('tap opens live metadata and both Close and Escape restore the opener', async ({
    page,
  }, info) => {
    await page.goto(spellPath);
    await expectSaved(page);
    const trigger = row(page, 'Dissonant Whispers');
    await trigger.tap();
    const sheet = page.getByRole('dialog', { name: 'Dissonant Whispers', exact: true });
    await expectWhispersMetadata(sheet);
    await expect(slot(sheet, 1)).toBeDisabled();
    await expect(slot(sheet, 2)).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.getByRole('button', { name: 'Cast Dissonant Whispers (L2)' })).toBeEnabled();
    await expectNoOverflow(page);
    await page.screenshot({
      path: info.outputPath('preview-sheet-375.png'),
      animations: 'disabled',
    });
    await sheet.getByRole('button', { name: 'Close', exact: true }).tap();
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(
      hud(page).getByRole('img', { name: 'L1: 0 of 4 left', exact: true }),
    ).toBeVisible();
    await expect(
      hud(page).getByRole('img', { name: 'L2: 2 of 2 left', exact: true }),
    ).toBeVisible();

    const slots = main(page).getByRole('group', { name: 'Level 1 spell slots', exact: true });
    await slots.evaluate((element) =>
      element.scrollIntoView({ block: 'center', behavior: 'instant' }),
    );
    const bounds = await slots.boundingBox();
    const navBounds = await navigation(page).boundingBox();
    expect(bounds).not.toBeNull();
    expect(navBounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(navBounds!.y);
    await page.screenshot({
      path: info.outputPath('preview-closed-slots-375.png'),
      animations: 'disabled',
    });
  });
});

test('imported attack and save spells use their own metadata and character casting values', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/');
  await expectSaved(page);
  const file = ExportFileSchema.parse(seed);
  file.build.id = 'preview-bard';
  file.build.name = 'Preview Bard';
  file.live.characterId = file.build.id;
  file.build.abilityScores.base.CHA = 12;
  file.build.spells = [{ classId: 'class.bard', known: ['spell.fire-bolt', 'spell.fireball'] }];
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: 'preview-bard.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(ExportFileSchema.parse(file))),
  });
  await page
    .getByRole('dialog', { name: 'Import character', exact: true })
    .getByRole('button', { name: 'Add character', exact: true })
    .click();
  await expectSaved(page);
  await page.goto('/characters/preview-bard/spells');
  await expect(hud(page)).toContainText('Preview Bard');
  await expect(main(page)).toContainText('Save DC 12');
  await expect(row(page, 'Fire Bolt')).toContainText('+4 spell attack');
  await expect(row(page, 'Fireball')).toContainText('DEX 12');

  const bolt = row(page, 'Fire Bolt');
  if (isMobile) await bolt.tap();
  else await bolt.click();
  const boltDetail = isMobile
    ? page.getByRole('dialog', { name: 'Fire Bolt', exact: true })
    : panel(page);
  await expect(boltDetail).toContainText('Cantrip Evocation');
  await expect(boltDetail).toContainText('120 ft');
  await expect(boltDetail).toContainText('Instant · V, S');
  await expect(boltDetail.getByText('Ranged spell attack +4', { exact: true })).toBeVisible();
  await expect(
    boltDetail.getByRole('button', { name: 'Cast Fire Bolt', exact: true }),
  ).toBeEnabled();
  await expect(boltDetail.getByRole('link', { name: /Full spell reference/ })).toHaveAttribute(
    'href',
    'https://www.dndbeyond.com/sources/dnd/basic-rules-2014',
  );
  await expectNoOverflow(page);
  await page.screenshot({
    path: info.outputPath('imported-attack-preview.png'),
    animations: 'disabled',
  });
  await boltDetail
    .getByRole('button', { name: isMobile ? 'Close' : 'Close details', exact: true })
    .click();
  await navigation(page).getByRole('link', { name: 'Home', exact: true }).click();
  if (!isMobile) {
    await page.getByRole('button', { name: 'Open details', exact: true }).click();
    await expect(panel(page).getByText('Ranged spell attack +4', { exact: true })).toBeVisible();
    await panel(page).getByRole('button', { name: 'Close details', exact: true }).click();
  }
  await navigation(page).getByRole('link', { name: 'Spells', exact: true }).click();
  if (isMobile) await row(page, 'Fireball').tap();
  else await row(page, 'Fireball').click();
  const fireballDetail = isMobile
    ? page.getByRole('dialog', { name: 'Fireball', exact: true })
    : panel(page);
  await expect(fireballDetail).toContainText('L3 Evocation');
  await expect(fireballDetail).toContainText('150 ft');
  await expect(fireballDetail).toContainText('DEX save DC 12');
  await expect(fireballDetail).toContainText('Instant · V, S, M');
  await expect(fireballDetail).toContainText('A tiny ball of bat guano and sulfur.');
  await expect(fireballDetail.getByText('Damage', { exact: true })).toBeVisible();
  await expect(fireballDetail.getByRole('button', { name: /^Cast Fireball/ })).toBeDisabled();
  await expectNoOverflow(page);
  await page.screenshot({
    path: info.outputPath('imported-save-preview.png'),
    animations: 'disabled',
  });
});

test('all nine slot levels keep touch targets for a level 20 bard', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/');
  await expectSaved(page);
  const file = ExportFileSchema.parse(seed);
  file.build.id = 'preview-bard-20';
  file.build.name = 'Preview Bard 20';
  file.build.classes[0]!.level = 20;
  file.build.hpEntries = Array.from({ length: 20 }, (_, index) => ({
    level: index + 1,
    classId: 'class.bard',
    value: index === 0 ? 8 : 4,
    method: index === 0 ? 'max' : 'rolled',
  }));
  file.live.characterId = file.build.id;
  file.live.slotsUsed = Array<number>(10).fill(0);
  file.events = [];
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: 'preview-bard-20.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(ExportFileSchema.parse(file))),
  });
  await page
    .getByRole('dialog', { name: 'Import character', exact: true })
    .getByRole('button', { name: 'Add character', exact: true })
    .click();
  await expectSaved(page);
  await page.goto('/characters/preview-bard-20/spells');
  const trigger = row(page, 'Dissonant Whispers');
  if (isMobile) await trigger.tap();
  else await trigger.click();
  const detail = isMobile
    ? page.getByRole('dialog', { name: 'Dissonant Whispers', exact: true })
    : panel(page);
  const choices = detail
    .getByRole('group', { name: 'Slot level', exact: true })
    .getByRole('button');
  await expect(choices).toHaveCount(9);
  const bounds = await choices.evaluateAll((buttons) =>
    buttons.map((button) => {
      const { width, height } = button.getBoundingClientRect();
      return { label: button.textContent, width, height };
    }),
  );
  await info.attach('slot-picker-bounds', {
    body: JSON.stringify(bounds, null, 2),
    contentType: 'application/json',
  });
  await page.screenshot({
    path: info.outputPath(`all-slot-levels-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });
  for (const choice of bounds) {
    expect(choice.width, `${choice.label} target width`).toBeGreaterThanOrEqual(44);
    expect(choice.height, `${choice.label} target height`).toBeGreaterThanOrEqual(44);
  }
  await expectNoOverflow(page);
});

test('tablet pinned detail stays live when reopened as a phone sheet', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one focused tablet-to-phone check');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(spellPath);
  await expectSaved(page);
  await row(page, 'Healing Word').click();
  const drawer = page.getByRole('dialog', { name: 'Details', exact: true });
  await expect(slot(drawer, 2)).toContainText('2 left');
  const bounds = await drawer.boundingBox();
  expect(bounds?.width).toBe(360);
  expect(bounds!.x + bounds!.width).toBe(768);
  await expectNoOverflow(page);
  await page.screenshot({
    path: info.outputPath('live-preview-drawer-768.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(row(page, 'Healing Word')).toBeFocused();

  await page.setViewportSize({ width: 375, height: 812 });
  await adjustHudSlots(page, 'Restore', 1);
  await page.getByRole('button', { name: 'Open details', exact: true }).click();
  await expect(drawer).toContainText('Healing Word');
  await expect(slot(drawer, 1)).toContainText('1 left');
  await expect(slot(drawer, 1)).toHaveAttribute('aria-pressed', 'true');
  await expect(drawer.getByRole('button', { name: 'Cast Healing Word (L1)' })).toBeEnabled();
  await expectNoOverflow(page);
  await page.screenshot({
    path: info.outputPath('live-pinned-preview-375.png'),
    animations: 'disabled',
  });
});
