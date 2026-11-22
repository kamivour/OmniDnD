import { expect, test, type Page } from './fixtures';

const ID = 'the-fool';

const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);

async function noOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(0);
}

/** The open entry: a side panel on desktop, a sheet on phones. */
function entryPanel(page: Page, isMobile: boolean) {
  return isMobile
    ? page.getByRole('dialog')
    : page.getByRole('complementary', { name: 'Compendium entry', exact: true });
}

async function saved(page: Page) {
  await expect(page.getByRole('status', { name: 'Save status', exact: true })).toContainText(
    'Saved on this device',
  );
}

test('compendium: equipment by tier and type, details, both themes', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/compendium?kind=equipment');
  await expect(page.getByRole('heading', { name: 'Compendium', exact: true })).toBeVisible();
  const tiers = page.getByRole('group', { name: 'Tier', exact: true });
  const types = page.getByRole('group', { name: 'Type', exact: true });

  // Items group under rarity headers; tier and type chips narrow the list.
  await expect(page.getByRole('region', { name: 'Mundane', exact: true })).toBeVisible();
  const colors = await tiers
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((button) => getComputedStyle(button).color));
  expect(new Set(colors).size).toBe(7);
  await tiers.getByRole('button', { name: 'Uncommon', exact: true }).click();
  await expect(page).toHaveURL(/tier=uncommon/);
  await expect(tiers.getByRole('button', { name: 'Uncommon', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('region', { name: 'Mundane', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Uncommon', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await types.getByRole('button', { name: 'Wondrous items', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove filter Wondrous items' })).toBeVisible();
  await page.getByRole('button', { name: /^Bag of Holding/ }).click();
  const panel = entryPanel(page, isMobile);
  await expect(panel.getByText('Wondrous item', { exact: true })).toBeVisible();
  await expect(panel.getByText('Uncommon', { exact: true })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath(`items-dark-${isMobile ? 375 : 1440}.png`) });

  // Weapons: damage and properties come from the data.
  await page.goto('/compendium?kind=equipment&type=weapon&entry=item.longsword');
  await expect(entryPanel(page, isMobile).getByText('1d8 (1d10 two-handed)')).toBeVisible();
  await expect(entryPanel(page, isMobile).getByText('Slashing', { exact: true })).toBeVisible();
  await expect(
    entryPanel(page, isMobile).locator('img[src="/compendium/longsword.png"]'),
  ).toBeVisible();

  // Parchment theme renders the same screen.
  await page.goto(`/characters/${ID}/settings`);
  await page.getByRole('radio', { name: /^Parchment/ }).check();
  await expect.poll(() => theme(page)).toBe('parchment');
  await page.goto('/compendium?kind=spells&level=3&entry=spell.fireball');
  await expect.poll(() => theme(page)).toBe('parchment');
  await expect(entryPanel(page, isMobile).getByText('150 ft', { exact: false })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath(`spell-parchment-${isMobile ? 375 : 1440}.png`) });
});

test('compendium links 2014 magic weapons to their bases and explains properties on pointer and touch', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/compendium?kind=equipment&tier=uncommon&q=Trident');
  const row = page.getByRole('button', { name: /^Trident of Fish Command/ });
  await row.scrollIntoViewIfNeeded();
  const originalScroll = await page.evaluate(() => window.scrollY);
  await row.click();
  const panel = entryPanel(page, isMobile);
  await expect(panel.getByText('Damage Type', { exact: true })).toBeVisible();
  await expect(panel.getByText('Piercing', { exact: true })).toBeVisible();
  await expect(panel.getByText('20/60 ft', { exact: true })).toBeVisible();
  await expect(panel.getByText('1d6 (1d8 two-handed)', { exact: true })).toBeVisible();
  await expect(panel.locator('[data-icon="catalog.trident"] svg')).toHaveCount(1);
  const thrown = panel.getByRole('button', { name: 'Thrown', exact: true });
  if (isMobile) {
    await thrown.tap();
    await expect(panel.getByRole('status')).toContainText('same ability modifier');
    await panel.getByRole('button', { name: 'Versatile', exact: true }).tap();
    await expect(panel.getByRole('status')).toContainText('two-handed damage die');
  } else {
    await thrown.hover();
    await expect(page.getByRole('tooltip')).toContainText('same ability modifier');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toBeHidden();
    const versatile = panel.getByRole('button', { name: 'Versatile', exact: true });
    await versatile.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tooltip')).toContainText('two-handed damage die');
    await page.keyboard.press('Escape');
  }
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath(`trident-${isMobile ? 375 : 1440}.png`) });
  await panel
    .getByRole('button', { name: isMobile ? 'Close' : 'Close entry', exact: true })
    .click();
  await expect(row).toBeFocused();
  await expect(page).not.toHaveURL(/entry=/);
  await expect(page).toHaveURL(/tier=uncommon/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(originalScroll);

  await page.goto('/compendium?kind=equipment&q=warhammer');
  await expect(page.getByRole('button', { name: /^Dwarven Thrower/ })).toBeVisible();
  await page.goto('/compendium?kind=equipment&entry=item.flame-tongue');
  await expect(panel.getByText('Any sword', { exact: true })).toBeVisible();
  await panel.getByRole('combobox', { name: 'Preview a base item' }).selectOption('item.longsword');
  await expect(panel.getByText('1d8 (1d10 two-handed)', { exact: true })).toBeVisible();
  await expect(panel.getByText('Slashing', { exact: true })).toBeVisible();
});

