import type { ReactNode } from 'react';
import { OctagonAlert, TriangleAlert } from 'lucide-react';
import { cx } from '../cx';

/**
 * A caution: warn colour, an icon and slightly bolder text, so it reads as more than a hint.
 * Use `tone="danger"` only for a blocking error.
 */
export function Caution({
  children,
  tone = 'warn',
  className,
  role,
}: {
  children: ReactNode;
  tone?: 'warn' | 'danger';
  className?: string;
  role?: 'alert' | 'note';
}) {
  const Icon = tone === 'danger' ? OctagonAlert : TriangleAlert;
  return (
    <div
      role={role}
      className={cx(
        'flex items-start gap-2 text-sm font-medium',
        tone === 'danger' ? 'text-danger' : 'text-warn',
        className,
      )}
    >
      <Icon size={16} aria-hidden className="mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
