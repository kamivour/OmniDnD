import type { CharacterBuild, LiveState, LogEvent } from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

interface SavedCharacter {
  build: CharacterBuild;
  live: LiveState;
  events: LogEvent[];
}

async function saved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

// Inspect the application's seeded records without injecting or changing state.
async function readSaved(page: Page): Promise<SavedCharacter> {
  return page.evaluate(async () => {
    const value = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await value(indexedDB.open('omnidnd'));
    try {
      const transaction = db.transaction(['builds', 'live', 'events'], 'readonly');
      const [build, live, events] = await Promise.all([
        value(transaction.objectStore('builds').get('the-fool')) as Promise<{
          data: CharacterBuild;
        }>,
        value(transaction.objectStore('live').get('the-fool')) as Promise<{ data: LiveState }>,
        value(transaction.objectStore('events').getAll()) as Promise<
          { characterId: string; order: number; data: LogEvent }[]
        >,
      ]);
      return {
        build: build.data,
        live: live.data,
        events: events
          .filter((event) => event.characterId === 'the-fool')
          .sort((left, right) => left.order - right.order)
          .map(({ data }) => data),
      };
    } finally {
      db.close();
    }
  });
}

for (const source of ['HUD', 'Combat'] as const) {
  test(`${source} HP keypad respects native keyboard activation and commits only Apply`, async ({
    page,
  }) => {
    await page.goto('/characters/the-fool/combat');
    await saved(page);
    const initial = await readSaved(page);
    expect(initial.events).toEqual([]);
    const opener =
      source === 'HUD'
        ? page
            .getByRole('banner', { name: 'Character HUD', exact: true })
            .getByRole('button', { name: 'Adjust hit points', exact: true })
        : page.getByRole('main').getByRole('button', { name: 'Damage', exact: true });
    await opener.press('Enter');
    const dialog = page.getByRole('dialog', {
      name: source === 'HUD' ? 'Hit points' : 'Damage',
      exact: true,
    });
    const button = (name: string) => dialog.getByRole('button', { name, exact: true });
    const amount = dialog.getByLabel('Damage amount', { exact: true });
    const apply = button('Apply');
    await expect(apply).toBeDisabled();

    await button('1').press('Enter');
    await expect(amount).toHaveText('1');
    await button('2').press('Enter');
    await expect(amount).toHaveText('12');
    await button('3').press('Space');
    await expect(amount).toHaveText('123');
    await button('Delete digit').press('Enter');
    await expect(amount).toHaveText('12');
    await button('Delete digit').press('Space');
    await expect(amount).toHaveText('1');
    await button('+5').press('Enter');
    await expect(amount).toHaveText('6');
    await button('+5').press('Space');
    await expect(amount).toHaveText('11');
    expect(await readSaved(page)).toEqual(initial);

    // Physical entry still works while a keypad button owns focus; zero cannot submit.
    await apply.focus();
    await page.keyboard.press('Backspace');
    await expect(amount).toHaveText('1');
    await page.keyboard.press('Backspace');
    await expect(amount).toHaveText('0');
    await expect(apply).toBeDisabled();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await expect(amount).toHaveText('0');
    expect(await readSaved(page)).toEqual(initial);
    await button('2').press('3');
    await expect(amount).toHaveText('3');
    await button('2').press('Backspace');
    await expect(amount).toHaveText('0');
    await button('2').press('Enter');
    await expect(amount).toHaveText('2');
    expect(await readSaved(page)).toEqual(initial);

    await apply.press('Enter');
    await expect(dialog).toBeHidden();
    await saved(page);
    const damaged = await readSaved(page);
    expect(damaged.build).toEqual(initial.build);
    expect(damaged.live).toEqual({ ...initial.live, hp: initial.live.hp - 2 });
    expect(damaged.events.map((event) => event.command)).toEqual(['applyDamage']);
    await expect(opener).toBeFocused();

    await page
      .getByRole('region', { name: 'Character log', exact: true })
      .getByRole('button', { name: 'Undo last command', exact: true })
      .press('Enter');
    await saved(page);
    const restored = await readSaved(page);
    expect(restored.build).toEqual(initial.build);
    expect(restored.live).toEqual(initial.live);
    expect(restored.events.map((event) => event.command)).toEqual(['applyDamage', 'undo']);
    expect(restored.events[0]?.undoneBy).toBe(restored.events[1]?.id);
  });
}
