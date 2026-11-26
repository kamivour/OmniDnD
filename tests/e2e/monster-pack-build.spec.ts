import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * The production build must never carry a private monster pack (M50, D273). Every pack holds
 * this marker (scripts/monsters/pack.ts); the literal lives only there and here.
 */
const PACK_CANARY = 'omnidnd-private-monster-pack-canary-4d1c';
const LOCAL_PACK = join('data', 'private', 'monsters', 'monsters.pack.json');

function bundleText(dir: string): string {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((item) => item.isFile() && /\.(js|html|json|webmanifest|css)$/.test(item.name))
    .map((item) => readFileSync(join(item.parentPath, item.name), 'utf8'))
    .join('\n');
}

test('the production build holds no monster pack', ({ isMobile }) => {
  test.skip(isMobile, 'one scan is enough');
  // The web server step builds dist/ before any test runs.
  const text = bundleText('dist');
  expect(text.length).toBeGreaterThan(0);
  expect(text.includes(PACK_CANARY), 'pack canary found in dist/').toBe(false);

  // On a machine with a local pack, no creature id unique to it may reach the bundle either.
  if (!existsSync(LOCAL_PACK)) return;
  const pack = JSON.parse(readFileSync(LOCAL_PACK, 'utf8')) as { creatures: { id: string }[] };
  const leaked = pack.creatures.filter((creature) => text.includes(`"${creature.id}"`)).length;
  expect(leaked, 'pack creature ids found in dist/').toBe(0);
});
