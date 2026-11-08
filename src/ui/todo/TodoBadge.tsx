import { ListTodo } from 'lucide-react';
import { Link } from 'react-router';
import { useTodo } from './useTodo';

/** Shows how many decisions are waiting and opens the list. Renders nothing when there are none. */
export function TodoBadge({ className = '' }: { className?: string }) {
  const { characterId, open } = useTodo();
  if (open.length === 0) return null;
  return (
    <Link
      to={`/characters/${characterId}/todo`}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-btn border border-accent bg-surface px-3 text-xs text-accent ${className}`}
    >
      <ListTodo size={14} aria-hidden />
      To do
      <span className="font-semibold">{open.length}</span>
    </Link>
  );
}
