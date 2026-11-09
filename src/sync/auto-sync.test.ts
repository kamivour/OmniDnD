import { describe, expect, it } from 'vitest';
import {
  AutoSync,
  CHANGE_CAP_MS,
  CHANGE_DELAY_MS,
  RETRY_MS,
  VISIBLE_MIN_AGE_MS,
  type AutoSyncDeps,
} from './auto-sync';
import type { SyncProvider } from './provider';
import type { SyncReport } from './runner';

const report = (extra: Partial<SyncReport> = {}): SyncReport => ({
  uploaded: 0,
  downloaded: 0,
  skipped: 0,
  conflicts: [],
  deferred: false,
  ...extra,
});

/** A fake clock and a scripted run. `advance` fires timers in order. */
function setup(results: (SyncReport | Error)[] = []) {
  let now = 0;
  let online = true;
  let locked = false;
  const timers: { id: number; at: number; work: () => void }[] = [];
  let nextId = 1;
  const calls: number[] = [];
  const deps: AutoSyncDeps = {
    run: () => {
      calls.push(now);
      const next = results.shift() ?? report();
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
    now: () => now,
    setTimer: (work, ms) => {
      const id = nextId++;
      timers.push({ id, at: now + ms, work });
      return id;
    },
    clearTimer: (handle) => {
      const index = timers.findIndex((timer) => timer.id === handle);
      if (index >= 0) timers.splice(index, 1);
    },
    isOnline: () => online,
    withLock: async (work) => (locked ? undefined : work()),
  };
  const sync = new AutoSync(deps);
  const advance = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const due = timers[0];
      if (!due || due.at > end) break;
      timers.shift();
      now = due.at;
      due.work();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    }
    now = end;
  };
  return {
    sync,
    advance,
    calls,
    timers,
    setOnline: (value: boolean) => (online = value),
    setLocked: (value: boolean) => (locked = value),
    clock: () => now,
  };
}

const provider = {} as SyncProvider;

describe('AutoSync', () => {
  it('syncs on attach and goes idle', async () => {
    const t = setup();
    t.sync.attach(provider);
    await t.advance(0);
    expect(t.calls).toEqual([0]);
    expect(t.sync.getState().status).toBe('idle');
    expect(t.sync.getState().lastSyncedAt).toBe(0);
  });

  it('waits for a quiet spell after changes, but never past the cap', async () => {
    const t = setup();
    t.sync.attach(provider);
    await t.advance(0);
    t.calls.length = 0;
    // An edit every second keeps pushing the sync back until the cap.
    for (let second = 0; second < 40; second += 1) {
      t.sync.changed();
      await t.advance(1_000);
    }
    expect(t.calls[0]).toBe(CHANGE_CAP_MS);
    t.calls.length = 0;
    t.sync.changed();
    await t.advance(CHANGE_DELAY_MS - 1);
    expect(t.calls).toEqual([]);
    await t.advance(1);
    expect(t.calls).toHaveLength(1);
  });

  it('retries after 5 s, 30 s, then every 2 min, and recovers', async () => {
    const t = setup([
      new Error('down'),
      new Error('down'),
      new Error('down'),
      new Error('down'),
      report(),
    ]);
    t.sync.attach(provider);
    await t.advance(0);
    expect(t.sync.getState().status).toBe('error');
    expect(t.sync.getState().error).toBe('down');
    await t.advance(RETRY_MS[0] ?? 0);
    await t.advance(RETRY_MS[1] ?? 0);
    await t.advance(RETRY_MS[2] ?? 0);
    expect(t.calls).toEqual([0, 5_000, 35_000, 155_000]);
    await t.advance(120_000);
    expect(t.sync.getState().status).toBe('idle');
  });

  it('stays offline without running, then syncs when the network returns', async () => {
    const t = setup();
    t.setOnline(false);
    t.sync.attach(provider);
    await t.advance(0);
    expect(t.calls).toEqual([]);
    expect(t.sync.getState().status).toBe('offline');
    t.setOnline(true);
    t.sync.wake();
    await t.advance(0);
    expect(t.calls).toHaveLength(1);
    expect(t.sync.getState().status).toBe('idle');
  });

  it('asks for a choice on conflicts and stops auto syncing until answered', async () => {
    const conflict = { id: 'campaign:c1', kind: 'campaign', name: 'Camp' } as never;
    const t = setup([report({ conflicts: [conflict] })]);
    t.sync.attach(provider);
    await t.advance(0);
    expect(t.sync.getState().status).toBe('needs-choice');
    t.sync.changed();
    t.sync.wake();
    await t.advance(60_000);
    expect(t.calls).toHaveLength(1);
    await t.sync.syncNow(new Map([['campaign:c1', 'cloud']]));
    expect(t.calls).toHaveLength(2);
    expect(t.sync.getState().status).toBe('idle');
  });

  it('skips a tab wake when the last sync is recent', async () => {
    const t = setup();
    t.sync.attach(provider);
    await t.advance(0);
    t.sync.wake(VISIBLE_MIN_AGE_MS);
    await t.advance(1_000);
    expect(t.calls).toHaveLength(1);
    await t.advance(VISIBLE_MIN_AGE_MS);
    t.sync.wake(VISIBLE_MIN_AGE_MS);
    await t.advance(0);
    expect(t.calls).toHaveLength(2);
  });

  it('leaves syncing to another tab that holds the lock', async () => {
    const t = setup();
    t.setLocked(true);
    t.sync.attach(provider);
    await t.advance(0);
    expect(t.calls).toEqual([]);
    expect(t.sync.getState().status).toBe('idle');
  });

  it('runs again soon when the run was deferred', async () => {
    const t = setup([report({ deferred: true })]);
    t.sync.attach(provider);
    await t.advance(0);
    await t.advance(1_000);
    expect(t.calls).toEqual([0, 1_000]);
  });

  it('stops on detach', async () => {
    const t = setup();
    t.sync.attach(provider);
    t.sync.detach();
    await t.advance(60_000);
    expect(t.calls).toEqual([]);
    expect(t.sync.getState().status).toBe('signed-out');
    expect(t.timers).toEqual([]);
  });
});
