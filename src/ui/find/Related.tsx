import { Link } from 'react-router';
import { useCharacterBase } from '../hooks/useCharacterBase';
import { navPath } from '../layout/nav';
import { scrollToAnchor } from './anchor';

export interface RelatedItem {
  label: string;
  /** Screen under the character base ('' = Home). */
  path: string;
  /** Section on that screen: an element id or aria-label. */
  anchor?: string;
}

/** A small row of suggestions. It never moves anyone on its own; each link is a plain choice. */
export function Related({ items }: { items: readonly RelatedItem[] }) {
  const base = useCharacterBase();
  return (
    <nav aria-label="Related" className="flex flex-wrap items-center gap-x-1 text-xs">
      <span className="text-text-muted">Related:</span>
      {items.map((item) => (
        <Link
          key={item.label}
          to={navPath(base, item.path)}
          onClick={() => item.anchor && scrollToAnchor(item.anchor)}
          className="inline-flex min-h-11 items-center rounded-btn px-2 text-accent hover:underline"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
