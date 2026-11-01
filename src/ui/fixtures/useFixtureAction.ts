import { useCallback } from 'react';
import { useToast } from '../components/toast-context';

/**
 * M1 key frames are static: buttons that would change state show a toast instead.
 * Replaced by engine commands from M3 on.
 */
export function useFixtureAction(): (label: string) => void {
  const toast = useToast();
  return useCallback(
    (label: string) => toast({ text: `${label} · static key frame, wired in a later milestone` }),
    [toast],
  );
}
