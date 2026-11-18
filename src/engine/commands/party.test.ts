import { expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import { copyToCampaign, keepOutOfSharing, moveToCampaign } from './party';
import { runManagement, undoManagement } from './management';

it('bringing an owned character preserves the original and undoes exactly after JSON reload', () => {
  const file = structuredClone(seedFile);
  file.build.journal.notes = 'My private notes';
  const state = {
    campaigns: {
      [file.campaign.id]: file.campaign,
      party: { ...file.campaign, id: 'party', name: 'Party', shared: true },
    },
    characters: { [file.build.id]: { build: file.build, live: file.live, events: file.events } },
  };
  const payload = { sourceId: file.build.id, id: 'copy', campaignId: 'party' };
  const meta = { eventId: 'copy', realTime: '2026-11-17T00:00:00.000Z' };
  expect(runManagement(copyToCampaign, state, payload, registry, meta).result).toBe('warn');
  const result = runManagement(copyToCampaign, state, payload, registry, { ...meta, force: true });
  if (result.result !== 'ok') throw new Error(result.reasons.join());
  expect(result.next.characters[file.build.id]).toEqual(state.characters[file.build.id]);
  expect(result.next.characters.copy?.build).toMatchObject({
    id: 'copy',
    campaignId: 'party',
    journal: { notes: 'My private notes' },
  });
  expect(result.next.characters.copy?.live).toEqual({ ...file.live, characterId: 'copy' });
  const restored = undoManagement(
    JSON.parse(JSON.stringify(result.next)),
    [JSON.parse(JSON.stringify(result.event))],
    registry,
    { ...meta, eventId: 'undo' },
  );
  expect(restored).toMatchObject({ result: 'ok', next: state });
  const remote = structuredClone(state);
  Object.assign(remote.characters[file.build.id]!.build, {
    partyOwner: { userId: 'someone', name: 'Someone' },
  });
  expect(
    runManagement(copyToCampaign, remote, payload, registry, { ...meta, force: true }).result,
  ).toBe('blocked');
});

const META = { eventId: 'move', realTime: '2026-11-19T00:00:00.000Z' };

function workspace() {
  const file = structuredClone(seedFile);
  const record = { build: file.build, live: file.live, events: file.events };
  return {
    campaigns: {
      [file.campaign.id]: file.campaign,
      table: { ...file.campaign, id: 'table', name: 'Table', shared: true },
    },
    characters: {
      [file.build.id]: record,
      other: {
        ...structuredClone(record),
        build: { ...structuredClone(record.build), id: 'other', name: 'Other' },
        live: { ...structuredClone(record.live), characterId: 'other' },
      },
    },
  };
}

it('moving a character keeps its history, warns who will see it, and undoes', () => {
  const state = workspace();
  const id = seedFile.build.id;
  const payload = { characterId: id, campaignId: 'table' };
  const warned = runManagement(moveToCampaign, state, payload, registry, META);
  expect(warned).toMatchObject({ result: 'warn' });
  expect(warned.reasons.join(' ')).toContain('Members of Table will see this character');
  const result = runManagement(moveToCampaign, state, payload, registry, { ...META, force: true });
  if (result.result !== 'ok') throw new Error(result.reasons.join());
  expect(result.next.characters[id]?.build.campaignId).toBe('table');
  expect(result.next.characters[id]?.events).toEqual(state.characters[id]!.events);
  // Moving back out of a shared campaign says the party loses sight of it.
  const back = runManagement(
    moveToCampaign,
    result.next,
    { characterId: id, campaignId: seedFile.campaign.id },
    registry,
    META,
  );
  expect(back.reasons.join(' ')).toContain("Table's members will no longer see this character");
  const restored = undoManagement(result.next, [result.event], registry, {
    ...META,
    eventId: 'undo',
  });
  expect(restored).toMatchObject({ result: 'ok', next: state });
  expect(
    runManagement(
      moveToCampaign,
      state,
      { characterId: id, campaignId: seedFile.campaign.id },
      registry,
      META,
    ).result,
  ).toBe('blocked');
});

it('characters left out of sharing move to a private copy with the same rules', () => {
  const state = workspace();
  const campaignId = seedFile.campaign.id;
  const payload = { campaignId, characterIds: ['other'], privateId: 'private-1' };
  const result = runManagement(keepOutOfSharing, state, payload, registry, META);
  if (result.result !== 'ok') throw new Error(result.reasons.join());
  expect(result.next.campaigns['private-1']).toEqual({
    ...state.campaigns[campaignId],
    id: 'private-1',
    name: `${state.campaigns[campaignId]!.name} (private)`,
  });
  expect(result.next.characters.other?.build.campaignId).toBe('private-1');
  expect(result.next.characters[seedFile.build.id]?.build.campaignId).toBe(campaignId);
  expect(
    runManagement(keepOutOfSharing, state, { ...payload, campaignId: 'table' }, registry, META)
      .result,
  ).toBe('blocked');
});
