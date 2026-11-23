import { describe, expect, it } from 'vitest';
import { NAV } from '../layout/nav';
import { PLACES, campaignPlaces, partyReaderPlaces } from './places';

/** Routes that are not in the side nav but must still be findable. */
const EXTRA_ROUTES = [
  'compendium',
  'todo',
  'print',
  'profile',
  'reference/tools',
  'reference/credits',
];

describe('PLACES', () => {
  const screens = new Set(
    PLACES.flatMap((place) =>
      place.target.kind === 'go' && !place.target.anchor ? [place.target.path] : [],
    ),
  );

  it('has a screen entry for every nav item', () => {
    for (const item of NAV) expect(screens, `missing: ${item.label}`).toContain(item.to);
  });

  it('has a screen entry for every extra route', () => {
    for (const route of EXTRA_ROUTES) expect(screens, `missing: ${route}`).toContain(route);
  });

  it('uses each id once', () => {
    const ids = PLACES.map((place) => place.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('registers join screens and campaign approval at their hub routes', () => {
    expect(PLACES.find((p) => p.id === 'go.join-campaign')?.target).toEqual({
      kind: 'go',
      path: '/join',
      anchor: 'join-campaign',
    });
    expect(campaignPlaces('a/b')[0]?.target).toEqual({
      kind: 'go',
      path: '/campaigns/a%2Fb/settings',
      anchor: 'join-requests',
    });
  });

  it('finds the rest actions and body numbers', () => {
    const find = (id: string) => PLACES.find((place) => place.id === id);
    expect(find('do.long-rest')?.target).toEqual({ kind: 'action', action: 'long-rest' });
    expect(find('go.movement-body')?.synonyms).toContain('jump');
  });

  it('registers reader sections on the shared character route', () => {
    const entries = partyReaderPlaces('party:friend/hero');
    expect(entries.map(({ title }) => title)).toEqual([
      'Sheet',
      'Spells',
      'Inventory',
      'Features',
      'Companions',
    ]);
    expect(entries[1]?.target).toEqual({
      kind: 'go',
      path: '/characters/party%3Afriend%2Fhero?view=spells',
      anchor: 'party-reader-spells',
    });
  });
});
