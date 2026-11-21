import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { catalogEntries, matchesFilter } from '../../engine/catalog';
import { GAME_ICONS } from '../icons/game-icons';
import { entryArt, equipmentArtwork, featIcons } from './compendium-art';
import { equipmentBases, equipmentReferences } from './equipment-reference';

describe('Compendium imagery and equipment references', () => {
  it('resolves real icons for every bundled catalog entry', () => {
    for (const entry of registry.entries.values()) {
      if (entry.kind === 'creature' || entry.kind === 'condition') continue;
      if (entry.kind === 'feature' && entry.origin !== 'feat') continue;
      const { fallback, id } = entryArt(entry);
      expect(Object.hasOwn(GAME_ICONS, id) || Object.hasOwn(GAME_ICONS, fallback), entry.id).toBe(
        true,
      );
    }
    for (const entry of catalogEntries(registry, 'feats'))
      expect(featIcons.has(entry.id), entry.id).toBe(true);
    for (const [id, file] of Object.entries(equipmentArtwork)) {
      expect(registry.entries.has(id), id).toBe(true);
      expect(existsSync(`public/compendium/${file}.png`), file).toBe(true);
    }
  });

  it('covers the imported weapon and armor headers and every curated base resolves', () => {
    for (const entry of catalogEntries(registry, 'equipment')) {
      if (entry.kind !== 'item' || !entry.rarity) continue;
      if (/^(weapon|armou?r)\b/i.test(entry.fullText ?? ''))
        expect(equipmentReferences[entry.id], entry.id).toBeDefined();
    }
    for (const [id, reference] of Object.entries(equipmentReferences)) {
      const item = registry.get('item', id);
      if (reference?.bases)
        expect(equipmentBases(item, registry).map((base) => base.id)).toEqual(
          expect.arrayContaining([...reference.bases]),
        );
    }
    const trident = registry.get('item', 'item.trident-of-fish-command');
    expect(entryArt(trident).fallback).toBe('catalog.trident');
    const thrower = registry.get('item', 'item.dwarven-thrower');
    expect(
      matchesFilter(
        thrower,
        { text: 'warhammer' },
        equipmentBases(thrower, registry).map(({ name }) => name),
      ),
    ).toBe(true);
  });
});
