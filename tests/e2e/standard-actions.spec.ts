import type { CharacterBuild, LiveState, LogEvent } from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

interface Snapshot {
  build: CharacterBuild;
  live: LiveState;
  events: LogEvent[];
}

async function saved(page: Page) {
  await expect(page.locator('[role="status"][aria-label="Local save status"]')).toContainText(
    'Saved locally',
  );
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(async () => {
    const read = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await read(indexedDB.open('omnidnd'));
    try {
      const transaction = db.transaction(['builds', 'live', 'events'], 'readonly');
      const [build, live, events] = await Promise.all([
        read(transaction.objectStore('builds').get('the-fool')) as Promise<{
          data: CharacterBuild;
        }>,
        read(transaction.objectStore('live').get('the-fool')) as Promise<{ data: LiveState }>,
        read(transaction.objectStore('events').getAll()) as Promise<
          { characterId: string; order: number; data: LogEvent }[]
        >,
      ]);
      return {
        build: build.data,
        live: live.data,
        events: events
          .filter(({ characterId }) => characterId === 'the-fool')
          .sort((a, b) => a.order - b.order)
          .map(({ data }) => data),
      };
    } finally {
      db.close();
    }
  });
}

test('every standard action reaches a real logged command and preserves manual outcomes', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(60_000);
  await page.goto('/characters/the-fool/combat');
  await saved(page);
  const main = page.getByRole('main');
  await main.getByRole('button', { name: 'Start combat', exact: true }).click();
  await saved(page);
  await main.getByRole('button', { name: 'Start Turn', exact: true }).click();
  await saved(page);
  const initial = await snapshot(page);
  const controls = main
    .getByRole('heading', { name: 'Standard actions', exact: true })
    .locator('xpath=following-sibling::ul[1]');
  for (const name of [
    'Attack',
    'Dash',
    'Disengage',
    'Dodge',
    'Help',
    'Hide',
    'Ready',
    'Search',
    'Use an Object',
    'Grapple',
    'Shove',
  ]) {
    await test.step(name, async () => {
      const before = await snapshot(page);
      await controls.getByRole('button', { name, exact: true }).click();
      const detail = isMobile
        ? page.getByRole('dialog', { name, exact: true })
        : page.getByRole('complementary', { name: 'Pinned detail', exact: true });
      const take = detail.getByRole('button', { name: `Take ${name}`, exact: true });
      await expect(take).toBeEnabled();
      expect(await snapshot(page)).toEqual(before);
      await take.click();
      if (isMobile) await expect(detail).toBeHidden();
      await saved(page);
      const applied = await snapshot(page);
      const expected = structuredClone(initial.live);
      expected.combat!.economy.actionUsed = true;
      if (name === 'Dash') expected.combat!.economy.dashCount = 1;
      expect(applied.build).toEqual(initial.build);
      expect(applied.live).toEqual(expected);
      expect(applied.events).toHaveLength(before.events.length + 1);
      expect(applied.events.at(-1)).toMatchObject({
        command: 'takeCombatAction',
        text: `Action: ${name}`,
      });
      expect(applied.events.at(-1)?.override).toBeUndefined();
      await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
      await saved(page);
      const restored = await snapshot(page);
      expect(restored.build).toEqual(initial.build);
      expect(restored.live).toEqual(initial.live);
      expect(restored.events).toHaveLength(before.events.length + 2);
      expect(restored.events.at(-1)?.command).toBe('undo');
      expect(restored.events.at(-2)?.undoneBy).toBe(restored.events.at(-1)?.id);
    });
  }
});
