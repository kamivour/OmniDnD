import type { ConflictChoice, SyncConflict } from './engine';
import type { SyncProvider } from './provider';
import type { SyncReport } from './runner';

export type SyncStatus = 'signed-out' | 'idle' | 'syncing' | 'offline' | 'needs-choice' | 'error';

export interface AutoSyncState {
  status: SyncStatus;
  conflicts: SyncConflict[];
  /** Last successful run, in `deps.now()` milliseconds. */
  lastSyncedAt: number | null;
  lastReport: SyncReport | null;
  error: string;
}

export interface AutoSyncDeps {
  run(provider: SyncProvider, choices: ReadonlyMap<string, ConflictChoice>): Promise<SyncReport>;
  now(): number;
  setTimer(work: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  isOnline(): boolean;
  /** Runs `work` only if no other tab is syncing. Resolves `undefined` when another tab is. */
  withLock<T>(work: () => Promise<T>): Promise<T | undefined>;
}

/** Wait after the last change before syncing, and the longest a steady stream of edits can delay it. */
export const CHANGE_DELAY_MS = 3_000;
export const CHANGE_CAP_MS = 30_000;
/** Waits after a failed run: 5 s, 30 s, then every 2 min. */
export const RETRY_MS = [5_000, 30_000, 120_000];
/** Coming back to a tab syncs again only if the last run is older than this. */
export const VISIBLE_MIN_AGE_MS = 15_000;

const EMPTY: AutoSyncState = {
  status: 'signed-out',
  conflicts: [],
  lastSyncedAt: null,
  lastReport: null,
  error: '',
};

/**
 * Decides when to sync. No DOM or storage access here: the app supplies timers, the network
 * state and the run itself, so tests can drive it with a fake clock.
 */
export class AutoSync {
  private readonly deps: AutoSyncDeps;
  private provider: SyncProvider | null = null;
  private state: AutoSyncState = EMPTY;
  private readonly listeners = new Set<() => void>();
  private timer: unknown = null;
  private pendingSince: number | null = null;
  private retryIndex = 0;
  private running = false;
  private again = false;

  constructor(deps: AutoSyncDeps) {
    this.deps = deps;
  }

  getState = (): AutoSyncState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** A signed-in provider is ready: sync right away. */
  attach(provider: SyncProvider) {
    this.provider = provider;
    this.retryIndex = 0;
    this.set({ ...EMPTY, status: this.deps.isOnline() ? 'idle' : 'offline' });
    this.schedule(0);
  }

  /** Signed out: stop everything and forget conflicts. */
  detach() {
    this.provider = null;
    this.clear();
    this.pendingSince = null;
    this.again = false;
    this.set(EMPTY);
  }

  /** The workspace changed here. Syncs after a short quiet spell. */
  changed() {
    if (!this.provider || this.running || this.state.status === 'needs-choice') return;
    const now = this.deps.now();
    this.pendingSince ??= now;
    this.schedule(Math.min(CHANGE_DELAY_MS, Math.max(0, this.pendingSince + CHANGE_CAP_MS - now)));
  }

  /** The app opened, the tab came back, or the network returned. */
  wake(minAgeMs = 0) {
    if (!this.provider || this.state.status === 'needs-choice') return;
    const last = this.state.lastSyncedAt;
    if (last !== null && this.deps.now() - last < minAgeMs) return;
    this.retryIndex = 0;
    this.schedule(0);
  }

  /** The browser lost the network. */
  wentOffline() {
    if (!this.provider) return;
    this.clear();
    if (!this.running) this.set({ ...this.state, status: 'offline' });
  }

  /** Sync now, with the user's answers to earlier conflicts. */
  async syncNow(choices: ReadonlyMap<string, ConflictChoice> = new Map()) {
    this.clear();
    await this.execute(choices);
  }

  private schedule(ms: number) {
    this.clear();
    this.timer = this.deps.setTimer(() => {
      this.timer = null;
      void this.execute(new Map());
    }, ms);
  }

  private clear() {
    if (this.timer !== null) this.deps.clearTimer(this.timer);
    this.timer = null;
  }

  private set(next: AutoSyncState) {
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  private async execute(choices: ReadonlyMap<string, ConflictChoice>) {
    const provider = this.provider;
    if (!provider) return;
    if (this.running) {
      this.again = true;
      return;
    }
    if (!this.deps.isOnline()) {
      this.set({ ...this.state, status: 'offline' });
      return;
    }
    this.running = true;
    this.pendingSince = null;
    this.set({ ...this.state, status: 'syncing', error: '' });
    try {
      const report = await this.deps.withLock(() => this.deps.run(provider, choices));
      if (this.provider !== provider) return;
      if (report === undefined) {
        // Another tab is syncing and shares this device's data.
        this.set({ ...this.state, status: 'idle' });
        return;
      }
      this.retryIndex = 0;
      this.set({
        status: report.conflicts.length > 0 ? 'needs-choice' : 'idle',
        conflicts: report.conflicts,
        lastSyncedAt: this.deps.now(),
        lastReport: report,
        error: '',
      });
      if (report.deferred || this.again) this.schedule(1_000);
    } catch (cause) {
      if (this.provider !== provider) return;
      const message = cause instanceof Error ? cause.message : String(cause);
      if (!this.deps.isOnline()) {
        this.set({ ...this.state, status: 'offline', error: '' });
      } else {
        this.set({ ...this.state, status: 'error', error: message });
        const wait = RETRY_MS[Math.min(this.retryIndex, RETRY_MS.length - 1)] ?? 120_000;
        this.retryIndex += 1;
        this.schedule(wait);
      }
    } finally {
      this.running = false;
      this.again = false;
    }
  }
}
