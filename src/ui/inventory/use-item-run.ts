import { useCommand } from '../commands/command-context';
import type { Command } from '../../engine/commands';

/** Run an item command and keep focus inside the controls when the clicked button disables. */
export function useItemRun(container: React.RefObject<HTMLElement | null>) {
  const { run } = useCommand();
  const fallback = () =>
    container.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)');
  return <P>(command: Command<P>, payload: P, done?: () => void) => {
    const focused = document.activeElement;
    run(command, payload, fallback, () => {
      done?.();
      requestAnimationFrame(() => {
        if (
          focused instanceof HTMLElement &&
          (!focused.isConnected || focused.matches(':disabled')) &&
          (document.activeElement === document.body || document.activeElement === focused)
        )
          fallback()?.focus();
      });
    });
  };
}
