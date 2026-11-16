import type { CharacterFeature } from '../calc/features';
import type { Die, FeatureDef, Recharge } from '../schema';
import type { Check, Command, CommandContext } from './runner';
import {
  warn,
  block,
  dropConcentration,
  economyChecks,
  featureName,
  isDead,
  rangeCheck,
  removeCondition,
  resetDeathSaves,
  spendEconomy,
  usesLeft,
  type EconomySlot,
} from './shared';

const ECONOMY_BY_ACTIVATION: Partial<Record<FeatureDef['activation'], EconomySlot>> = {
  action: 'action',
  bonus: 'bonus',
  reaction: 'reaction',
};

/**
 * The feature and the feature whose uses it spends: itself, or its `usesFrom` pool
 * (Cutting Words spends Bardic Inspiration).
 */
function lookup({ sheet }: Pick<CommandContext, 'sheet'>, featureId: string) {
  const feature = sheet.features.find(({ def }) => def.id === featureId);
  const poolId = feature?.def.usesFrom ?? featureId;
  const pool: CharacterFeature | undefined =
    poolId === featureId ? feature : sheet.features.find(({ def }) => def.id === poolId);
  return { feature, pool, poolId };
}

type Uses = { max: number; spent: number; remaining: number; recharge: Recharge };

function poolUses(ctx: Pick<CommandContext, 'live'>, pool: CharacterFeature | undefined) {
  if (!pool?.uses) return undefined;
  const spent = ctx.live.featureUsesSpent[pool.def.id] ?? 0;
  const { max, recharge } = pool.uses;
  return { max, spent, remaining: Math.max(0, max - spent), recharge };
}

/** Highest slot level Harness Divine Power may restore: half the proficiency bonus, rounded up. */
export function restoreSlotCap({ sheet }: Pick<CommandContext, 'sheet'>): number {
  return Math.ceil(sheet.proficiency / 2);
}

/** Expended spell slot levels a slot-restoring feature may refill, lowest first. */
export function restorableSlots(ctx: Pick<CommandContext, 'live' | 'sheet'>): number[] {
  const levels: number[] = [];
  for (let level = 1; level <= Math.min(9, restoreSlotCap(ctx)); level++)
    if ((ctx.live.slotsUsed[level] ?? 0) > 0 && (ctx.sheet.slots.max[level] ?? 0) > 0)
      levels.push(level);
  return levels;
}

export interface FeatureUseDetails {
  feature?: CharacterFeature;
  pool?: CharacterFeature;
  poolId: string;
  uses?: Uses;
  /** Pool uses one activation spends (Quickened Healing: 2 ki). */
  cost?: number;
  /** A second pool the feature also spends (Harness Divine Power: Channel Divinity). */
  also?: { feature: CharacterFeature; uses: Uses };
  die?: Die;
  /** Added to the die roll (Quickened Healing: proficiency bonus). */
  dieBonus?: number;
  unavailableReason?: string;
}

/** The same resolved resource data drives display and commands, including shared-use features. */
export function featureUseDetails(
  ctx: Pick<CommandContext, 'live' | 'sheet'>,
  featureId: string,
): FeatureUseDetails {
  const { feature, pool, poolId } = lookup(ctx, featureId);
  const uses = poolUses(ctx, pool);
  const cost = feature?.def.cost ?? 1;
  const alsoId = feature?.def.alsoSpends;
  const alsoFeature = alsoId ? ctx.sheet.features.find(({ def }) => def.id === alsoId) : undefined;
  const alsoUses = poolUses(ctx, alsoFeature);
  const also = alsoFeature && alsoUses ? { feature: alsoFeature, uses: alsoUses } : undefined;
  const die = feature?.die ?? pool?.die;
  const dieBonus = feature?.def.dieBonus === 'proficiency' ? ctx.sheet.proficiency : undefined;
  let unavailableReason: string | undefined;
  if (!feature) unavailableReason = 'You do not have this feature';
  else if (isDead(ctx.live)) unavailableReason = 'You are dead';
  else if (feature.def.activation === 'passive')
    unavailableReason = `${feature.def.name} is passive`;
  else if ((feature.def.usesFrom && !pool?.uses) || (alsoId && !also))
    unavailableReason = `${feature.def.name}'s required resource pool is unavailable`;
  else if (uses?.remaining === 0) unavailableReason = `No ${pool!.def.name} uses left`;
  else if (uses && uses.remaining < cost)
    unavailableReason = `Needs ${cost} ${pool!.def.name}; ${uses.remaining} left`;
  else if (also?.uses.remaining === 0) unavailableReason = `No ${also.feature.def.name} uses left`;
  else if (feature.def.restoreSlot && restorableSlots(ctx).length === 0)
    unavailableReason = `No expended spell slot of level ${restoreSlotCap(ctx)} or lower`;
  else if (feature.def.dropToOne && ctx.live.hp > 0)
    unavailableReason = `${feature.def.name} works only when you drop to 0 HP`;
  return {
    ...(feature ? { feature } : {}),
    ...(pool ? { pool } : {}),
    poolId,
    ...(uses ? { uses } : {}),
    ...(cost > 1 ? { cost } : {}),
    ...(also ? { also } : {}),
    ...(die ? { die } : {}),
    ...(dieBonus !== undefined ? { dieBonus } : {}),
    ...(unavailableReason ? { unavailableReason } : {}),
  };
}

