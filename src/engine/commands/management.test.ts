import { describe, expect, it, vi } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import type { ExportFile } from '../schema';
import {
  addCharacter,
  appendManagementEvent,
  createCampaign,
  deleteCharacter,
  duplicateCharacter,
  ManagementEventSchema,
  runManagement,
  undoManagement,
  validateManagementData,
  type ManagementCommand,
  type ManagementData,
  type ManagementRunResult,
} from './management';
import { runCommand, type Command } from './runner';

const empty: ManagementData = { campaigns: {}, characters: {} };
const metadata = (eventId = 'm1') => ({ eventId, realTime: '2026-11-02T10:00:00.000Z' });
const workspace = (file: ExportFile = seedFile): ManagementData => ({
  campaigns: { [file.campaign.id]: file.campaign },
  characters: { [file.build.id]: { build: file.build, live: file.live, events: file.events } },
});
function ok(result: ManagementRunResult) {
  if (result.result !== 'ok') throw new Error(result.reasons.join('; '));
  return result;
}
function run<P>(command: ManagementCommand<P>, state: ManagementData, payload: P, id = 'm1') {
  return ok(runManagement(command, state, payload, registry, metadata(id)));
}
function playedFile(): ExportFile {
  const command: Command<number> = {
    name: 'loseHp',
    apply: (draft, amount) => {
      draft.live.hp -= amount;
      return `Lose ${amount} HP`;
    },
  };
  const result = runCommand(command, seedFile, 3, registry, metadata('c1'));
  if (result.result !== 'ok') throw new Error(result.reasons.join());
  return { ...seedFile, ...result.next, events: [result.event] };
}

