import { createStore } from 'zustand/vanilla';

/**
 * Device-only conveniences (not character or workspace state, never synced or backed up):
 * the optional dice roller switch, its short roll history, the theme and the last backup time.
 */
const KEY = 'omnidnd.device';
const HISTORY_LIMIT = 30;

export type ThemeChoice = 'system' | 'dark' | 'parchment';
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'dark', 'parchment'];

export interface RollEntry {
  id: number;
  label: string;
  expression: string;
  detail: string;
  total: number;
  note?: string;
}

interface Saved {
  diceRoller: boolean;
  theme: ThemeChoice;
  /** When a whole-workspace backup file was last saved from this device. */
  lastBackupAt: string | undefined;
}

interface DeviceState extends Saved {
  history: RollEntry[];
  setDiceRoller: (on: boolean) => void;
  setTheme: (theme: ThemeChoice) => void;
  markBackedUp: (at: string) => void;
  addRoll: (entry: Omit<RollEntry, 'id'>) => void;
  clearHistory: () => void;
}

function read(): Saved {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown> | null;
    const at = parsed?.lastBackupAt;
    return {
      diceRoller: parsed?.diceRoller === true,
      theme: THEME_CHOICES.find((choice) => choice === parsed?.theme) ?? 'system',
      lastBackupAt: typeof at === 'string' && !Number.isNaN(Date.parse(at)) ? at : undefined,
    };
  } catch {
    return { diceRoller: false, theme: 'system', lastBackupAt: undefined };
  }
}

function write({ diceRoller, theme, lastBackupAt }: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ diceRoller, theme, lastBackupAt }));
  } catch {
    // Storage can be blocked; the choice then lasts until reload.
  }
}

let nextId = 1;

export const deviceStore = createStore<DeviceState>((set) => {
  const change = (patch: Partial<Saved>) => {
    const { diceRoller, theme, lastBackupAt } = { ...deviceStore.getState(), ...patch };
    write({ diceRoller, theme, lastBackupAt });
    set(patch);
  };
  return {
    ...read(),
    history: [],
    setDiceRoller: (diceRoller) => change({ diceRoller }),
    setTheme: (theme) => change({ theme }),
    markBackedUp: (lastBackupAt) => change({ lastBackupAt }),
    addRoll: (entry) =>
      set((state) => ({
        history: [{ ...entry, id: nextId++ }, ...state.history].slice(0, HISTORY_LIMIT),
      })),
    clearHistory: () => set({ history: [] }),
  };
});