export interface UseFeaturePayload {
  featureId: string;
  /** Slot-restoring features: the expended slot level to regain (default: the highest allowed). */
  slotLevel?: number;
}

function restoredLevel(ctx: Pick<CommandContext, 'live' | 'sheet'>, slotLevel?: number) {
  const levels = restorableSlots(ctx);
  return slotLevel ?? levels[levels.length - 1];
}

const ACTION_SURGE = 'feature.fighter.action-surge';

export const useFeature: Command<UseFeaturePayload> = {
  name: 'useFeature',
  check: (ctx, { featureId, slotLevel }) => {
    const { feature, unavailableReason } = featureUseDetails(ctx, featureId);
    if (!feature) return [block(`You don't have ${featureName(ctx, featureId)}`)];
    if (unavailableReason) return [block(unavailableReason)];
    if (
      feature.def.restoreSlot &&
      slotLevel !== undefined &&
      !restorableSlots(ctx).includes(slotLevel)
    )
      return [block(`Choose an expended slot of level ${restoreSlotCap(ctx)} or lower`)];
    const checks: Check[] = [];
    if (feature.def.concentration && ctx.live.concentration)
      checks.push(
        warn(
          `${feature.def.name} needs concentration; this ends concentration on ${ctx.registry.get('spell', ctx.live.concentration.spellId).name}`,
        ),
      );
    if (feature.def.stationary && (ctx.live.combat?.economy.movementUsed ?? 0) > 0)
      checks.push(warn(`${feature.def.name} works only if you have not moved this turn`));
    if (feature.def.dropToOne) {
      const { success, fail } = ctx.live.deathSaves;
      if (success + fail > 0)
        checks.push(warn('Death saves already recorded; this applies as you drop to 0 HP'));
    }
    const slot = ECONOMY_BY_ACTIVATION[feature.def.activation];
    if (slot) checks.push(...economyChecks(ctx, slot));
    return checks;
  },
  apply: ({ live }, { featureId, slotLevel }, ctx) => {
    const { feature, pool, poolId, uses, cost, also, die, dieBonus } = featureUseDetails(
      ctx,
      featureId,
    );
    const name = feature?.def.name ?? featureId;
    const slot = feature && ECONOMY_BY_ACTIVATION[feature.def.activation];
    if (slot) spendEconomy(live, slot);
    const notes: string[] = [];
    if (feature?.def.dropToOne) {
      live.hp = 1;
      resetDeathSaves(live);
      removeCondition(live, 'unconscious');
      notes.push('back up at 1 HP');
    }
    if (die) notes.push(dieBonus === undefined ? die : `${die} + ${dieBonus}`);
    if (feature?.def.concentration) {
      const ended = dropConcentration(live, ctx.registry);
      notes.push(ended ? `concentration on ${ended} ended` : 'concentration');
    }
    if (feature?.def.stationary && live.combat) {
      const economy = live.combat.economy;
      const speed = ctx.sheet.speed.value * (1 + (economy.dashCount ?? 0));
      economy.movementUsed = Math.max(economy.movementUsed, speed);
      notes.push('speed 0 this turn');
    }
    if (feature?.def.restoreSlot) {
      const level = restoredLevel(ctx, slotLevel)!;
      live.slotsUsed[level] = Math.max(0, (live.slotsUsed[level] ?? 0) - 1);
      notes.push(`regained a level ${level} slot`);
    }
    // Action Surge grants one more action this turn, with a fresh Attack action.
    if (featureId === ACTION_SURGE && live.combat?.economy.actionUsed) {
      live.combat.economy.actionUsed = false;
      delete live.combat.economy.attacksMade;
      notes.push('action ready again');
    }
    if (also) {
      const spent = also.uses.spent + 1;
      live.featureUsesSpent[also.feature.def.id] = spent;
      notes.push(usesLeft(also.feature.def.name, spent, also.uses.max));
    }
    if (uses) {
      const spent = uses.spent + (cost ?? 1);
      live.featureUsesSpent[poolId] = spent;
      notes.push(
        poolId === featureId && !also
          ? `${uses.max - spent}/${uses.max} left`
          : usesLeft(pool!.def.name, spent, uses.max),
      );
    }
    return notes.length > 0 ? `Used ${name} (${notes.join(', ')})` : `Used ${name}`;
  },
};

export interface AdjustFeatureUsesPayload {
  featureId: string;
  /** New number of spent uses of the feature's pool. */
  spent: number;
}

/** Manual correction from the `− / +` steppers. A `usesFrom` feature adjusts its pool. */
export const adjustFeatureUses: Command<AdjustFeatureUsesPayload> = {
  name: 'adjustFeatureUses',
  check: (ctx, { featureId, spent }) => {
    const { uses } = featureUseDetails(ctx, featureId);
    if (!uses) return [block(`${featureName(ctx, featureId)} has no limited uses`)];
    return rangeCheck('Spent uses', spent, 0, uses.max);
  },
  apply: ({ live }, { featureId, spent }, ctx) => {
    const { pool, poolId, uses } = featureUseDetails(ctx, featureId);
    if (spent === 0) delete live.featureUsesSpent[poolId];
    else live.featureUsesSpent[poolId] = spent;
    const max = uses?.max ?? 0;
    return `${pool?.def.name ?? poolId}: ${max - spent}/${max} left`;
  },
};
