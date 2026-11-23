import { expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { iconGlyph } from './character-icons';

it('provides a visible class glyph and a distinct motif for every bundled subclass', () => {
  for (const entry of registry.entries.values()) {
    if (entry.kind === 'class') expect(iconGlyph(entry.id), entry.id).toBeDefined();
    if (entry.kind !== 'subclass') continue;
    const motif = iconGlyph(entry.id);
    expect(motif, entry.id).toBeDefined();
    expect(motif, entry.id).not.toBe(iconGlyph(entry.classId));
  }
  expect(iconGlyph('character.custom-hero', 'class.paladin')).toBe('class.paladin');
  expect(iconGlyph('character.the-fool', 'class.paladin')).toBe('character.the-fool');
});
