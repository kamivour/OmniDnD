import { expect, test, type Page } from './fixtures';

const ID = 'the-fool';

const main = (page: Page) => page.getByRole('main');
const undo = (page: Page) => page.getByRole('button', { name: 'Undo last command', exact: true });
const tracker = (page: Page) => main(page).getByRole('region', { name: 'Encounter tracker' });

async function saved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

async function noOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(0);
}

async function openLink(page: Page, name: string, path: string) {
  const direct = page.getByRole('link', { name, exact: true });
  if (await direct.first().isVisible()) {
    await direct.first().click();
  } else if (page.viewportSize()!.width < 640) {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'More', exact: true })
      .getByRole('link', { name, exact: true })
      .click();
  } else {
    await page.getByRole('link', { name, exact: true }).click();
  }
  await expect(page).toHaveURL(`/characters/${ID}/${path}`);
  await saved(page);
}

async function roll(page: Page, name: string, value: string) {
  const input = tracker(page).getByRole('textbox', { name: new RegExp(`d20 roll for ${name} `) });
  await input.fill(value);
  await input.press('Enter');
  await saved(page);
}

/** Next turn may ask for confirmation when something is unusual; confirm it. */
async function next(page: Page) {
  await tracker(page)
    .getByRole('button', { name: /Next turn|Start first turn/ })
    .click();
  const warn = page.getByRole('alertdialog');
  if (await warn.isVisible().catch(() => false))
    await warn.getByRole('button', { name: /Continue|Apply|Do it|Confirm/i }).click();
  await saved(page);
}

test('encounter tracker: a three-round fight, undo, reload', async ({ page, isMobile }, info) => {
  await page.goto(`/characters/${ID}`);
  await saved(page);

  await openLink(page, 'Companions', 'companions');
  await main(page).getByRole('button', { name: 'Add companion', exact: true }).click();
  const add = page.getByRole('dialog', { name: 'Add companion', exact: true });
  await add.getByLabel('Template', { exact: true }).selectOption('Riding horse');
  await add.getByRole('button', { name: 'Add companion', exact: true }).click();
  await expect(add).toBeHidden();
  await saved(page);

  await openLink(page, 'Combat', 'combat');
  await main(page).getByRole('button', { name: 'Start combat', exact: true }).click();
  await saved(page);
  await tracker(page).getByRole('button', { name: 'Start tracker', exact: true }).click();
  await saved(page);
  await expect(tracker(page)).toContainText('The Fool');
  await expect(tracker(page)).toContainText('Riding horse');

  await tracker(page).getByRole('button', { name: 'Add combatant', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Add combatant', exact: true });
  await sheet.getByLabel('Search creatures', { exact: true }).fill('goblin');
  await sheet.getByLabel('How many', { exact: true }).fill('3');
  await sheet.getByRole('button', { name: 'Add Goblin', exact: true }).click();
  await expect(sheet).toBeHidden();
  await saved(page);
  for (const n of [1, 2, 3]) await expect(tracker(page)).toContainText(`Goblin ${n}`);

  await roll(page, 'The Fool', '14');
  await roll(page, 'Riding horse', '8');
  await roll(page, 'Goblin 1', '12');
  await roll(page, 'Goblin 2', '10');
  await roll(page, 'Goblin 3', '5');

  await next(page);
  await expect(tracker(page)).toContainText("The Fool's turn");

  // Hit a goblin to 0: warning shows, defeated stays manual.
  await tracker(page).getByRole('button', { name: 'Show Goblin 1 details', exact: true }).click();
  await tracker(page).getByLabel('Amount', { exact: true }).fill('7');
  await tracker(page).getByRole('button', { name: 'Damage Goblin 1', exact: true }).click();
  await saved(page);
  await expect(tracker(page)).toContainText('Goblin 1 is at 0 HP');
  await tracker(page).getByRole('button', { name: 'Mark defeated Goblin 1', exact: true }).click();
  await saved(page);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`tracker-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });

  // Defeated Goblin 1 is skipped: d20 plus bonus puts round 1 at Fool, Goblin 2, horse, Goblin 3.
  for (const who of ['Goblin 2', 'Riding horse', 'Goblin 3']) {
    await next(page);
    await expect(tracker(page)).toContainText(`${who}'s turn`);
  }
  await next(page);
  await expect(tracker(page)).toContainText('Round 2');
  await expect(tracker(page)).toContainText("The Fool's turn");

  for (let i = 0; i < 3; i += 1) await next(page);
  await next(page);
  await expect(tracker(page)).toContainText('Round 3');

  await undo(page).click();
  await saved(page);
  await expect(tracker(page)).toContainText('Round 2');

  await page.reload();
  await saved(page);
  await expect(tracker(page)).toContainText('Round 2');
  await expect(tracker(page)).toContainText('Goblin 3');
  await noOverflow(page);
});
