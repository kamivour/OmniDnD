import { describe, expect, it } from 'vitest';
import { saveStatusView, type SaveStatusInput } from './save-status';

const base: SaveStatusInput = { saving: false, account: 'signed-in', sync: 'idle', waiting: false };
const label = (input: Partial<SaveStatusInput>) => saveStatusView({ ...base, ...input }).label;

describe('saveStatusView', () => {
  it('uses the four plan labels', () => {
    expect(label({})).toBe('Synced');
    expect(label({ waiting: true })).toBe('Saved on this device, syncing soon');
    expect(label({ sync: 'needs-choice' })).toBe('Sync paused: choose versions');
    expect(label({ account: 'signed-out', sync: 'signed-out' })).toBe(
      'Not signed in: only on this device',
    );
  });

  it('never looks synced without an account', () => {
    for (const account of ['none', 'loading', 'unavailable', 'signed-out'] as const) {
      for (const sync of ['idle', 'signed-out'] as const) {
        expect(label({ account, sync })).not.toMatch(/Synced/);
      }
    }
  });

  it('links paused sync to the choices and signed-out devices to Sign in', () => {
    const paused = saveStatusView({ ...base, sync: 'needs-choice', saving: true });
    expect(paused.action?.anchor).toBe('sync-choices');
    expect(paused.prominent).toBe(true);
    expect(saveStatusView({ ...base, account: 'signed-out' }).action).toEqual({
      anchor: 'settings-account',
      text: 'Sign in',
    });
  });

  it('keeps guest builds plain', () => {
    const guest = saveStatusView({ ...base, account: 'none', sync: 'signed-out' });
    expect(guest.label).toBe('Saved on this device');
    expect(guest.action).toBeUndefined();
    expect(label({ account: 'none', saving: true })).toBe('Saving…');
  });

  it('says when sync is offline or failing', () => {
    expect(label({ sync: 'offline' })).toBe('Offline: saved on this device');
    expect(label({ sync: 'error' })).toBe('Sync problem: saved on this device');
    expect(label({ sync: 'syncing' })).toBe('Syncing…');
  });
});
