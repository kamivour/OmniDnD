import { Link, useParams } from 'react-router';
import { companionLink } from './companion-links';

/** Small Stats button beside Use or Cast, for cards that bring a creature into play. */
export function StatsLink({ refId, name }: { refId: string; name: string }) {
  const { characterId } = useParams();
  const link = companionLink(refId);
  if (!link || !characterId) return null;
  return (
    <Link
      to={`/characters/${characterId}/companions?from=${link.key}`}
      aria-label={`${name} stats`}
      className="hover-lift flex min-h-11 shrink-0 items-center rounded-btn border border-border px-2 text-xs font-semibold text-text-muted hover:text-accent"
    >
      Stats
    </Link>
  );
}
