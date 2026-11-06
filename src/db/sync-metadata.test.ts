import { describe, expect, it } from 'vitest';
import { seedFile } from '../data/seed';
import { applyDamage } from '../engine/commands/hp';
import { createCharacterStore } from '../state/character-store';
import { serializeWorkspace, type StoredRecord } from './database';
import { fingerprint, planSyncRecords, syncId, type SyncRecord } from './sync-metadata';

const FOOL = seedFile.build.id;
const T1 = '2026-11-06T10:00:00.000Z';
const T2 = '2026-11-06T11:00:00.000Z';
const T3 = '2026-11-06T12:00:00.000Z';

function workspace() {
  return createCharacterStore();
}

describe('sync metadata', () => {
  it('back-fills one record per campaign and character for an older workspace', () => {
    const rows = serializeWorkspace(workspace().getState());
    const planned = planSyncRecords([], rows, T1);
    expect(planned.map(({ id }) => id).sort()).toEqual(
      [...rows.campaigns.map(({ id }) => syncId('campaign', id)), syncId('character', FOOL)].sort(),
    );
    expect(planned.every(({ data }) => data.changedAt === T1 && !data.deleted)).toBe(true);
    expect(planned.every(({ data }) => data.fingerprint.length > 0)).toBe(true);
  });

  it('leaves unchanged entities alone and stamps only the character that changed', () => {
    const store = workspace();
    const first = planSyncRecords([], serializeWorkspace(store.getState()), T1);
    expect(planSyncRecords(first, serializeWorkspace(store.getState()), T2)).toEqual([]);

    store.getState().dispatch(FOOL, applyDamage, { amount: 2 }, { eventId: 'hit', realTime: T2 });
    const changed = planSyncRecords(first, serializeWorkspace(store.getState()), T2);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.id).toBe(syncId('character', FOOL));
    expect(changed[0]?.data.changedAt).toBe(T2);
    expect(changed[0]?.data.fingerprint).not.toBe(
      first.find(({ id }) => id === syncId('character', FOOL))?.data.fingerprint,
    );
  });

  it('keeps a deletion marker, and clears it if the character comes back', () => {
    const store = workspace();
    const rows = serializeWorkspace(store.getState());
    const first = planSyncRecords([], rows, T1);
    const empty = { ...rows, builds: [], live: [], events: [] };

    const removed = planSyncRecords(first, empty, T2);
    expect(removed).toEqual([
      {
        id: syncId('character', FOOL),
        schemaVersion: 1,
        data: {
          kind: 'character',
          entityId: FOOL,
          changedAt: T2,
          deleted: true,
          fingerprint: '',
        },
      },
    ]);

    const merged = merge(first, removed);
    expect(planSyncRecords(merged, empty, T3)).toEqual([]);
    const restored = planSyncRecords(merged, rows, T3);
    expect(restored).toHaveLength(1);
    expect(restored[0]?.data).toMatchObject({ deleted: false, changedAt: T3 });
    expect(restored[0]?.data.fingerprint).toBe(
      first.find(({ id }) => id === syncId('character', FOOL))?.data.fingerprint,
    );
  });

  it('fingerprints content, not key order', () => {
    expect(fingerprint({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(
      fingerprint({ b: [1, { d: 3, c: 2 }], a: 1 }),
    );
    expect(fingerprint({ a: 1, b: undefined })).toBe(fingerprint({ a: 1 }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
    expect(fingerprint([1, 2])).not.toBe(fingerprint([2, 1]));
  });
});

function merge(
  base: StoredRecord<SyncRecord>[],
  changes: StoredRecord<SyncRecord>[],
): StoredRecord<SyncRecord>[] {
  const rows = new Map(base.map((row) => [row.id, row]));
  for (const row of changes) rows.set(row.id, row);
  return [...rows.values()];
}
