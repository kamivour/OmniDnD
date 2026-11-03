import { useRef } from 'react';
import { registry } from '../../data/registry';
import { adjustFeatureUses, adjustHitDice, adjustSlot } from '../../engine/commands';
import { useCommand } from '../commands/command-context';
import { ResourceCard } from '../components/cards';
import { PipStepper } from '../components/PipStepper';
import { Preview } from '../components/Preview';
import { useCharacter } from '../hooks/useCharacter';
import { useDetail } from '../layout/detail-context';
import { dashboardResources, type DashboardResource } from './dashboard-model';

/** A pinned description retains only its identity and re-reads current pool values. */
export function LiveResourceDetail({ resourceKey }: { resourceKey: string }) {
  const { state, sheet } = useCharacter();
  const resource = dashboardResources(state, sheet, registry)
    .flatMap(({ items }) => items)
    .find(({ key }) => key === resourceKey);
  if (!resource)
    return <p className="text-sm text-text-muted">This resource is no longer available.</p>;
  return (
    <ResourceCard
      title={resource.name}
      max={resource.max}
      used={resource.used}
      lines={resource.lines}
    />
  );
}

export function DashboardResourceRow({ resource: resource }: { resource: DashboardResource }) {
  const { run } = useCommand();
  const { pin } = useDetail();
  const label = useRef<HTMLButtonElement | null>(null);
  const overdrawn = resource.used > resource.max;
  const adjust = (used: number) => {
    const control = document.activeElement;
    const applied = () =>
      requestAnimationFrame(() => {
        if (overdrawn || (control instanceof HTMLElement && control.matches(':disabled')))
          label.current?.focus();
      });
    if (resource.kind === 'slot')
      run(adjustSlot, { level: resource.level, used }, label.current ?? undefined, applied);
    else if (resource.kind === 'feature')
      run(
        adjustFeatureUses,
        { featureId: resource.featureId, spent: used },
        label.current ?? undefined,
        applied,
      );
    else
      run(adjustHitDice, { die: resource.die, spent: used }, label.current ?? undefined, applied);
  };
  return (
    <li
      className="flex min-w-0 flex-col gap-1"
      onClickCapture={(event) => {
        if (event.target instanceof Element)
          event.target.closest<HTMLButtonElement>('button')?.focus();
      }}
    >
      <div className="flex min-h-11 min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <Preview
          title={resource.name}
          content={<LiveResourceDetail resourceKey={resource.key} />}
          onPin={() => pin(<LiveResourceDetail resourceKey={resource.key} />)}
        >
          {({ ref, props }) => (
            <button
              ref={(node) => {
                label.current = node;
                ref(node);
              }}
              type="button"
              {...props}
              className="min-h-11 min-w-24 flex-1 wrap-anywhere text-left text-sm text-text underline decoration-text-muted decoration-dotted underline-offset-4"
            >
              {resource.label}
            </button>
          )}
        </Preview>
        <PipStepper
          label={resource.name}
          max={resource.max}
          used={resource.used}
          tone={resource.tone}
          disabled={overdrawn}
          onUse={() => adjust(resource.used + 1)}
          onRestore={() => adjust(resource.used - 1)}
        />
      </div>
      {overdrawn && (
        <div className="text-xs text-warn">
          <p>
            Saved spending is {resource.used}; current maximum is {resource.max}. Correct spending
            to {resource.max} before ordinary adjustments.
          </p>
          <button
            type="button"
            aria-label={`Correct ${resource.name} spending`}
            onClick={() => adjust(resource.max)}
            className="min-h-11 rounded-btn px-2 text-sm text-accent"
          >
            Correct spending
          </button>
        </div>
      )}
    </li>
  );
}
