import type { MouseEventHandler, ReactNode } from 'react';
import { cx } from '../cx';
import { Icon } from './Icon';
import { Preview, type PreviewFooter } from './Preview';

interface ActionRowProps {
  iconId: string;
  fallbackIconId?: string;
  name: string;
  /** One short line under the name: to-hit, damage, range, save. */
  meta: ReactNode;
  /** Badges after the name (cost, C, Rit). */
  badges?: ReactNode;
  actionLabel: string;
  onAction: MouseEventHandler<HTMLButtonElement>;
  /** The economy slot this costs is spent. Dims the button; it still works (warns later, D10). */
  spent?: string;
  /** Keep choices reachable while indicating an unavailable resource. */
  unavailable?: boolean;
  /** Box color classes, e.g. the spell's main type (SPELL_TYPES[type].box). */
  tone?: string;
  /** Concentrating on this right now: teal outline and an "Active" badge. */
  concentrating?: boolean;
  preview: { title: string; content: ReactNode; sheetFooter?: PreviewFooter };
  onPin?: () => void;
}

/**
 * Shared row for spells, attacks, features, items. The name area opens the preview;
 * the button on the right does the thing. The popover opens below, never over the button.
 */
export function ActionRow({
  iconId,
  fallbackIconId,
  name,
  meta,
  badges,
  actionLabel,
  onAction,
  spent,
  unavailable,
  tone,
  concentrating,
  preview,
  onPin,
}: ActionRowProps) {
  return (
    <li
      className={cx(
        'flex min-h-14 items-center gap-2 rounded-card border border-border bg-surface pr-2',
        tone,
        concentrating && 'border-magic',
      )}
    >
      <Preview {...preview} onPin={onPin}>
        {({ ref, props }) => (
          <button
            ref={ref}
            type="button"
            {...props}
            className="group flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-card py-2 pl-3 text-left"
          >
            <Icon
              id={iconId}
              fallback={fallbackIconId}
              className="text-text-muted transition-colors duration-(--omni-motion-hover) group-hover:text-accent"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-medium text-text">{name}</span>
                {badges}
                {concentrating && (
                  <span className="shrink-0 rounded-btn bg-magic/15 px-1.5 text-xs leading-5 text-magic">
                    Active
                  </span>
                )}
              </span>
              <span className="block truncate text-xs text-text-muted">{meta}</span>
            </span>
          </button>
        )}
      </Preview>
      <button
        type="button"
        onClick={onAction}
        className={cx(
          'hover-lift min-h-11 shrink-0 rounded-btn border border-border bg-surface-2 px-3 font-semibold text-accent',
          'transition-opacity duration-(--omni-motion-dim)',
          (spent || unavailable) && 'opacity-40',
        )}
      >
        {actionLabel}
        {spent && <span className="sr-only"> ({spent} used)</span>}
      </button>
    </li>
  );
}