test('compendium character book scope and tier colors work in Tidewater', async ({
  page,
  isMobile,
}) => {
  await page.goto(`/characters/${ID}/settings`);
  await page.getByRole('radio', { name: /^Tidewater/ }).check();
  await page.goto(`/characters/${ID}/compendium?kind=equipment&q=Trident+of+Fish+Command`);
  const result = page.getByRole('button', { name: /^Trident of Fish Command/ });
  await expect(result).toHaveCount(0);
  await expect(page.getByText('Nothing matches. Try fewer filters.')).toBeVisible();
  const showAll = page.getByRole('checkbox', { name: /Show all books/ });
  await showAll.click();
  await expect(showAll).toBeChecked();
  await expect(result).toBeVisible();
  await expect(page).toHaveURL(/books=all/);
  await expect.poll(() => theme(page)).toBe('tidewater');
  const tiers = page.getByRole('group', { name: 'Tier', exact: true });
  const colors = await tiers
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((button) => getComputedStyle(button).color));
  expect(new Set(colors).size).toBe(7);
  await noOverflow(page);
  if (!isMobile) {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.getByRole('button', { name: 'Open details', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Pinned detail' })).toBeVisible();
    await result.click();
    const sheet = page.getByRole('dialog', { name: 'Trident of Fish Command' });
    await expect(sheet.getByText('Piercing', { exact: true })).toBeVisible();
    await noOverflow(page);
  }
});

test('compendium shows a meaningful icon when a local illustration cannot load', async ({
  page,
  isMobile,
}) => {
  await page.route('**/compendium/longsword.png', (route) => route.abort());
  await page.goto('/compendium?kind=equipment&q=longsword&entry=item.longsword');
  const panel = entryPanel(page, isMobile);
  await expect(panel.locator('[data-icon="catalog.sword"] svg')).toBeVisible();
  await page.goto('/compendium?kind=feats&q=sharpshooter&entry=feature.feat.sharpshooter');
  await expect(panel.locator('[data-icon="catalog.target"] svg')).toBeVisible();
});

test('compendium lists all three Amulets of the Devout with Tasha’s details', async ({
  page,
  isMobile,
}) => {
  await page.goto('/compendium?kind=equipment&q=amulet+of+devout');
  await expect(page.getByRole('button', { name: /^Amulet of the Devout/ })).toHaveCount(3);
  await page
    .getByRole('group', { name: 'Tier', exact: true })
    .getByRole('button', { name: 'Rare', exact: true })
    .click();
  await expect(page.getByRole('button', { name: /^Amulet of the Devout/ })).toHaveCount(1);
  await page.getByRole('button', { name: /^Amulet of the Devout, \+2/ }).click();
  const panel = entryPanel(page, isMobile);
  await expect(panel.getByText('Attunement required · Cleric or Paladin')).toBeVisible();
  await expect(panel.getByText(/add \+2 to spell attacks/)).toBeVisible();
  await expect(panel.getByText('At dawn', { exact: true })).toBeVisible();
});

test('compendium lists Xanathar’s wands and the 2014 stats for Tasha’s Moon Sickle', async ({
  page,
  isMobile,
}) => {
  await page.goto('/compendium?kind=equipment&book=XGE&type=wand');
  await expect(page.getByRole('button', { name: /^Wand of / })).toHaveCount(4);
  await page.getByRole('button', { name: /^Wand of Smiles/ }).click();
  const panel = entryPanel(page, isMobile);
  await expect(panel.getByText('Wand', { exact: true })).toBeVisible();
  await expect(panel.getByText('Common', { exact: true })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Book entry' })).toHaveAttribute(
    'href',
    /magic-items\/.*wand-of-smiles/,
  );
  await page.goto('/compendium?kind=equipment&book=TCE&type=weapon&tier=rare&q=moon+sickle');
  await expect(page.getByRole('button', { name: /^Moon Sickle/ })).toHaveCount(1);
  await page.getByRole('button', { name: /^Moon Sickle, \+2/ }).click();
  await expect(panel.getByText('Attunement required · Druid or Ranger')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Light', exact: true })).toBeVisible();
  await expect(panel.getByText('Slashing', { exact: true })).toBeVisible();
  await expect(panel.getByText('+2 to attack and damage rolls', { exact: true })).toBeVisible();
  await noOverflow(page);
});

test('compendium: Plan this adds to the Journal plans and Undo removes it', async ({
  page,
  isMobile,
}) => {
  await page.goto(`/characters/${ID}/compendium?kind=feats&entry=feature.feat.grappler`);
  await saved(page);
  const panel = entryPanel(page, isMobile);
  await expect(panel.getByText('Prerequisite', { exact: true })).toBeVisible();
  // A phone sheet hides the save status from assistive tech, so wait on the button instead.
  await panel.getByRole('button', { name: 'Plan this', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Planned', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await panel.getByRole('link', { name: 'See plans in Journal', exact: true }).click();
  await expect(page).toHaveURL(`/characters/${ID}/journal?tab=plans`);
  const plans = page.getByRole('region', { name: 'Plans', exact: true });
  await expect(plans.getByRole('link', { name: 'Grappler', exact: true })).toBeVisible();
  await noOverflow(page);

  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await saved(page);
  await expect(plans.getByText('No plans yet.')).toBeVisible();

  // The standalone compendium has no character to plan for.
  await page.goto('/compendium?kind=feats&entry=feature.feat.grappler');
  await expect(entryPanel(page, isMobile).getByText('Prerequisite', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Plan this' })).toHaveCount(0);
});
