import { describe, expect, it } from 'vitest';
import { fingerprint, type SyncRecord } from '../db/sync-metadata';
import { planSync } from './plan';
import type { RemoteEntity } from './provider';

const content = { name: 'Gate Fighter' };
const changed = { name: 'Gate Fighter', hp: 3 };

function local(overrides: Partial<SyncRecord> = {}): SyncRecord {
  return {
    kind: 'character',
    entityId: 'c1',
    changedAt: '2026-11-06T10:00:00.000Z',
    deleted: false,
    fingerprint: fingerprint(content),
    ...overrides,
  };
}

function remote(revision: number, payload: unknown = content): RemoteEntity {
  return {
    kind: 'character',
    entityId: 'c1',
    revision,
    deleted: payload === null,
    changedAt: '2026-11-06T10:00:00.000Z',
    schemaVersion: 1,
    payload,
  };
}

const synced = (revision: number, current: unknown = content) =>
  local({
    fingerprint: fingerprint(current),
    baseRevision: revision,
    syncedFingerprint: fingerprint(content),
  });

describe('sync planning', () => {
  it('uploads entities the cloud has never seen, but not local deletions', () => {
    expect(planSync([local()], [])).toEqual([
      expect.objectContaining({ type: 'push', expectedRevision: null }),
    ]);
    expect(planSync([local({ deleted: true, fingerprint: '' })], [])).toEqual([]);
  });

  it('downloads entities that only the cloud has', () => {
    expect(planSync([], [remote(2)])).toEqual([expect.objectContaining({ type: 'pull' })]);
    expect(planSync([], [remote(2, null)])).toEqual([expect.objectContaining({ type: 'adopt' })]);
  });

  it('does nothing when neither side changed', () => {
    expect(planSync([synced(3)], [remote(3)])).toEqual([]);
  });

  it('uploads a local change against the revision it was based on', () => {
    expect(planSync([synced(3, changed)], [remote(3)])).toEqual([
      expect.objectContaining({ type: 'push', expectedRevision: 3 }),
    ]);
  });

  it('downloads a cloud change when this device has none', () => {
    expect(planSync([synced(3)], [remote(4, changed)])).toEqual([
      expect.objectContaining({ type: 'pull' }),
    ]);
  });

  it('adopts the cloud revision when both sides made the same change', () => {
    expect(planSync([synced(3, changed)], [remote(4, changed)])).toEqual([
      expect.objectContaining({ type: 'adopt' }),
    ]);
  });

  it('reports a conflict instead of overwriting when both sides changed differently', () => {
    expect(planSync([synced(3, changed)], [remote(4, { name: 'Other' })])).toEqual([
      expect.objectContaining({ type: 'conflict' }),
    ]);
  });

  it('treats a first sign-in on a device with matching data as already synced', () => {
    expect(planSync([local()], [remote(5)])).toEqual([expect.objectContaining({ type: 'adopt' })]);
  });

  it('orders campaigns before characters', () => {
    const campaign = local({ kind: 'campaign', entityId: 'camp' });
    const steps = planSync([local(), campaign], []);
    expect(steps.map((step) => step.id)).toEqual(['campaign:camp', 'character:c1']);
  });
});
