import { formatDuration } from '../../engine/clock';
import { EFFECT_TRIGGER_LABEL } from '../../engine/commands/effects';
import { SECONDS_PER_ROUND } from '../../engine/rules2014';
import type { ActiveEffect, FeatureDefenses, LiveState } from '../../engine/schema';

/** A dependent effect cannot outlast the concentration that keeps it active. */
export function effectDeadline(effect: ActiveEffect, live: LiveState): number | undefined {
  const parent = effect.concentration ? live.concentration?.endsAt : undefined;
  if (effect.endsAt === undefined) return parent;
  return parent === undefined ? effect.endsAt : Math.min(effect.endsAt, parent);
}

/** Display the saved game-time deadline; never start a real-time countdown. */
export function remainingEffectTime(
  endsAt: number | undefined,
  live: Pick<LiveState, 'clock' | 'combat'>,
  untimed = 'Until removed',
): string {
  if (endsAt === undefined) return untimed;
  const seconds = Math.max(0, endsAt - live.clock.seconds);
  if (seconds === 0) return 'Expired';
  if (!live.combat) return `${formatDuration(seconds)} left`;
  const rounds = Math.ceil(seconds / SECONDS_PER_ROUND);
  return `${rounds} ${rounds === 1 ? 'round' : 'rounds'} left`;
}

/** Remaining time plus any turn or rest trigger, for the effect list. */
export function effectTimingText(effect: ActiveEffect, live: LiveState): string {
  const deadline = effectDeadline(effect, live);
  const trigger = effect.endsOn ? EFFECT_TRIGGER_LABEL[effect.endsOn.event] : undefined;
  if (!trigger) return remainingEffectTime(deadline, live);
  if (deadline === undefined) return trigger.charAt(0).toUpperCase() + trigger.slice(1);
  return `${remainingEffectTime(deadline, live)}, or ${trigger}`;
}

const DEFENSE_LABEL = {
  resistances: 'Resistant',
  immunities: 'Immune',
  vulnerabilities: 'Vulnerable',
} as const;

/** Damage defenses from features and current effects, as short reminder lines. */
export function damageDefenseLines(
  sources: readonly { defenses?: FeatureDefenses | undefined }[],
): string[] {
  return (Object.keys(DEFENSE_LABEL) as (keyof typeof DEFENSE_LABEL)[]).flatMap((kind) => {
    const types = [...new Set(sources.flatMap(({ defenses }) => defenses?.[kind] ?? []))];
    return types.length > 0 ? [`${DEFENSE_LABEL[kind]}: ${types.join(', ')}`] : [];
  });
}
