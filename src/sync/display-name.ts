/** Display names: 3 to 24 characters after trimming, unique across accounts ignoring case. */
export const NAME_MIN = 3;
export const NAME_MAX = 24;
export const NAME_TAKEN = 'That name is taken';

export const cleanName = (name: string): string => name.trim();

/** Why a name cannot be used, or null when its shape is fine. Uniqueness is the server's job. */
export function nameProblem(name: string): string | null {
  const length = cleanName(name).length;
  if (length < NAME_MIN || length > NAME_MAX) return `Use ${NAME_MIN} to ${NAME_MAX} characters.`;
  return null;
}

/** Same comparison the server's unique index uses. */
export const nameKey = (name: string): string => cleanName(name).toLowerCase();
