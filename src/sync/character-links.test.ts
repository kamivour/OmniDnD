import { expect, it } from 'vitest';
import { registry } from '../data/registry';
import { computeSheet } from '../engine/calc/sheet';
import { freshState } from '../engine/commands/test-utils';
import { characterLinkSnapshot, characterLinkUrl } from './character-links';

it('publishes a Bench sheet without identifying or changing the workspace', () => {
  const state = structuredClone(freshState);
  state.campaign = { ...state.campaign, bench: true, name: 'Private table' };
  state.build.journal.notes = 'Private notes';
  state.build.items[0]!.notes = 'Inventory note';
  state.build.overrides = [{ path: '/ac', value: 17, note: 'Private ruling' }];
  const before = structuredClone(state);
  const copy = characterLinkSnapshot(state, '2026-11-24T06:00:00.000Z');
  expect(copy.build).toMatchObject({ id: 'shared-character', journal: {}, choices: {} });
  expect(copy.campaign).toMatchObject({ id: 'shared-character', name: 'Shared character' });
  expect(copy.campaign.bench).toBeUndefined();
  expect(copy.build.items[0]!.notes).toBeUndefined();
  expect(copy.build.overrides[0]!.note).toBe('Shared override');
  expect(copy.live.currency.gp).toBe(0);
  expect(copy.events).toEqual([]);
  expect(computeSheet(copy, registry).ac.value).toBe(17);
  expect(computeSheet(copy, registry).slots).toEqual(computeSheet(state, registry).slots);
  expect(state).toEqual(before);
});

it('rejects a cached party character and keeps a public token in the fragment', () => {
  expect(() =>
    characterLinkSnapshot(
      {
        ...freshState,
        build: { ...freshState.build, partyOwner: { userId: 'other', name: 'Other' } },
      },
      '2026-11-24T06:00:00.000Z',
    ),
  ).toThrow('Only publish a character from your own workspace');
  const token = '644dff6a-6f50-4e81-ba42-7d402348c5c0';
  expect(characterLinkUrl(token, 'https://example.test')).toBe(
    `https://example.test/share/character#${token}`,
  );
});
