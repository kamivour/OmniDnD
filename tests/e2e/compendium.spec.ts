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
  await tiers.getByRole('button', { name: 'Uncommon', exact: true }).click();
  await expect(page).toHaveURL(/tier=uncommon/);
  await expect(page.getByRole('region', { name: 'Mundane', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Uncommon', exact: true })).toBeVisible();
  await types.getByRole('button', { name: 'Wondrous items', exact: true }).click();
  await page.getByRole('button', { name: /^Bag of Holding/ }).click();
  const panel = entryPanel(page, isMobile);
  await expect(panel.getByText('Wondrous item', { exact: true })).toBeVisible();
  await expect(panel.getByText('Uncommon', { exact: true })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath(`items-dark-${isMobile ? 375 : 1440}.png`) });

  // Weapons: damage and properties come from the data.
  await page.goto('/compendium?kind=equipment&type=weapon&entry=item.longsword');
  await expect(
    entryPanel(page, isMobile).getByText('1d8 slashing (1d10 two-handed)'),
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
