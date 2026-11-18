import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import { ExportFileSchema } from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

const ID = 'versatile-fool';
const main = (page: Page) => page.getByRole('main');

async function saved(page: Page) {
  await expect(page.locator('[role="status"][aria-label="Save status"]')).toContainText(
    'Saved on this device',
  );
}

/** The Fool before picking the two Skill Versatility skills. */
function unpicked() {
  const file = ExportFileSchema.parse(seed);
  file.build.id = ID;
  file.build.name = 'Versatile Fool';
  delete file.build.proficiencyPicks?.['feature.skill-versatility'];
  file.live.characterId = ID;
  file.events = [];
  return file;
}

test('Skill Versatility: pick two skills in To do and see them on the sheet', async ({ page }) => {
  await page.goto('/settings');
  await saved(page);
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: `${ID}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(unpicked())),
  });
  await page
    .getByRole('dialog', { name: 'Import character', exact: true })
    .getByRole('button', { name: 'Add character', exact: true })
    .click();
  await saved(page);

  await page.goto(`/characters/${ID}/todo`);
  const item = main(page)
    .getByRole('listitem')
    .filter({ hasText: 'Skill Versatility: choose proficiencies' });
  await item.getByRole('button', { name: 'Choose', exact: true }).click();
  await item.getByRole('checkbox', { name: 'Athletics', exact: true }).check();
  const save = item.getByRole('button', { name: 'Save choice', exact: true });
  await expect(save).toBeDisabled();
  await item.getByRole('checkbox', { name: 'History', exact: true }).check();
  await expect(item.getByRole('checkbox', { name: 'Nature', exact: true })).toBeDisabled();
  await save.click();
  await saved(page);
  await expect(item).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);

  await page.goto(`/characters/${ID}`);
  await saved(page);
  await expect(main(page).getByText('Athletics', { exact: false }).first()).toBeVisible();
});