describe('management commands', () => {
  it('adds a character and its campaign with a separate, valid workspace event', () => {
    const input = structuredClone(seedFile);
    const { next, event, reasons } = run(addCharacter, empty, { file: input });
    expect(next).toEqual(workspace());
    expect(empty).toEqual({ campaigns: {}, characters: {} });
    expect(event).toMatchObject({
      id: 'm1',
      command: 'addCharacter',
      text: 'Add character: The Fool',
    });
    expect(ManagementEventSchema.parse(event)).toEqual(event);
    expect(event).not.toHaveProperty('characterId');
    expect(event).not.toHaveProperty('gameSeconds');
    expect(event.patches.map(({ path }) => path[0]).sort()).toEqual(['campaigns', 'characters']);
    expect(next.characters['the-fool']!.build).not.toBe(input.build);
    expect(reasons).toEqual([]);
  });

  it('reuses an identical campaign even when its object keys have a different order', () => {
    const { optionalRules, ...settings } = seedFile.campaign;
    const campaign = { optionalRules, ...settings };
    const state = { campaigns: { [campaign.id]: campaign }, characters: {} };
    const { next, event } = run(addCharacter, state, { file: seedFile });
    expect(next.campaigns[campaign.id]).toBe(campaign);
    expect(event.patches).toHaveLength(1);
    expect(event.patches[0]?.path).toEqual(['characters', 'the-fool']);
  });

  it('duplicates all choices and current state with independent build/live objects and no history', () => {
    const file = structuredClone(playedFile());
    file.build.choices = { custom: { selected: ['one', 'two'] } };
    file.live.concentration = { spellId: 'spell.invisibility', slotLevel: 2, endsAt: 29000 };
    const state = workspace(file);
    const { next } = run(duplicateCharacter, state, {
      sourceId: 'the-fool',
      id: 'fool-copy',
      name: 'The Copy',
    });
    const source = next.characters['the-fool']!;
    const copy = next.characters['fool-copy']!;
    expect(copy.build).toEqual({ ...source.build, id: 'fool-copy', name: 'The Copy' });
    expect(copy.live).toEqual({ ...source.live, characterId: 'fool-copy' });
    expect(copy.events).toEqual([]);
    expect(source.events).toHaveLength(1);
    expect(copy.build).not.toBe(source.build);
    expect(copy.build.choices.custom).not.toBe(source.build.choices.custom);
    expect(copy.live.items).not.toBe(source.live.items);
    expect(state).toEqual(workspace(file));
  });

  it('deletes only the selected character and undo restores its complete history', () => {
    const file = playedFile();
    const initial = workspace(file);
    const { next, event } = run(deleteCharacter, initial, { characterId: 'the-fool' });
    expect(next.characters).toEqual({});
    expect(next.campaigns).toEqual(initial.campaigns);
    const restored = undoManagement(next, [event], registry, metadata('u1'));
    if (restored.result !== 'ok') throw new Error(restored.reasons.join());
    expect(restored.next).toEqual(initial);
    expect(restored.next.characters['the-fool']!.events).toEqual(file.events);
    expect(initial.characters['the-fool']!.live.hp).toBe(8);
  });

  it('creates a campaign and can undo it without touching existing characters', () => {
    const initial = workspace();
    const campaign = { ...seedFile.campaign, id: 'new-campaign', name: 'New campaign' };
    const { next, event } = run(createCampaign, initial, { campaign });
    expect(next.campaigns[campaign.id]).toEqual(campaign);
    expect(next.characters).toBe(initial.characters);
    const undone = undoManagement(next, [event], registry, metadata('u1'));
    if (undone.result !== 'ok') throw new Error(undone.reasons.join());
    expect(undone.next).toEqual(initial);
  });

  it.each([
    { command: duplicateCharacter, payload: { sourceId: 'missing', id: 'copy', name: 'Copy' } },
    {
      command: duplicateCharacter,
      payload: { sourceId: 'the-fool', id: 'the-fool', name: 'Copy' },
    },
    { command: duplicateCharacter, payload: { sourceId: 'the-fool', id: 'copy', name: '  ' } },
  ])('blocks invalid duplication without mutation ($payload)', ({ command, payload }) => {
    const state = workspace();
    const before = structuredClone(state);
    expect(
      runManagement(command, state, payload, registry, { ...metadata(), force: true }).result,
    ).toBe('blocked');
    expect(state).toEqual(before);
  });

  it('blocks deleting a missing character and creating an existing or invalid campaign', () => {
    const state = workspace();
    expect(
      runManagement(deleteCharacter, state, { characterId: 'missing' }, registry, metadata())
        .result,
    ).toBe('blocked');
    expect(
      runManagement(createCampaign, state, { campaign: seedFile.campaign }, registry, metadata())
        .result,
    ).toBe('blocked');
    const campaign = { ...seedFile.campaign, id: 'new', name: '' };
    expect(runManagement(createCampaign, state, { campaign }, registry, metadata()).result).toBe(
      'blocked',
    );
  });
});

