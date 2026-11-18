import { useEffect, useState } from 'react';
import { cleanName, NAME_TAKEN, nameProblem } from '../../sync/display-name';
import type { SyncProvider } from '../../sync/provider';

export type NameCheck =
  | { state: 'empty' | 'checking' | 'free' | 'same' | 'unknown' }
  | { state: 'invalid' | 'taken'; message: string };

/**
 * Checks a display name while the player types: shape at once, availability after a short pause.
 * `unknown` means the server cannot tell (not updated yet); saving still finds a clash.
 */
export function useNameCheck(
  provider: SyncProvider | null,
  draft: string,
  saved?: string | null,
): NameCheck {
  const name = cleanName(draft);
  const problem = name ? nameProblem(name) : null;
  const same = !!saved && saved === name;
  const [answer, setAnswer] = useState<{ name: string; free: boolean | null } | null>(null);

  useEffect(() => {
    if (!provider || !name || problem || same) return;
    let live = true;
    const timer = setTimeout(() => {
      provider
        .displayNameAvailable(name)
        .catch(() => null)
        .then((free) => live && setAnswer({ name, free }));
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [provider, name, problem, same]);

  if (!name) return { state: 'empty' };
  if (problem) return { state: 'invalid', message: problem };
  if (same) return { state: 'same' };
  if (answer?.name !== name) return { state: 'checking' };
  if (answer.free === null) return { state: 'unknown' };
  return answer.free ? { state: 'free' } : { state: 'taken', message: NAME_TAKEN };
}

/** Whether the name may be sent: the server still has the final say. */
export const nameReady = (check: NameCheck): boolean =>
  check.state === 'free' || check.state === 'unknown';
