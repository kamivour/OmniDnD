/** Profile pictures are small JPEG data URLs kept in the profile row (about 100 KB at most). */
export const AVATAR_MAX = 140_000;
const PREFIX = 'data:image/jpeg;base64,';

export const isAvatar = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith(PREFIX) && value.length <= AVATAR_MAX;

/** Why a picture cannot be saved, or null when it can (null clears the picture). */
export function avatarProblem(value: string | null): string | null {
  if (value === null) return null;
  if (!value.startsWith(PREFIX)) return 'Choose a JPEG picture made by OmniDnD.';
  return value.length > AVATAR_MAX ? 'This picture is too large. Choose a smaller one.' : null;
}
