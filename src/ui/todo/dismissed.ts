import { useSyncExternalStore } from 'react';

/** Optional to-do items a player hid, kept per device and character (a convenience, not game state). */
const key = (characterId: string) => `omni.todo.dismissed.${characterId}`;
const listeners = new Set<() => void>();
const cache = new Map<string, string[]>();

function read(characterId: string): string[] {
  const cached = cache.get(characterId);
  if (cached) return cached;
  let ids: string[] = [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key(characterId)) ?? '[]');
    if (Array.isArray(parsed)) ids = parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    // Storage may be blocked; nothing is dismissed then.
  }
  cache.set(characterId, ids);
  return ids;
}

function write(characterId: string, ids: string[]) {
  cache.set(characterId, ids);
  try {
    localStorage.setItem(key(characterId), JSON.stringify(ids));
  } catch {
    // Kept in memory for this session only.
  }
  listeners.forEach((listener) => listener());
}

export function useDismissed(characterId: string) {
  const ids = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => read(characterId),
  );
  return {
    dismissed: ids,
    dismiss: (id: string) => write(characterId, [...new Set([...read(characterId), id])]),
    restore: (id: string) =>
      write(
        characterId,
        read(characterId).filter((row) => row !== id),
      ),
  };
}
