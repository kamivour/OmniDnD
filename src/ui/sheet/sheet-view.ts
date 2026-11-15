import { useSyncExternalStore } from 'react';

/** Which part of the character sheet to show; a per-device convenience, not game state. */
export const SHEET_VIEWS = [
  { id: 'all', label: 'All' },
  { id: 'basics', label: 'Basics' },
  { id: 'skills', label: 'Skills' },
  { id: 'proficiencies', label: 'Proficiencies' },
  { id: 'combat', label: 'Combat' },
  { id: 'spells', label: 'Spells' },
] as const;

export type SheetView = (typeof SHEET_VIEWS)[number]['id'];

const key = 'omni.sheet.view';
const listeners = new Set<() => void>();
let cached: SheetView | undefined;

export function parseSheetView(raw: unknown): SheetView {
  return SHEET_VIEWS.find(({ id }) => id === raw)?.id ?? 'all';
}

function read(): SheetView {
  if (cached) return cached;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    // Storage may be blocked; show the whole sheet then.
  }
  cached = parseSheetView(raw);
  return cached;
}

function write(view: SheetView) {
  cached = view;
  try {
    localStorage.setItem(key, view);
  } catch {
    // Kept in memory for this session only.
  }
  listeners.forEach((listener) => listener());
}

export function useSheetView() {
  const view = useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, read);
  return { view, setView: write };
}
