import { expect, test, type Page } from './fixtures';

const ID = 'the-fool';

const main = (page: Page) => page.getByRole('main');
const undo = (page: Page) => page.getByRole('button', { name: 'Undo last command', exact: true });

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

async function openCompanions(page: Page) {
  if (page.viewportSize()!.width < 640) {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'More', exact: true })
      .getByRole('link', { name: 'Companions', exact: true })
      .click();
  } else {
    await page.getByRole('link', { name: 'Companions', exact: true }).click();
  }
  await expect(page).toHaveURL(`/characters/${ID}/companions`);
  await saved(page);
}

test('companions: add from template, damage, heal, condition, undo, reload', async ({
  page,
  isMobile,
}, info) => {
  await page.goto(`/characters/${ID}`);
  await saved(page);
  await openCompanions(page);
  await expect(main(page).getByText('No companions yet.', { exact: false })).toBeVisible();

  await main(page).getByRole('button', { name: 'Add companion', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Add companion', exact: true });
  await sheet.getByLabel('Template', { exact: true }).selectOption('Riding horse');
  await expect(sheet.getByLabel('Max HP', { exact: true })).toHaveValue('13');
  await sheet.getByRole('button', { name: 'Add companion', exact: true }).click();
  await expect(sheet).toBeHidden();
  await saved(page);

  const card = main(page).getByRole('region', { name: 'Companion: Riding horse', exact: true });
  await expect(card).toContainText('AC 10');
  await expect(card).toContainText('13/13');
  await expect(card).toContainText('Hooves +5');

  await card.getByLabel('Amount', { exact: true }).fill('5');
  await card.getByRole('button', { name: 'Damage Riding horse', exact: true }).click();
  await saved(page);
  await expect(card).toContainText('8/13');

  await card.getByRole('button', { name: 'Edit Riding horse', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit Riding horse', exact: true });
  await editor.getByRole('button', { name: 'Add attack', exact: true }).click();
  await editor.getByLabel('Attack name', { exact: true }).last().fill('Kick');
  await editor.getByLabel('To hit', { exact: true }).last().fill('4x');
  await editor.getByLabel('Notes', { exact: true }).fill('Answers to Clover.');
  await editor.getByRole('button', { name: 'Save companion', exact: true }).click();
  await expect(editor.getByRole('alert')).toHaveText('Kick: attack bonus must be a whole number.');
  await page.screenshot({
    path: info.outputPath(`companion-editor-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  await editor.getByLabel('To hit', { exact: true }).last().fill('4');
  await editor.getByRole('button', { name: 'Save companion', exact: true }).click();
  await expect(editor).toBeHidden();
  await saved(page);
  await expect(card).toContainText('Kick +4');
  await expect(card).toContainText('Answers to Clover.');
  await expect(card).toContainText('8/13');

  await card.getByLabel('Add or clear condition', { exact: true }).selectOption('frightened');
  await saved(page);
  await expect(
    card.getByRole('button', { name: 'Clear frightened (Riding horse)', exact: true }),
  ).toBeVisible();

  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`companions-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });

  await undo(page).click();
  await saved(page);
  await expect(
    card.getByRole('button', { name: 'Clear frightened (Riding horse)', exact: true }),
  ).toBeHidden();

  await page.reload();
  await saved(page);
  await expect(
    main(page).getByRole('region', { name: 'Companion: Riding horse', exact: true }),
  ).toContainText('8/13');
});
