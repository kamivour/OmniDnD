import { expect, test, type Page } from './fixtures';

const main = (page: Page) => page.getByRole('main');
const card = (page: Page, name: string) => main(page).getByRole('article', { name, exact: true });
const undo = (page: Page) => page.getByRole('button', { name: 'Undo last command', exact: true });

async function saved(page: Page) {
  await expect(page.locator('[role="status"][aria-label="Local save status"]')).toContainText(
    'Saved locally',
  );
}

async function left(page: Page) {
  const text = await card(page, 'Bardic Inspiration').innerText();
  return Number(/(\d+) of \d+ left/.exec(text)?.[1]);
}

test('groups features, uses and corrects a pool, favorites and undoes', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/characters/the-fool/features');
  await saved(page);
  for (const group of ['Race', 'Class', 'Subclass', 'Background'])
    await expect(
      main(page).getByRole('heading', { level: 2, name: group, exact: true }),
    ).toBeVisible();
  await expect(card(page, 'Jack of All Trades')).toContainText('Already counted on your sheet.');
  await expect(card(page, 'Cutting Words')).toContainText('Spends Bardic Inspiration');

  const before = await left(page);
  expect(before).toBeGreaterThan(0);
  await card(page, 'Bardic Inspiration')
    .getByRole('button', { name: 'Use Bardic Inspiration', exact: true })
    .click();
  await saved(page);
  expect(await left(page)).toBe(before - 1);
  await undo(page).click();
  await saved(page);
  expect(await left(page)).toBe(before);

  await card(page, 'Bardic Inspiration')
    .getByRole('button', { name: 'Use one: Bardic Inspiration', exact: true })
    .click();
  await saved(page);
  expect(await left(page)).toBe(before - 1);
  await card(page, 'Bardic Inspiration')
    .getByRole('button', { name: 'Restore one: Bardic Inspiration', exact: true })
    .click();
  await saved(page);
  expect(await left(page)).toBe(before);

  const star = card(page, 'Cutting Words').getByRole('button', {
    name: 'Favorite Cutting Words',
    exact: true,
  });
  const wasFavorite = (await star.getAttribute('aria-pressed')) === 'true';
  if (wasFavorite) {
    await star.click();
    await saved(page);
  }
  await star.click();
  await saved(page);
  await expect(star).toHaveAttribute('aria-pressed', 'true');

  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
  await page.screenshot({
    path: info.outputPath(`features-${isMobile ? 375 : 1440}.png`),
    fullPage: true,
    animations: 'disabled',
  });

  await page.reload();
  await saved(page);
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/characters/the-fool');
  await saved(page);
  await expect(main(page)).toContainText('Cutting Words');
});
