import { Link } from 'react-router';
import { useTodo } from './useTodo';

/** A note on Home when decisions are waiting; it names the first few and links to the list. */
export function TodoBanner() {
  const { characterId, open } = useTodo();
  if (open.length === 0) return null;
  return (
    <section
      aria-label="To do"
      className="flex flex-wrap items-center gap-3 rounded-card border border-accent bg-surface p-3"
    >
      <p className="min-w-0 flex-1 text-sm text-text">
        {open.length === 1 ? '1 choice is waiting: ' : `${open.length} choices are waiting: `}
        <span className="text-text-muted">
          {open
            .slice(0, 3)
            .map((item) => item.label)
            .join(' · ')}
          {open.length > 3 ? ' …' : ''}
        </span>
      </p>
      <Link
        to={`/characters/${characterId}/todo`}
        className="inline-flex min-h-11 items-center rounded-btn border border-border px-3 text-sm text-accent"
      >
        Open list
      </Link>
    </section>
  );
}
