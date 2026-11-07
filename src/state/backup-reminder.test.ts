import { describe, expect, it } from 'vitest';
import { backupReminder } from './backup-reminder';

const now = new Date('2026-11-20T00:00:00.000Z');

describe('backupReminder', () => {
  it('stays quiet with nothing to lose or a recent backup', () => {
    expect(backupReminder(undefined, now, false)).toBeUndefined();
    expect(backupReminder('2026-11-10T00:00:00.000Z', now, true)).toBeUndefined();
  });

  it('reminds when there is no backup or it is old', () => {
    expect(backupReminder(undefined, now, true)).toContain('not saved');
    expect(backupReminder('2026-11-01T00:00:00.000Z', now, true)).toContain('14 days');
    expect(backupReminder('garbage', now, true)).toContain('14 days');
  });
});
