import { describe, expect, it } from 'vitest';
import { SyncRecordSchema } from '../db/sync-metadata';
import { isoTime } from './supabase-provider';

describe('server times', () => {
  it('turn Postgres timestamps into UTC ISO strings ending in Z', () => {
    expect(isoTime('2026-11-16T02:35:00.123456+00:00')).toBe('2026-11-16T02:35:00.123Z');
    expect(isoTime('2026-11-16T09:35:00+07:00')).toBe('2026-11-16T02:35:00.000Z');
    expect(isoTime('2026-11-16T02:35:00.000Z')).toBe('2026-11-16T02:35:00.000Z');
    expect(() => isoTime('soon')).toThrow('unreadable time');
  });

  it('already saved with an offset still load', () => {
    const record = {
      kind: 'character',
      entityId: 'the-fool',
      changedAt: '2026-11-16T02:35:00.123456+00:00',
      deleted: false,
      fingerprint: 'abc',
      baseRevision: 3,
    };
    expect(SyncRecordSchema.parse(record)).toEqual(record);
  });
});
