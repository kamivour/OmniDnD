import { createContext, useContext } from 'react';
import type { Command, RunResult } from '../../engine/commands';

/** Resolve late when a successful command replaces the caller's dialog contents. */
export type CommandFocusTarget = HTMLElement | (() => HTMLElement | null | undefined);

export interface CommandActions {
  run: <P>(
    command: Command<P>,
    payload: P,
    returnFocusTo?: CommandFocusTarget,
    onApplied?: () => void,
  ) => RunResult;
  undo: () => void;
  /** A shared confirmation owns focus until it is resolved or cancelled. */
  warningOpen: boolean;
  notes: string[];
  clearNotes: () => void;
}

export const CommandContext = createContext<CommandActions | null>(null);

export function useCommand() {
  const actions = useContext(CommandContext);
  if (!actions) throw new Error('Commands require the character frame');
  return actions;
}
