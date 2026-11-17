import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import {
  ExportFileSchema,
  type ExportFile,
  type LiveState,
  type CharacterBuild,
} from '../../src/engine/schema';
import { expect, type Page } from './fixtures';

export function reviewFile(id: string) {
  const file = ExportFileSchema.parse(seed);
  file.build.id = id;
  file.build.name = id;
  file.live.characterId = id;
  file.events = [];
  return file;
}

export async function saved(page: Page) {
  await expect(page.locator('[aria-label="Local save status"]')).toContainText('Saved locally');
}

export async function importReview(page: Page, file: ExportFile, screen: string) {
  await page.goto('/settings');
  await saved(page);
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: 'review.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(ExportFileSchema.parse(file))),
  });
  const dialog = page.getByRole('dialog', { name: 'Import character', exact: true });
  await dialog.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(dialog).toBeHidden();
  await saved(page);
  await page.goto(`/characters/${file.build.id}/${screen}`);
  await saved(page);
}

export async function reviewState(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const read = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await read(indexedDB.open('omnidnd'));
    try {
      const tx = db.transaction(['builds', 'live'], 'readonly');
      const [build, live] = await Promise.all([
        read(tx.objectStore('builds').get(id)) as Promise<{ data: CharacterBuild }>,
        read(tx.objectStore('live').get(id)) as Promise<{ data: LiveState }>,
      ]);
      return { build: build.data, live: live.data };
    } finally {
      db.close();
    }
  }, id);
}
