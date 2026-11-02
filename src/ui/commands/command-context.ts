import { createContext, useContext } from 'react';
import type { Command, RunResult } from '../../engine/commands';

export interface CommandActions {
  run: <P>(
    command: Command<P>,
    payload: P,
    returnFocusTo?: HTMLElement,
    onApplied?: () => void,
  ) => RunResult;
  undo: () => void;
  notes: string[];
  clearNotes: () => void;
}

export const CommandContext = createContext<CommandActions | null>(null);

export function useCommand() {
  const actions = useContext(CommandContext);
  if (!actions) throw new Error('Commands require the character frame');
  return actions;
}
