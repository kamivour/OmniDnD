import { createStore } from 'zustand/vanilla';
import { VISIBLE_THEMES, type ThemeId } from '../theme/themes';

/**
 * Device-only conveniences (not character or workspace state, never synced or backed up):
 * the optional dice roller switch, its short roll history, the theme, how new characters are made,
 * beginner hints and the last backup time.
 */
const KEY = 'omnidnd.device';
const HISTORY_LIMIT = 30;

export type ThemeChoice = 'system' | ThemeId;
/** A new device starts on Dark; a saved hidden theme also falls back to it. */
export const DEFAULT_THEME: ThemeChoice = 'dark';

export const THEME_CHOICES: readonly ThemeChoice[] = [
  'system',
  ...VISIBLE_THEMES.map((theme) => theme.id as ThemeId),
];

/** Theme effects: Auto is full on computers and calm on phones (docs/PLAN.md M39). */
export type FxChoice = 'auto' | 'full' | 'off';
export const FX_CHOICES: readonly FxChoice[] = ['auto', 'full', 'off'];

export interface RollEntry {
  id: number;
  label: string;
  expression: string;
  detail: string;
  total: number;
  note?: string;
}

export type CreationMode = 'steps' | 'page';

interface Saved {
  /** Step by step wizard or the one-page form for new characters. */
  creationMode: CreationMode;
  /** Beginner cards, suggestions and the to do list. */
  beginnerHints: boolean;
  diceRoller: boolean;
  theme: ThemeChoice;
  fx: FxChoice;
  /** Ask who is playing when a campaign or character is created (M24). */
  askRoles: boolean;
  /** When a whole-workspace backup file was last saved from this device. */
  lastBackupAt: string | undefined;
  /** The sign-in card on the Campaigns page was dismissed. */
  accountCardHidden: boolean;
}

interface DeviceState extends Saved {
  history: RollEntry[];
  setDiceRoller: (on: boolean) => void;
  setTheme: (theme: ThemeChoice) => void;
  setFx: (fx: FxChoice) => void;
  setAskRoles: (on: boolean) => void;
  setCreationMode: (mode: CreationMode) => void;
  setBeginnerHints: (on: boolean) => void;
  markBackedUp: (at: string) => void;
  setAccountCardHidden: (hidden: boolean) => void;
  addRoll: (entry: Omit<RollEntry, 'id'>) => void;
  clearHistory: () => void;
}

function read(): Saved {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown> | null;
    const at = parsed?.lastBackupAt;
    return {
      creationMode: parsed?.creationMode === 'page' ? 'page' : 'steps',
      beginnerHints: parsed?.beginnerHints !== false,
      diceRoller: parsed?.diceRoller === true,
      theme: THEME_CHOICES.find((choice) => choice === parsed?.theme) ?? DEFAULT_THEME,
      fx: FX_CHOICES.find((choice) => choice === parsed?.fx) ?? 'auto',
      askRoles: parsed?.askRoles !== false,
      lastBackupAt: typeof at === 'string' && !Number.isNaN(Date.parse(at)) ? at : undefined,
      accountCardHidden: parsed?.accountCardHidden === true,
    };
  } catch {
    return {
      creationMode: 'steps',
      beginnerHints: true,
      diceRoller: false,
      theme: DEFAULT_THEME,
      fx: 'auto',
      askRoles: true,
      lastBackupAt: undefined,
      accountCardHidden: false,
    };
  }
}

function write(saved: Saved) {
  const {
    creationMode,
    beginnerHints,
    diceRoller,
    theme,
    fx,
    askRoles,
    lastBackupAt,
    accountCardHidden,
  } = saved;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        creationMode,
        beginnerHints,
        diceRoller,
        theme,
        fx,
        askRoles,
        lastBackupAt,
        accountCardHidden,
      }),
    );
  } catch {
    // Storage can be blocked; the choice then lasts until reload.
  }
}

let nextId = 1;

export const deviceStore = createStore<DeviceState>((set) => {
  const change = (patch: Partial<Saved>) => {
    const {
      creationMode,
      beginnerHints,
      diceRoller,
      theme,
      fx,
      askRoles,
      lastBackupAt,
      accountCardHidden,
    } = { ...deviceStore.getState(), ...patch };
    write({
      creationMode,
      beginnerHints,
      diceRoller,
      theme,
      fx,
      askRoles,
      lastBackupAt,
      accountCardHidden,
    });
    set(patch);
  };
  return {
    ...read(),
    history: [],
    setDiceRoller: (diceRoller) => change({ diceRoller }),
    setTheme: (theme) => change({ theme }),
    setFx: (fx) => change({ fx }),
    setAskRoles: (askRoles) => change({ askRoles }),
    setCreationMode: (creationMode) => change({ creationMode }),
    setBeginnerHints: (beginnerHints) => change({ beginnerHints }),
    markBackedUp: (lastBackupAt) => change({ lastBackupAt }),
    setAccountCardHidden: (accountCardHidden) => change({ accountCardHidden }),
    addRoll: (entry) =>
      set((state) => ({
        history: [{ ...entry, id: nextId++ }, ...state.history].slice(0, HISTORY_LIMIT),
      })),
    clearHistory: () => set({ history: [] }),
  };
});
