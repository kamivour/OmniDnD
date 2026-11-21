import { describe, expect, it } from 'vitest';
import { BOTTOM_NAV, NAV, navGroup } from './nav';

describe('navigation groups', () => {
  it('lists main screens before Journal, Reference and Settings', () => {
    expect(navGroup(NAV, false).map((n) => n.label)).toEqual([
      'Home',
      'Sheet',
      'Spells',
      'Combat',
      'Inventory',
      'Features',
      'Companions',
      'Explore',
    ]);
    expect(navGroup(NAV, true).map((n) => n.label)).toEqual(['Journal', 'Reference', 'Settings']);
  });

  it('leaves Features, Companions and Explore as the main screens in More', () => {
    const more = NAV.filter((n) => !BOTTOM_NAV.includes(n.to));
    expect(navGroup(more, false).map((n) => n.label)).toEqual([
      'Features',
      'Companions',
      'Explore',
    ]);
  });
});
