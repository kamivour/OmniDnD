import type { Locator } from '@playwright/test';
import { expect, test, type Page } from './fixtures';

async function saved(page: Page) {
  await expect(page.locator('[role="status"][aria-label="Local save status"]')).toContainText(
    'Saved locally',
  );
}

/** Measure rendered token colors, including translucent ancestor backgrounds. */
async function readable(control: Locator) {
  const result = await control.evaluate((element) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    const rgba = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    };
    const ancestors: Element[] = [];
    for (let node: Element | null = element; node; node = node.parentElement)
      ancestors.unshift(node);
    let background = [255, 255, 255];
    let opacity = 1;
    for (const node of ancestors) {
      const style = getComputedStyle(node);
      opacity *= Number(style.opacity);
      const color = rgba(style.backgroundColor);
      const alpha = color[3]! / 255;
      background = background.map((value, i) => color[i]! * alpha + value * (1 - alpha));
    }
    const foreground = rgba(getComputedStyle(element).color);
    const ink = background.map(
      (value, i) => (foreground[i]! * foreground[3]!) / 255 + value * (1 - foreground[3]! / 255),
    );
    // WCAG relative luminance: https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
    const luminance = (rgb: number[]) =>
      rgb
        .map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
    const a = luminance(ink);
    const b = luminance(background);
    return { contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), opacity };
  });
  expect(result.opacity, 'enabled labels and focus rings remain opaque').toBe(1);
  expect(result.contrast, 'normal text meets the project 4.5:1 target').toBeGreaterThanOrEqual(4.5);
}

async function keyboardRing(page: Page, control: Locator) {
  await control.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(control).toBeFocused();
  await ring(control);
}

async function ring(control: Locator) {
  const outline = await control.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      visible: element.matches(':focus-visible'),
      style: style.outlineStyle,
      width: parseFloat(style.outlineWidth),
    };
  });
  expect(outline).toMatchObject({ visible: true, style: 'solid' });
  expect(outline.width).toBeGreaterThanOrEqual(2);
}

test('shared inputs and spell search retain keyboard rings and Damage stays readable', async ({
  page,
}) => {
  await page.goto('/campaigns/new');
  await saved(page);
  await keyboardRing(page, page.getByRole('textbox', { name: 'Name', exact: true }));
  await page.goto('/characters/the-fool/spells');
  await saved(page);
  await keyboardRing(page, page.getByRole('searchbox', { name: 'Search spells', exact: true }));
  await page.goto('/characters/the-fool/combat');
  await saved(page);
  await readable(page.getByRole('main').getByRole('button', { name: 'Damage', exact: true }));
  const quickDamage = page.getByRole('button', { name: 'Take 1 damage', exact: true });
  if (await quickDamage.isVisible()) await readable(quickDamage);
  await page
    .getByRole('banner', { name: 'Character HUD', exact: true })
    .getByRole('button', { name: 'Adjust hit points', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Hit points', exact: true });
  const damage = dialog.getByRole('tab', { name: 'Damage', exact: true });
  await damage.click();
  await readable(damage);
  // Tabs use roving arrow navigation rather than an ordinary input's Tab sequence.
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('tab', { name: 'Heal', exact: true })).toBeFocused();
  await expect(dialog.getByRole('tab', { name: 'Heal', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('ArrowLeft');
  await expect(damage).toBeFocused();
  await expect(damage).toHaveAttribute('aria-selected', 'true');
  await ring(damage);
  await page.screenshot({
    path: test.info().outputPath('damage-keyboard-focus.png'),
    animations: 'disabled',
  });
});

test('used economy, standard actions and unavailable spells stay legible and reachable', async ({
  page,
}) => {
  await page.goto('/characters/the-fool/combat');
  await saved(page);
  const main = page.getByRole('main');
  await main.getByRole('button', { name: 'Start combat', exact: true }).click();
  await saved(page);
  await main.getByRole('button', { name: 'Start Turn', exact: true }).click();
  await saved(page);
  const economy = main.getByRole('region', { name: 'Turn economy', exact: true });
  await economy.getByRole('button', { name: 'Action available', exact: true }).click();
  await saved(page);
  const used = economy.getByRole('button', { name: 'Action used', exact: true });
  await expect(used).toBeEnabled();
  await expect(used.getByText('used', { exact: true })).toBeVisible();
  await readable(used);
  await readable(used.getByText('used', { exact: true }));
  await keyboardRing(page, used);
  const dash = main.getByRole('button', { name: 'Dash (Action used)', exact: true });
  await expect(dash).toBeEnabled();
  await expect(dash.getByText('(Action used)', { exact: true })).toBeVisible();
  await readable(dash);
  await readable(dash.getByText('(Action used)', { exact: true }));

  await main.getByRole('tab', { name: 'Spells', exact: true }).click();
  await main.getByRole('checkbox', { name: 'Show all spells', exact: true }).check();
  const row = (name: string) =>
    main
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name: new RegExp(`^${name}\\b`) }) });
  const mockery = row('Vicious Mockery').getByRole('button', { name: /^Cast\b/ });
  await expect(mockery).toBeEnabled();
  await readable(mockery);
  await readable(mockery.getByText('Action used', { exact: true }));

  await page
    .getByRole('banner', { name: 'Character HUD', exact: true })
    .getByRole('button', { name: 'Adjust spell slots', exact: true })
    .click();
  const slots = page.getByRole('dialog', { name: 'Spell slots', exact: true });
  for (let index = 0; index < 2; index++) {
    await slots.getByRole('button', { name: 'Use one: Level 2 spell slots', exact: true }).click();
    await saved(page);
  }
  await slots.getByRole('button', { name: 'Close', exact: true }).click();
  const unavailable = row('Dissonant Whispers').getByRole('button', { name: /^Cast\b/ });
  await expect(unavailable).toBeEnabled();
  await expect(unavailable.getByText('Unavailable', { exact: true })).toBeVisible();
  await readable(unavailable);
  await readable(unavailable.getByText('Unavailable', { exact: true }));
  await keyboardRing(page, unavailable);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
  await page.screenshot({
    path: test.info().outputPath('used-and-unavailable.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Enter');
  const cast = page.getByRole('dialog', { name: 'Cast Dissonant Whispers', exact: true });
  await expect(cast).toContainText('No available spell slots at this level or higher.');
  await expect(
    cast.getByRole('button', { name: 'Cast Dissonant Whispers (L1)', exact: true }),
  ).toBeDisabled();
});
