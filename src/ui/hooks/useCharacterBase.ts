import { useParams } from 'react-router';

/** Base path of the open character, e.g. `/characters/the-fool`. */
export function useCharacterBase(): string {
  const { characterId = '' } = useParams();
  return `/characters/${characterId}`;
}