describe('import validation', () => {
  it.each(['__proto__', 'constructor', 'prototype'])(
    'safely blocks reserved character and campaign ids (%s), even when forced',
    (id) => {
      const initial = workspace();
      const before = structuredClone(initial);
      for (const role of ['character', 'campaign']) {
        const file = structuredClone(seedFile);
        if (role === 'character') {
          file.build.id = id;
          file.live.characterId = id;
        } else {
          file.campaign.id = id;
          file.build.campaignId = id;
        }
        const result = runManagement(addCharacter, empty, { file }, registry, {
          ...metadata(),
          force: true,
        });
        expect(result.result).toBe('blocked');
        expect(result.reasons[0]).toMatch(/reserved/);
      }
      expect(
        runManagement(
          duplicateCharacter,
          initial,
          { sourceId: 'the-fool', id, name: 'Copy' },
          registry,
          metadata(),
        ).result,
      ).toBe('blocked');
      expect(
        runManagement(
          createCampaign,
          empty,
          { campaign: { ...seedFile.campaign, id } },
          registry,
          metadata(),
        ).result,
      ).toBe('blocked');
      expect(initial).toEqual(before);
      expect(empty).toEqual({ campaigns: {}, characters: {} });
      expect(Object.getPrototypeOf(empty.characters)).toBe(Object.prototype);
      expect(Object.getPrototypeOf(empty.campaigns)).toBe(Object.prototype);
      expect(Object.hasOwn(empty.characters, id)).toBe(false);
      expect(Object.hasOwn(empty.campaigns, id)).toBe(false);
    },
  );

  it('preserves own records for non-reserved ids that also exist on Object.prototype', () => {
    const file = structuredClone(seedFile);
    file.campaign.id = 'toString';
    file.build.campaignId = 'toString';
    file.build.id = 'valueOf';
    file.live.characterId = 'valueOf';
    const added = run(addCharacter, empty, { file });
    expect(Object.hasOwn(added.next.campaigns, 'toString')).toBe(true);
    expect(Object.hasOwn(added.next.characters, 'valueOf')).toBe(true);
    expect(added.next.characters['valueOf']!.build).toEqual(file.build);
    const undone = undoManagement(added.next, [added.event], registry, metadata('u1'));
    if (undone.result !== 'ok') throw new Error(undone.reasons.join());
    expect(undone.next).toEqual(empty);
  });

  it('blocks duplicate character ids and conflicting campaign settings, including when forced', () => {
    const state = workspace();
    const conflict = structuredClone(seedFile);
    conflict.build.id = 'another-fool';
    conflict.live.characterId = 'another-fool';
    conflict.campaign.hpMethod = 'average';
    const before = structuredClone(state);
    expect(
      runManagement(addCharacter, state, { file: seedFile }, registry, metadata()).result,
    ).toBe('blocked');
    const result = runManagement(addCharacter, state, { file: conflict }, registry, {
      ...metadata(),
      force: true,
    });
    expect(result).toEqual({
      result: 'blocked',
      reasons: ['The imported campaign conflicts with the saved campaign'],
    });
    expect(state).toEqual(before);
  });

  it.each([
    (file: ExportFile) => {
      file.live.characterId = 'another';
    },
    (file: ExportFile) => {
      file.build.campaignId = 'another';
    },
    (file: ExportFile) => {
      delete file.live.items['rapier-1'];
    },
    (file: ExportFile) => {
      file.campaign.ruleset = '5e-2024' as '5e-2014';
    },
    (file: ExportFile) => {
      file.schemaVersion = 2 as 1;
    },
  ])('blocks malformed files and broken crosslinks', (change) => {
    const file = structuredClone(seedFile);
    change(file);
    const before = structuredClone(file);
    expect(runManagement(addCharacter, empty, { file }, registry, metadata()).result).toBe(
      'blocked',
    );
    expect(file).toEqual(before);
    expect(empty.characters).toEqual({});
  });

  it.each([
    (file: ExportFile) => {
      file.build.spells[0]!.known.push('spell.missing');
    },
    (file: ExportFile) => {
      file.build.items[3]!.itemId = 'item.missing';
    },
    (file: ExportFile) => {
      file.build.proficiencies.tools.push('item.missing');
    },
    (file: ExportFile) => {
      file.build.favorites.push('feature.missing');
    },
    (file: ExportFile) => {
      file.live.featureUsesSpent['feature.missing'] = 1;
    },
    (file: ExportFile) => {
      file.live.concentration = { spellId: 'spell.missing' };
    },
    (file: ExportFile) => {
      file.build.items[0]!.container = 'missing';
    },
  ])('blocks unknown references, including entries not read by sheet calculations', (change) => {
    const file = structuredClone(seedFile);
    change(file);
    const result = runManagement(addCharacter, empty, { file }, registry, metadata());
    expect(result.result).toBe('blocked');
    expect(result.reasons[0]).toMatch(/missing/);
  });

  it('imports an intact character log and rejects a corrupt undo chain or patch root', () => {
    const file = playedFile();
    expect(run(addCharacter, empty, { file }).next.characters['the-fool']!.events).toEqual(
      file.events,
    );
    const broken = structuredClone(file);
    broken.events[0]!.inversePatches[0]!.value = -10;
    expect(runManagement(addCharacter, empty, { file: broken }, registry, metadata()).result).toBe(
      'blocked',
    );
    expect(Object.isFrozen(broken.build)).toBe(false);
    expect(Object.isFrozen(broken.live.items)).toBe(false);
    broken.events[0]!.inversePatches[0]!.path = ['campaign', 'name'];
    expect(runManagement(addCharacter, empty, { file: broken }, registry, metadata()).result).toBe(
      'blocked',
    );
  });

  it('validates output crosslinks and leaves the original state intact on command defects', () => {
    const initial = workspace();
    const broken: ManagementCommand<null> = {
      name: 'broken',
      apply: (draft) => {
        draft.characters['the-fool']!.build.campaignId = 'missing';
        return 'Broken';
      },
    };
    expect(() => runManagement(broken, initial, null, registry, metadata())).toThrow(
      'has no campaign',
    );
    expect(initial).toEqual(workspace());
    expect(() => validateManagementData({ ...initial, campaigns: {} }, registry)).toThrow();
  });
});

