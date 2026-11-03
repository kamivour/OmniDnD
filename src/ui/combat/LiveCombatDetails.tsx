import { useRef } from 'react';
import { registry } from '../../data/registry';
import { takeCombatAction, useFeature } from '../../engine/commands';
import { useCommand } from '../commands/command-context';
import { AttackCard, FeatureCard } from '../components/cards';
import { useCharacter } from '../hooks/useCharacter';
import { combatModel } from './combat-model';

const actionButton =
  'min-h-14 w-full rounded-btn bg-accent px-3 font-semibold text-bg disabled:cursor-not-allowed disabled:opacity-40';
interface LiveActionProps {
  showCard?: boolean;
  returnFocusTo?: HTMLElement;
  onApplied?: () => void;
}

export function LiveWeaponDetail({
  instanceId,
  reaction = false,
  showCard = true,
  returnFocusTo,
  onApplied,
}: LiveActionProps & { instanceId: string; reaction?: boolean }) {
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const container = useRef<HTMLDivElement>(null);
  const entry = combatModel(state, sheet, registry).weapons.find(
    (weapon) => weapon.instanceId === instanceId,
  );
  if (!entry) return <p className="text-sm text-text-muted">This weapon is no longer equipped.</p>;
  return (
    <div ref={container} tabIndex={-1} className="flex flex-col gap-4">
      {showCard && <AttackCard attack={entry.attack} />}
      <p className="text-xs text-text-muted">
        Resolve attack rolls, targets and damage at the table.
      </p>
      {!state.live.combat && (
        <p className="text-sm text-text-muted">Start combat to use this attack.</p>
      )}
      <button
        type="button"
        className={actionButton}
        disabled={!state.live.combat}
        onClick={(event) => {
          event.currentTarget.focus();
          run(
            takeCombatAction,
            { action: 'weapon-attack', instanceId, ...(reaction ? { reaction: true } : {}) },
            returnFocusTo ?? container.current ?? undefined,
            onApplied,
          );
        }}
      >
        {reaction ? 'Opportunity Attack' : 'Attack'} with {entry.attack.name}
      </button>
    </div>
  );
}

export function LiveFeatureDetail({
  featureId,
  showCard = true,
  returnFocusTo,
  onApplied,
}: LiveActionProps & { featureId: string }) {
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const container = useRef<HTMLDivElement>(null);
  const entry = combatModel(state, sheet, registry).features.find(
    ({ feature }) => feature.id === featureId,
  );
  if (!entry)
    return <p className="text-sm text-text-muted">This feature is no longer available here.</p>;
  return (
    <div ref={container} tabIndex={-1} className="flex flex-col gap-4">
      {showCard && <FeatureCard feature={entry.feature} remainingUses={entry.remainingUses} />}
      <p className="text-xs text-text-muted">{entry.meta}</p>
      {entry.unavailableReason && <p className="text-xs text-warn">{entry.unavailableReason}</p>}
      <button
        type="button"
        className={actionButton}
        disabled={!!entry.unavailableReason}
        onClick={(event) => {
          const opener = event.currentTarget;
          opener.focus();
          run(useFeature, { featureId }, returnFocusTo ?? container.current ?? undefined, () => {
            onApplied?.();
            if (onApplied) return;
            requestAnimationFrame(() => {
              if (
                opener.matches(':disabled') &&
                container.current?.isConnected &&
                container.current.getClientRects().length
              ) {
                container.current.focus();
              }
            });
          });
        }}
      >
        Use {entry.feature.name}
      </button>
    </div>
  );
}
