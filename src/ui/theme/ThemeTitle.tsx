import { cx } from '../cx';

/**
 * The "OmniDnD" wordmark. Each theme styles it in its own CSS file (`.omni-title`, plus the
 * decorative `.omni-title-fx` layer on top, whose ::before can repeat the letters for glow or
 * frost); it only moves at the full effect level.
 */
export function ThemeTitle({ className }: { className?: string }) {
  return (
    <span className={cx('omni-title font-display text-accent', className)}>
      OmniDnD
      <span aria-hidden className="omni-title-fx" data-text="OmniDnD" />
    </span>
  );
}
