import { describe, expect, it } from 'vitest';
import { seedFile } from '../data/seed';
import { applyDamage } from '../engine/commands/hp';
import { addCharacter, duplicateCharacter, importCharacter } from '../engine/commands/management';
import { completeLongRest } from '../engine/commands/rest';
import { resetCharacter } from '../engine/commands/reset';
import { createCharacterStore } from '../state/character-store';
import { resolveActivity } from '../state/activity-order';
import { deserializeWorkspace, serializeWorkspace, type StoredRecord } from './database';
import { createBackupIntent, planBackups, type BackupIntent } from './backups';

const FOOL = seedFile.build.id;
const TIME = '2026-11-05T09:00:00.000Z';
const event = (eventId: string) => ({ eventId, realTime: TIME });
const metadata = (id = 'backup:test', capturedAt = TIME) => ({ id, capturedAt });

function restIntent(id = 'backup:rest'): BackupIntent {
  const store = createCharacterStore();
  const previous = store.getState();
  expect(store.getState().dispatch(FOOL, completeLongRest, null, event('rest')).result).toBe('ok');
  const intent = createBackupIntent(previous, store.getState(), metadata(id));
  if (!intent) throw new Error('Rest backup missing');
  return intent;
}

function importedFile() {
  const file = structuredClone(seedFile);
  file.build.id = 'another-bard';
  file.live.characterId = file.build.id;
  return file;
}

