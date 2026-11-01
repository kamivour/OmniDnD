import type { ReactNode } from 'react';
import { cx } from '../cx';

/** Small uppercase section heading ("RESOURCES", "EFFECTS"). */
export function SectionLabel({
  children,
  as: Tag = 'h2',
  className,
}: {
  children: ReactNode;
  as?: 'h2' | 'h3';
  className?: string;
}) {
  return (
    <Tag className={cx('text-xs font-semibold tracking-wide text-text-muted uppercase', className)}>
      {children}
    </Tag>
  );
}
