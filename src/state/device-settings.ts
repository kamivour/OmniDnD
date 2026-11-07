import { createStore } from 'zustand/vanilla';

/**
 * Device-only conveniences (not character or workspace state, never synced or backed up):
 * the optional dice roller switch and its short roll history.
 */
const KEY = 'omnidnd.device';
const HISTORY_LIMIT = 30;

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
  history: RollEntry[];
  setDiceRoller: (on: boolean) => void;
  addRoll: (entry: Omit<RollEntry, 'id'>) => void;
  clearHistory: () => void;
}

function read(): { diceRoller: boolean } {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const on = (parsed as { diceRoller?: unknown } | null)?.diceRoller;
    return { diceRoller: on === true };
  } catch {
    return { diceRoller: false };
  }
}

function write(diceRoller: boolean) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ diceRoller }));
  } catch {
    // Storage can be blocked; the switch then lasts until reload.
  }
}

let nextId = 1;

export const deviceStore = createStore<DeviceState>((set) => ({
  ...read(),
  history: [],
  setDiceRoller: (on) => {
    write(on);
    set({ diceRoller: on });
  },
  addRoll: (entry) =>
    set((state) => ({
      history: [{ ...entry, id: nextId++ }, ...state.history].slice(0, HISTORY_LIMIT),
    })),
  clearHistory: () => set({ history: [] }),
}));