describe('workspace warnings and undo', () => {
  it('does not apply blocks or warnings, and logs an explicit override even in manual mode', () => {
    const apply = vi.fn(() => 'No change');
    const command: ManagementCommand<null> = {
      name: 'checked',
      check: () => [{ level: 'warn', reason: 'Review this change' }],
      apply,
    };
    const result = runManagement(command, empty, null, registry, {
      ...metadata(),
      automation: 'manual',
    });
    expect(result).toEqual({ result: 'warn', reasons: ['Review this change'] });
    expect(apply).not.toHaveBeenCalled();
    expect(empty).toEqual({ campaigns: {}, characters: {} });
    const forced = ok(
      runManagement(command, empty, null, registry, { ...metadata(), force: true }),
    );
    expect(forced.event.override).toBe(true);
    const blocked = { ...command, check: () => [{ level: 'block' as const, reason: 'Blocked' }] };
    apply.mockClear();
    expect(
      runManagement(blocked, empty, null, registry, { ...metadata(), force: true }).result,
    ).toBe('blocked');
    expect(apply).not.toHaveBeenCalled();
  });

  it('undoes additions exactly, marks their events, and steps back past previous undo entries', () => {
    const first = run(addCharacter, empty, { file: seedFile }, 'm1');
    const second = run(
      duplicateCharacter,
      first.next,
      { sourceId: 'the-fool', id: 'copy', name: 'Copy' },
      'm2',
    );
    const undone = undoManagement(
      second.next,
      [first.event, second.event],
      registry,
      metadata('u1'),
    );
    if (undone.result !== 'ok') throw new Error(undone.reasons.join());
    expect(undone.next).toEqual(first.next);
    expect(undone.events.find(({ id }) => id === 'm2')?.undoneBy).toBe('u1');
    const again = undoManagement(undone.next, undone.events, registry, metadata('u2'));
    if (again.result !== 'ok') throw new Error(again.reasons.join());
    expect(again.next).toEqual(empty);
    expect(undoManagement(again.next, again.events, registry, metadata('u3'))).toEqual({
      result: 'blocked',
      reasons: ['Nothing to undo'],
    });
  });

  it('warns before undo-add would remove an intervening character change and logs forced removal', () => {
    const added = run(addCharacter, empty, { file: seedFile });
    const edited = structuredClone(added.next);
    edited.characters['the-fool']!.live.hp = 7;
    const before = structuredClone(edited);
    const warned = undoManagement(edited, [added.event], registry, metadata('u1'));
    expect(warned.result).toBe('warn');
    if (warned.result === 'ok') throw new Error('Expected a warning');
    expect(warned.reasons[0]).toMatch(/also removes or replaces later changes/);
    expect(edited).toEqual(before);
    expect(added.event.undoneBy).toBeUndefined();
    const forced = undoManagement(edited, [added.event], registry, metadata('u1'), true);
    if (forced.result !== 'ok') throw new Error(forced.reasons.join());
    expect(forced.next).toEqual(empty);
    expect(forced.event.override).toBe(true);
    expect(forced.event.inversePatches).toContainEqual({
      op: 'add',
      path: ['characters', 'the-fool'],
      value: before.characters['the-fool'],
    });
    expect(forced.events[0]!.undoneBy).toBe('u1');
  });

  it('keeps unrelated character changes when undoing a duplicate', () => {
    const initial = workspace();
    const duplicated = run(duplicateCharacter, initial, {
      sourceId: 'the-fool',
      id: 'copy',
      name: 'Copy',
    });
    const edited = structuredClone(duplicated.next);
    edited.characters['the-fool']!.live.hp = 5;
    const result = undoManagement(edited, [duplicated.event], registry, metadata('u1'));
    if (result.result !== 'ok') throw new Error(result.reasons.join());
    expect(result.next.characters['the-fool']!.live.hp).toBe(5);
    expect(result.next.characters.copy).toBeUndefined();
    expect(result.event.override).toBeUndefined();
  });

  it('warns if undo-delete would replace a newer record at the deleted id', () => {
    const initial = workspace();
    const deleted = run(deleteCharacter, initial, { characterId: 'the-fool' });
    const replaced = { ...deleted.next, characters: initial.characters };
    expect(undoManagement(replaced, [deleted.event], registry, metadata('u1')).result).toBe('warn');
  });

  it('checks replacement values and keeps edits outside the affected patch path', () => {
    const rename: ManagementCommand<string> = {
      name: 'renameForTest',
      apply: (draft, name) => {
        draft.characters['the-fool']!.build.name = name;
        return `Rename: ${name}`;
      },
    };
    const renamed = run(rename, workspace(), 'First name');
    const edited = structuredClone(renamed.next);
    edited.characters['the-fool']!.live.hp = 6;
    const undone = undoManagement(edited, [renamed.event], registry, metadata('u1'));
    if (undone.result !== 'ok') throw new Error(undone.reasons.join());
    expect(undone.next.characters['the-fool']!.build.name).toBe('The Fool');
    expect(undone.next.characters['the-fool']!.live.hp).toBe(6);
    const later = structuredClone(edited);
    later.characters['the-fool']!.build.name = 'Later name';
    expect(undoManagement(later, [renamed.event], registry, metadata('u2')).result).toBe('warn');
  });

  it('blocks even forced undo if it would orphan a later character', () => {
    const created = run(createCampaign, empty, { campaign: seedFile.campaign });
    const added = run(addCharacter, created.next, { file: seedFile });
    const result = undoManagement(added.next, [created.event], registry, metadata('u1'), true);
    expect(result.result).toBe('blocked');
    expect(added.next).toEqual(workspace());
  });

  it('rejects histories with patches outside the workspace data roots', () => {
    const added = run(addCharacter, empty, { file: seedFile });
    const invalid = {
      ...added.event,
      inversePatches: [{ op: 'remove' as const, path: ['unexpectedSetting'] }],
    };
    expect(ManagementEventSchema.safeParse(invalid).success).toBe(false);
    expect(undoManagement(added.next, [invalid], registry, metadata('u1'))).toEqual({
      result: 'blocked',
      reasons: ['Undo history is invalid'],
    });
    const reserved = {
      ...added.event,
      inversePatches: [{ op: 'add' as const, path: ['characters', '__proto__'], value: {} }],
    };
    expect(ManagementEventSchema.safeParse(reserved).success).toBe(false);
    expect(undoManagement(added.next, [reserved], registry, metadata('u2'), true).result).toBe(
      'blocked',
    );
  });

  it('caps appended workspace history at 500 without changing the source array', () => {
    const { event } = run(addCharacter, empty, { file: seedFile });
    const events = Array.from({ length: 500 }, (_, index) => ({ ...event, id: `m${index}` }));
    const appended = appendManagementEvent(events, { ...event, id: 'newest' });
    expect(appended).toHaveLength(500);
    expect(appended[0]!.id).toBe('m1');
    expect(appended.at(-1)!.id).toBe('newest');
    expect(events[0]!.id).toBe('m0');
  });
});
