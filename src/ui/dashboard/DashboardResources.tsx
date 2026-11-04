import { useRef } from 'react';
import { registry } from '../../data/registry';
import { adjustFeatureUses, adjustHitDice, adjustSlot } from '../../engine/commands';
import { overridePath } from '../../engine/calc/value-overrides';
import { useCommand } from '../commands/command-context';
import { ResourceCard } from '../components/cards';
import { PipStepper } from '../components/PipStepper';
import { Preview } from '../components/Preview';
import { OverrideMarker } from '../components/StatChip';
import { resourceOverride } from '../components/resource-override';
import { useCharacter } from '../hooks/useCharacter';
import { useDetail } from '../layout/detail-context';
import { dashboardResources, type DashboardResource } from './dashboard-model';

function resourcePaths(resource: DashboardResource) {
  if (resource.kind === 'slot')
    return resource.level === 'pact'
      ? { max: '/slots/pact/count', remaining: '/slots/pact/remaining' }
      : {
          max: overridePath('slots', 'max', resource.level),
          remaining: overridePath('slots', 'remaining', resource.level),
        };
  if (resource.kind === 'feature')
    return {
      max: overridePath('features', resource.featureId, 'uses', 'max'),
      remaining: overridePath('features', resource.featureId, 'uses', 'remaining'),
    };
  return {
    max: overridePath('hitDice', resource.die, 'max'),
    remaining: overridePath('hitDice', resource.die, 'remaining'),
  };
}

/** A pinned description retains only its identity and re-reads current pool values. */
export function LiveResourceDetail({ resourceKey }: { resourceKey: string }) {
  const { state, sheet } = useCharacter();
  const resource = dashboardResources(state, sheet, registry)
    .flatMap(({ items }) => items)
    .find(({ key }) => key === resourceKey);
  if (!resource)
    return <p className="text-sm text-text-muted">This resource is no longer available.</p>;
  const paths = resourcePaths(resource);
  const override = resourceOverride(
    state.build,
    sheet,
    paths.max,
    paths.remaining,
    resource.used,
    resource.max,
  );
  const feature =
    resource.kind === 'feature'
      ? sheet.features.find(({ def }) => def.id === resource.featureId)
      : undefined;
  const notes = [
    override?.note,
    feature?.dieOverride ? `Die: ${feature.dieOverride.note}` : undefined,
  ].filter((note) => note !== undefined);
  const annotation = notes.length ? { note: notes.join('; ') } : undefined;
  return (
    <ResourceCard
      title={feature ? resource.label : resource.name}
      max={resource.max}
      used={resource.used}
      lines={[...resource.lines, ...(annotation ? [annotation.note] : [])]}
      override={annotation}
    />
  );
}

export function DashboardResourceRow({ resource: resource }: { resource: DashboardResource }) {
  const { run } = useCommand();
  const { state, sheet } = useCharacter();
  const { pin } = useDetail();
  const label = useRef<HTMLButtonElement | null>(null);
  const overdrawn = resource.used > resource.max;
  const paths = resourcePaths(resource);
  const override = resourceOverride(
    state.build,
    sheet,
    paths.max,
    paths.remaining,
    resource.used,
    resource.max,
  );
  const feature =
    resource.kind === 'feature'
      ? sheet.features.find(({ def }) => def.id === resource.featureId)
      : undefined;
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
              <OverrideMarker override={feature?.dieOverride} />
            </button>
          )}
        </Preview>
        <PipStepper
          label={resource.name}
          max={resource.max}
          used={resource.used}
          tone={resource.tone}
          disabled={overdrawn}
          override={override}
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
