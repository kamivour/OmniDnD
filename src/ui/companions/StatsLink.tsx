import { Link, useParams } from 'react-router';
import { cx } from '../cx';
import { companionLink } from './companion-links';

/** Small Stats button beside Use or Cast, for cards that bring a creature into play. */
export function StatsLink({
  refId,
  name,
  label = 'Stats',
  className,
}: {
  refId: string;
  name: string;
  /** Visible text; the accessible name stays "<name> stats". */
  label?: string;
  className?: string;
}) {
  const { characterId } = useParams();
  const link = companionLink(refId);
  if (!link || !characterId) return null;
  return (
    <Link
      to={`/characters/${characterId}/companions?from=${link.key}`}
      aria-label={`${name} stats`}
      className={cx(
        'hover-lift flex min-h-11 shrink-0 items-center rounded-btn border border-border px-2 text-xs font-semibold text-text-muted hover:text-accent',
        className,
      )}
    >
      {label}
    </Link>
  );
}
