import { Star } from 'lucide-react';
import { StatsLink } from '../companions/StatsLink';
import { useRef, useState } from 'react';
import { registry } from '../../data/registry';
import { overridePath } from '../../engine/calc/value-overrides';
import { adjustFeatureUses, setQuickAccessFavorite, useFeature } from '../../engine/commands';
import { useCommand } from '../commands/command-context';
import { PipStepper } from '../components/PipStepper';
import { resourceOverride } from '../components/resource-override';
import { cx } from '../cx';
import { featuresModel, type FeatureEntry } from '../features/features-model';
import { useCharacter } from '../hooks/useCharacter';

const TEXT_PREVIEW_CHARS = 220;

function FeatureText({ entry }: { entry: FeatureEntry }) {
  const [open, setOpen] = useState(false);
  const text = entry.lines.join('\n\n');
  if (!text) return null;
  const long = text.length > TEXT_PREVIEW_CHARS;
  return (
    <div className="flex flex-col items-start gap-1">
      <p
        className={cx('whitespace-pre-line text-sm wrap-anywhere', long && !open && 'line-clamp-3')}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? 'Show less' : 'Show full text'}: ${entry.name}`}
          onClick={() => setOpen(!open)}
          className="min-h-11 text-sm text-accent"
        >
          {open ? 'Show less' : 'Show full text'}
        </button>
      )}
    </div>
  );
}

function FeatureUses({ entry }: { entry: FeatureEntry }) {
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const pool = entry.ownPool!;
  const overdrawn = pool.used > pool.max;
  const override = resourceOverride(
    state.build,
    sheet,
    overridePath('features', entry.id, 'uses', 'max'),
    overridePath('features', entry.id, 'uses', 'remaining'),
    pool.used,
    pool.max,
  );
  const adjust = (spent: number) => run(adjustFeatureUses, { featureId: entry.id, spent });
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm text-text-muted">
          {Math.max(0, pool.max - pool.used)} of {pool.max} left · {pool.recharge}
        </span>
        <PipStepper
          label={entry.name}
          max={pool.max}
          used={pool.used}
          tone="accent"
          disabled={overdrawn}
          override={override}
          onUse={() => adjust(pool.used + 1)}
          onRestore={() => adjust(pool.used - 1)}
        />
      </div>
      {overdrawn && (
        <div className="text-xs text-warn">
          <p>
            Saved spending is {pool.used}; current maximum is {pool.max}. Correct spending to{' '}
            {pool.max} before ordinary adjustments.
          </p>
          <button
            type="button"
            aria-label={`Correct ${entry.name} spending`}
            onClick={() => adjust(pool.max)}
            className="min-h-11 rounded-btn px-2 text-sm text-accent"
          >
            Correct spending
          </button>
        </div>
      )}
    </div>
  );
}

function FeatureCardRow({ entry }: { entry: FeatureEntry }) {
  const { run } = useCommand();
  const useButton = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLElement>(null);
  const meta = [entry.from, entry.activation, entry.die].filter(Boolean).join(' · ');
  return (
    <article
      ref={card}
      tabIndex={-1}
      aria-label={entry.name}
      className="flex min-w-0 flex-col gap-2 rounded-card border border-border bg-surface p-3"
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold wrap-anywhere">{entry.name}</h3>
          <p className="text-xs text-text-muted">{meta}</p>
        </div>
        <button
          type="button"
          aria-label={`Favorite ${entry.name}`}
          aria-pressed={entry.favorite}
          onClick={() =>
            run(setQuickAccessFavorite, { refId: entry.id, favorite: !entry.favorite })
          }
          className={cx(
            'hover-lift grid size-11 shrink-0 place-items-center rounded-btn border border-transparent hover:text-accent',
            entry.favorite ? 'text-accent' : 'text-text-muted',
          )}
        >
          <Star aria-hidden className="size-5" fill={entry.favorite ? 'currentColor' : 'none'} />
        </button>
      </div>
      {entry.automatic && <p className="text-xs text-accent">Already counted on your sheet.</p>}
      {entry.trigger && <p className="text-sm">Trigger: {entry.trigger}</p>}
      <FeatureText entry={entry} />
      {entry.ownPool && <FeatureUses entry={entry} />}
      {entry.sharedPool && (
        <p className="text-sm text-text-muted">
          Spends {entry.sharedPool.name}: {entry.sharedPool.remaining} of {entry.sharedPool.max}{' '}
          left
        </p>
      )}
      {entry.usable && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            ref={useButton}
            type="button"
            disabled={!!entry.unavailableReason}
            onClick={(event) => {
              event.currentTarget.focus();
              run(useFeature, { featureId: entry.id }, card.current ?? undefined, () =>
                requestAnimationFrame(() => {
                  if (useButton.current?.matches(':disabled')) card.current?.focus();
                }),
              );
            }}
            className="min-h-11 rounded-btn border border-border px-3 text-sm text-accent disabled:opacity-40"
          >
            Use {entry.name}
          </button>
          <StatsLink refId={entry.id} name={entry.name} />
          {entry.unavailableReason && (
            <span className="text-xs text-warn">{entry.unavailableReason}</span>
          )}
        </div>
      )}
    </article>
  );
}

export function FeaturesScreen() {
  const { state, sheet } = useCharacter();
  const groups = featuresModel(state, sheet, registry);
  return (
    <div className="mx-auto flex min-w-0 max-w-5xl flex-col gap-6 px-4 py-4 lg:px-6">
      <header>
        <h1 className="font-display text-xl">Features</h1>
        <p className="mt-2 text-sm text-text-muted">
          What your race, class, background and build give you. Passive bonuses already count on
          your sheet; Use records the cost and outcomes stay at the table.
        </p>
      </header>
      {groups.length === 0 && (
        <p className="text-sm text-text-muted">This character has no features recorded.</p>
      )}
      {groups.map((group) => (
        <section
          key={group.origin}
          aria-label={group.title}
          className="flex min-w-0 flex-col gap-3"
        >
          <h2 className="font-display text-base">{group.title}</h2>
          <div className="grid min-w-0 gap-3 @min-[680px]:grid-cols-2">
            {group.entries.map((entry) => (
              <FeatureCardRow key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
