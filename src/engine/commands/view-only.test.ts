import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import {
  deleteCharacter,
  duplicateCharacter,
  runManagement,
  type ManagementData,
} from './management';
import { runCommand, undo, VIEW_ONLY, type Command } from './runner';

const meta = { eventId: 'e1', realTime: '2026-11-09T10:00:00.000Z' };
const loseHp: Command<number> = {
  name: 'loseHp',
  apply: (draft, amount) => {
    draft.live.hp -= amount;
    return `Lose ${amount} HP`;
  },
};
const partyState = () => ({
  campaign: seedFile.campaign,
  build: { ...seedFile.build, partyOwner: { userId: 'u2', name: 'Ana' } },
  live: seedFile.live,
});

describe('party characters are view only', () => {
  it('blocks commands and undo', () => {
    expect(runCommand(loseHp, partyState(), 1, registry, meta)).toEqual({
      result: 'blocked',
      reasons: [VIEW_ONLY],
    });
    expect(undo(partyState(), seedFile.events, meta)).toEqual({
      result: 'blocked',
      reasons: [VIEW_ONLY],
    });
  });

  it('still runs commands on own characters', () => {
    const own = { ...partyState(), build: seedFile.build };
    expect(runCommand(loseHp, own, 1, registry, meta).result).toBe('ok');
  });

  it('duplicate gives an own, editable copy; delete is blocked', () => {
    const data: ManagementData = {
      campaigns: { [seedFile.campaign.id]: seedFile.campaign },
      characters: {
        [seedFile.build.id]: {
          ...partyState(),
          build: partyState().build,
          live: seedFile.live,
          events: [],
        },
      },
    };
    const copy = runManagement(
      duplicateCharacter,
      data,
      { sourceId: seedFile.build.id, id: 'copy', name: 'Copy' },
      registry,
      meta,
    );
    if (copy.result !== 'ok') throw new Error('duplicate failed');
    expect(copy.next.characters.copy?.build.partyOwner).toBeUndefined();
    expect(copy.next.characters.copy?.build.playedBy).toBe('me');
    expect(
      runManagement(deleteCharacter, data, { characterId: seedFile.build.id }, registry, meta)
        .result,
    ).toBe('blocked');
  });
});