describe('automatic backup capture', () => {
  it('captures the whole current workspace before import, including an unsaved edit', () => {
    const store = createCharacterStore();
    store.getState().dispatch(FOOL, applyDamage, { amount: 2 }, event('damage'));
    const previous = store.getState();
    const expected = serializeWorkspace(previous);
    expect(
      store
        .getState()
        .dispatchManagement(importCharacter, { file: importedFile() }, event('import')).result,
    ).toBe('ok');
    const intent = createBackupIntent(previous, store.getState(), metadata());
    expect(intent).toMatchObject({
      id: 'backup:test',
      schemaVersion: 1,
      data: {
        kind: 'omnidnd-workspace-backup',
        payloadVersion: 1,
        reason: 'before-import',
        capturedAt: TIME,
        source: { scope: 'workspace', eventId: 'import' },
      },
    });
    expect(intent?.data.workspace).toEqual(expected);
    const loaded = deserializeWorkspace(intent!.data.workspace);
    expect(Object.keys(loaded.characters)).toEqual([FOOL]);
    expect(loaded.characters[FOOL]?.live.hp).toBe(9);
    expect(loaded.characters[FOOL]?.events.at(-1)?.id).toBe('damage');
    expect(loaded.bookmarks).toEqual(previous.bookmarks);
    expect(loaded.activityOrder).toEqual(previous.activityOrder);
  });

  it('captures after a long rest and keeps that immutable moment after later damage', () => {
    const store = createCharacterStore();
    const previous = store.getState();
    store.getState().dispatch(FOOL, completeLongRest, null, event('rest'));
    const intent = createBackupIntent(previous, store.getState(), metadata());
    const captured = structuredClone(intent);
    store.getState().dispatch(FOOL, applyDamage, { amount: 3 }, event('damage'));
    expect(intent).toEqual(captured);
    expect(intent?.data.reason).toBe('after-long-rest');
    const loaded = deserializeWorkspace(intent!.data.workspace);
    expect(loaded.characters[FOOL]?.live.hp).toBe(19);
    expect(loaded.characters[FOOL]?.live.slotsUsed).toEqual(Array(10).fill(0));
    expect(loaded.characters[FOOL]?.events.at(-1)?.command).toBe('completeLongRest');
    expect(store.getState().characters[FOOL]?.live.hp).toBe(16);
    expect(loaded.activityOrder).toEqual(captured?.data.workspace.activityOrder);
  });

  it('captures exact pre-reset source state, including resources and retained history', () => {
    const store = createCharacterStore();
    store.getState().dispatch(FOOL, applyDamage, { amount: 3 }, event('damage'));
    const previous = store.getState();
    expect(store.getState().dispatch(FOOL, resetCharacter, {}, event('reset')).result).toBe('ok');
    const intent = createBackupIntent(previous, store.getState(), metadata());
    expect(intent?.data.reason).toBe('before-reset');
    expect(intent?.data.workspace).toEqual(serializeWorkspace(previous));
    expect(deserializeWorkspace(intent!.data.workspace).characters[FOOL]?.live.hp).toBe(8);
    expect(store.getState().characters[FOOL]?.live.hp).toBe(19);
  });

  it('ignores creation, duplication, ordinary commands, unchanged state and Undo', () => {
    const store = createCharacterStore();
    let previous = store.getState();
    expect(createBackupIntent(previous, previous, metadata())).toBeUndefined();
    store.getState().dispatchManagement(addCharacter, { file: importedFile() }, event('create'));
    expect(createBackupIntent(previous, store.getState(), metadata())).toBeUndefined();
    previous = store.getState();
    store
      .getState()
      .dispatchManagement(
        duplicateCharacter,
        { sourceId: FOOL, id: 'copy', name: 'Copy' },
        event('duplicate'),
      );
    expect(createBackupIntent(previous, store.getState(), metadata())).toBeUndefined();
    previous = store.getState();
    store.getState().dispatch(FOOL, applyDamage, { amount: 1 }, event('damage'));
    expect(createBackupIntent(previous, store.getState(), metadata())).toBeUndefined();
    previous = store.getState();
    store.getState().dispatch(FOOL, completeLongRest, null, event('rest'));
    const rested = store.getState();
    expect(createBackupIntent(previous, rested, metadata())).toBeDefined();
    store.getState().undo(FOOL, event('undo-rest'));
    expect(createBackupIntent(rested, store.getState(), metadata())).toBeUndefined();
  });

  it('does not capture a warning, a blocked rest or a replayed activity reference', () => {
    const store = createCharacterStore();
    store.getState().dispatch(FOOL, completeLongRest, null, event('rest'));
    const rested = store.getState();
    expect(store.getState().dispatch(FOOL, completeLongRest, null, event('warned')).result).toBe(
      'warn',
    );
    expect(createBackupIntent(rested, store.getState(), metadata())).toBeUndefined();
    const noOrder = { ...rested, activityOrder: [] };
    expect(createBackupIntent(noOrder, rested, metadata())).toBeUndefined();
    store.getState().dispatch(FOOL, applyDamage, { amount: 100 }, event('lethal'));
    const dead = store.getState();
    expect(store.getState().dispatch(FOOL, completeLongRest, null, event('blocked')).result).toBe(
      'blocked',
    );
    expect(createBackupIntent(dead, store.getState(), metadata())).toBeUndefined();
  });

  it('creates only pre-import backup when the imported character history contains a long rest', () => {
    const imported = createCharacterStore([importedFile()]);
    imported.getState().dispatch('another-bard', completeLongRest, null, event('foreign-rest'));
    const record = imported.getState().characters['another-bard']!;
    const file = { ...importedFile(), ...record };
    const store = createCharacterStore();
    const previous = store.getState();
    expect(
      store.getState().dispatchManagement(importCharacter, { file }, event('import')).result,
    ).toBe('ok');
    const intent = createBackupIntent(previous, store.getState(), metadata());
    expect(intent?.data.reason).toBe('before-import');
    expect(intent?.data.source).toMatchObject({ scope: 'workspace', eventId: 'import' });
    expect(intent?.data.workspace).toEqual(serializeWorkspace(previous));
  });

  it('resolves only the exact content identity, not a reused event id', () => {
    const store = createCharacterStore();
    store.getState().dispatch(FOOL, completeLongRest, null, event('rest'));
    const next = store.getState();
    const source = next.activityOrder!.at(-1)!;
    expect(resolveActivity(next, source)?.event.command).toBe('completeLongRest');
    expect(resolveActivity(next, { ...source, fingerprint: 'different' })).toBeUndefined();
    const forged = { ...next, activityOrder: [{ ...source, fingerprint: 'different' }] };
    expect(
      createBackupIntent(createCharacterStore().getState(), forged, metadata()),
    ).toBeUndefined();
  });
});

