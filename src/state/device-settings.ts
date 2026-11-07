import { createStore } from 'zustand/vanilla';

/**
 * Device-only conveniences (not character or workspace state, never synced or backed up):
 * the optional dice roller switch and its short roll history.
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

interface DeviceState {
  diceRoller: boolean;
  theme: ThemeChoice;
  history: RollEntry[];
  setDiceRoller: (on: boolean) => void;
  setTheme: (theme: ThemeChoice) => void;
  addRoll: (entry: Omit<RollEntry, 'id'>) => void;
  clearHistory: () => void;
}

function read(): { diceRoller: boolean; theme: ThemeChoice } {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as {
      diceRoller?: unknown;
      theme?: unknown;
    } | null;
    const theme = THEME_CHOICES.find((choice) => choice === parsed?.theme) ?? 'system';
    return { diceRoller: parsed?.diceRoller === true, theme };
  } catch {
    return { diceRoller: false, theme: 'system' };
  }
}

function write(settings: { diceRoller: boolean; theme: ThemeChoice }) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage can be blocked; the choice then lasts until reload.
  }
}

let nextId = 1;

export const deviceStore = createStore<DeviceState>((set) => ({
  ...read(),
  history: [],
  setDiceRoller: (on) => {
    write({ diceRoller: on, theme: deviceStore.getState().theme });
    set({ diceRoller: on });
  },
  setTheme: (theme) => {
    write({ diceRoller: deviceStore.getState().diceRoller, theme });
    set({ theme });
  },
  addRoll: (entry) =>
    set((state) => ({
      history: [{ ...entry, id: nextId++ }, ...state.history].slice(0, HISTORY_LIMIT),
    })),
  clearHistory: () => set({ history: [] }),
}));
