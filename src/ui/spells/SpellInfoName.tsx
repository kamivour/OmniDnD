import type { Registry } from '../../engine/registry';
import { SpellCard } from '../components/cards';
import { Preview } from '../components/Preview';
import { cx } from '../cx';
import { spellView } from './spellbook-model';

/**
 * A spell name that shows the spell card: hover or focus on desktop, tap on phones.
 * Used in pick lists so players can read a spell before choosing it.
 */
export function SpellInfoName({
  spellId,
  registry,
  label,
  className,
}: {
  spellId: string;
  registry: Registry;
  /** Visible text; defaults to the spell name. */
  label?: string;
  className?: string;
}) {
  const def = registry.entries.get(spellId);
  if (def?.kind !== 'spell') return <span className={className}>{label ?? spellId}</span>;
  return (
    <Preview title={def.name} content={<SpellCard spell={spellView(def)} />}>
      {({ ref, props }) => (
        <button
          ref={ref}
          type="button"
          {...props}
          aria-label={`About ${def.name}`}
          className={cx(
            'min-h-11 min-w-0 text-left break-words underline decoration-dotted underline-offset-4 hover:text-accent',
            className,
          )}
        >
          {label ?? def.name}
        </button>
      )}
    </Preview>
  );
}
