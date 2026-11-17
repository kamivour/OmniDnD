import { expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import { copyToCampaign } from './party';
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
