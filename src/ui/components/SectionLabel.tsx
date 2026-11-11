import type { ReactNode } from 'react';
import { cx } from '../cx';

/** Uppercase section heading ("RESOURCES", "EFFECTS"). */
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
    <Tag className={cx('text-sm font-bold tracking-wide text-text uppercase', className)}>
      {children}
    </Tag>
  );
}
