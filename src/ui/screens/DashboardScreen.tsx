import { useState } from 'react';
import { registry } from '../../data/registry';
import { ABILITIES } from '../../engine/calc/abilities';
import { DashboardQuickAccess } from '../dashboard/DashboardQuickAccess';
import { DashboardResourceRow } from '../dashboard/DashboardResources';
import { dashboardResources } from '../dashboard/dashboard-model';
import { SectionLabel } from '../components/SectionLabel';
import { LiveEffects } from '../effects/LiveEffects';
import { signed } from '../format';
import { useCharacter } from '../hooks/useCharacter';
import { HudAdjustments } from '../layout/HudAdjustments';
import { RecentCharacterLog } from '../log/CharacterLog';
import { GameClockControl } from '../time/GameClockControl';

/** Frame A: the same saved character, engine numbers and commands used by every live screen. */
export function DashboardScreen() {
  const { state, sheet } = useCharacter();
  const [statusAnchor, setStatusAnchor] = useState<HTMLElement | null>(null);
  const [editingConditions, setEditingConditions] = useState(false);
  const groups = dashboardResources(state, sheet, registry);
  const passives = [
    { label: 'Perception', value: sheet.passives.perception.value },
    { label: 'Investigation', value: sheet.passives.investigation.value },
    { label: 'Insight', value: sheet.passives.insight.value },
  ];
  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-4 lg:px-6">
      <h1 className="sr-only">Home</h1>
      <div className="flex min-w-0 flex-col gap-6">
        <GameClockControl />
        <div className="grid min-w-0 gap-6 @min-[680px]:grid-cols-2">
          <section aria-label="Resources" className="flex min-w-0 flex-col gap-4">
            {groups.map((group) => (
              <div key={group.title} className="flex min-w-0 flex-col gap-1">
                <SectionLabel>{group.title}</SectionLabel>
                {group.items.length === 0 ? (
                  <p className="text-sm text-text-muted">None</p>
                ) : (
                  <ul className="flex min-w-0 flex-col gap-1">
                    {group.items.map((resource) => (
                      <DashboardResourceRow key={resource.key} resource={resource} />
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
          <div className="flex min-w-0 flex-col gap-6">
            <LiveEffects />
            <section aria-label="Conditions" className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>Conditions</SectionLabel>
                <button
                  type="button"
                  onClick={(event) => {
                    setStatusAnchor(event.currentTarget);
                    setEditingConditions(true);
                  }}
                  className="min-h-11 rounded-btn border border-border bg-surface px-3 text-sm text-text"
                >
                  Edit conditions
                </button>
              </div>
              {sheet.conditions.length === 0 ? (
                <p className="text-sm text-text-muted">None</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {sheet.conditions.map((condition) => {
                    const sources = state.live.effects
                      .filter((effect) => effect.conditions.includes(condition))
                      .map(({ name }) => name);
                    return (
                      <li key={condition} className="text-sm text-text">
                        <span className="capitalize">{condition}</span>
                        <span className="block wrap-anywhere text-xs text-text-muted">
                          {[
                            state.live.conditions.includes(condition) && 'Manual',
                            ...sources.map((name) => `Effect: ${name}`),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-sm text-text-muted">Exhaustion (2014): {state.live.exhaustion}</p>
              {state.live.effects.some(({ conditions }) => conditions.length > 0) && (
                <p className="text-xs text-text-muted">
                  Effect-granted conditions remain until their source ends. Edit changes your manual
                  condition toggles.
                </p>
              )}
            </section>
          </div>
        </div>
        <DashboardQuickAccess />
        <section aria-label="Abilities" className="flex flex-col gap-2">
          <SectionLabel>Abilities</SectionLabel>
          <ul className="grid grid-cols-3 gap-2 @min-[640px]:grid-cols-6">
            {ABILITIES.map((ability) => (
              <li
                key={ability}
                className="flex min-w-0 flex-col items-center rounded-card border border-border bg-surface py-2"
              >
                <span className="text-xs text-text-muted">{ability}</span>
                <span className="text-lg font-semibold text-text">
                  {signed(sheet.abilities[ability].mod)}
                </span>
                <span className="text-xs text-text-muted">
                  Score {sheet.abilities[ability].score.value}
                </span>
                <span className="text-xs text-text-muted">
                  Save {signed(sheet.saves[ability].value)}
                  {sheet.saves[ability].proficient ? ' · proficient' : ''}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-text-muted">
            Passive{' '}
            {passives.map((passive, index) => (
              <span key={passive.label}>
                {index > 0 && ' · '}
                {passive.label} <span className="font-semibold text-text">{passive.value}</span>
              </span>
            ))}
          </p>
        </section>
        <RecentCharacterLog />
      </div>
      <HudAdjustments
        selection={editingConditions ? 'status' : null}
        anchor={statusAnchor}
        onClose={() => setEditingConditions(false)}
      />
    </div>
  );
}