describe('backup retention and compatibility', () => {
  it('retains ten device-wide snapshots by local order despite equal or backward timestamps', () => {
    const base = restIntent();
    const intents = Array.from({ length: 12 }, (_, index) => ({
      ...structuredClone(base),
      id: `backup:${index}`,
      data: {
        ...structuredClone(base.data),
        capturedAt: index === 0 ? '2099-01-01T00:00:00.000Z' : TIME,
      },
    }));
    const first = planBackups([], intents.slice(0, 8));
    const savedBefore = structuredClone(first.add);
    const next = planBackups(first.add, intents.slice(8));
    expect(first.add).toEqual(savedBefore);
    expect(next.add.map((row) => row.data.order)).toEqual([9, 10, 11, 12]);
    expect(next.remove).toEqual(['backup:1', 'backup:0']);
    const kept = [...first.add, ...next.add].filter((row) => !next.remove.includes(row.id));
    expect(kept).toHaveLength(10);
    expect(planBackups(kept, [{ ...base, id: 'backup:next' }]).add[0]?.data.order).toBe(13);
  });

  it('preserves opaque, malformed and future records byte-for-byte and excludes their order', () => {
    const base = restIntent();
    const valid = planBackups([], [base]).add[0]!;
    const malformedWorkspace = structuredClone(valid);
    malformedWorkspace.id = 'backup:bad-workspace';
    malformedWorkspace.data.workspace.live[0]!.data.hp = -1;
    malformedWorkspace.data.order = 1000;
    const unknown: StoredRecord<unknown>[] = [
      { id: 'foreign', schemaVersion: 1, data: { arbitrary: 'keep' } },
      {
        ...structuredClone(valid),
        id: 'backup:future-schema',
        schemaVersion: 999,
      } as unknown as StoredRecord<unknown>,
      {
        ...structuredClone(valid),
        id: 'backup:future-payload',
        data: { ...valid.data, payloadVersion: 999, order: 9000 },
      },
      {
        ...structuredClone(valid),
        id: 'backup:extra-payload',
        data: { ...valid.data, unknown: true },
      },
      {
        ...structuredClone(valid),
        id: 'backup:extra-workspace',
        data: { ...valid.data, workspace: { ...valid.data.workspace, unknown: true } },
      },
      { ...structuredClone(valid), id: 'foreign-valid-shape' },
      { id: 123, schemaVersion: 1, data: valid.data } as unknown as StoredRecord<unknown>,
      malformedWorkspace,
    ];
    const existing = [valid, ...unknown];
    const before = structuredClone(existing);
    const plan = planBackups(existing, [{ ...base, id: 'backup:new' }]);
    expect(plan.add[0]?.data.order).toBe(2);
    expect(plan.remove).toEqual([]);
    expect(existing).toEqual(before);
  });

  it('reuses a committed matching identity and rejects collisions without overwriting', () => {
    const intent = restIntent();
    const row = planBackups([], [intent]).add[0]!;
    expect(planBackups([row], [intent, intent])).toEqual({ add: [], remove: [] });
    expect(planBackups([], [intent, intent]).add).toHaveLength(1);
    const opaque = { id: intent.id, schemaVersion: 1 as const, data: { preserve: true } };
    expect(() => planBackups([opaque], [intent])).toThrow('Backup identity collision');
    const changed = { ...intent, data: { ...intent.data, capturedAt: '2026-11-06T09:00:00.000Z' } };
    expect(() => planBackups([row], [changed])).toThrow('Backup identity collision');
    expect(opaque.data).toEqual({ preserve: true });
  });

  it.each(['builds', 'live', 'campaigns'] as const)(
    'preserves malformed snapshots with duplicate %s primary keys',
    (table) => {
      const intent = restIntent();
      const row = planBackups([], [intent]).add[0]!;
      const damaged = structuredClone(row);
      damaged.id = `backup:duplicate-${table}`;
      damaged.data.order = 1000;
      const rows = damaged.data.workspace[table];
      Object.assign(damaged.data.workspace, { [table]: [...rows, structuredClone(rows[0]!)] });
      const before = structuredClone(damaged);
      const plan = planBackups([row, damaged], [{ ...intent, id: 'backup:next' }]);
      expect(plan.add[0]?.data.order).toBe(2);
      expect(plan.remove).toEqual([]);
      expect(damaged).toEqual(before);
    },
  );

  it.each([{ automation: undefined }, { automation: 'unsupported' }, { reducedMotion: 'false' }])(
    'preserves snapshots with invalid preferences (%j)',
    (preferences) => {
      const intent = restIntent();
      const row = planBackups([], [intent]).add[0]!;
      const damaged = structuredClone(row);
      damaged.id = 'backup:invalid-preferences';
      damaged.data.order = 1000;
      Object.assign(damaged.data.workspace, preferences);
      const before = structuredClone(damaged);
      const plan = planBackups([row, damaged], [{ ...intent, id: 'backup:next' }]);
      expect(plan.add[0]?.data.order).toBe(2);
      expect(plan.remove).toEqual([]);
      expect(damaged).toEqual(before);
    },
  );

  it('fails visibly instead of overflowing the safe local order or pruning opaque records', () => {
    const intent = restIntent();
    const row = planBackups([], [intent]).add[0]!;
    row.data.order = Number.MAX_SAFE_INTEGER;
    const before = structuredClone(row);
    expect(() => planBackups([row], [{ ...intent, id: 'backup:next' }])).toThrow();
    expect(row).toEqual(before);
  });
});
