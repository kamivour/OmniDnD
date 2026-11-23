import { featureResource, writeFeatureResource, type CharacterFeature } from '../calc/features';
import { DEFENSIVE_FIELD } from '../calc/arcane-armor';
import {
  BLADESONG,
  BLADESONG_SECONDS,
  bladesongRestriction,
  hasBladesong,
} from '../calc/bladesong';
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
  timeRangeChecks,
  uniqueEffectId,
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
  /** Added to the die roll (Quickened Healing: proficiency bonus; Healer: 4). */
  dieBonus?: number;
  /** Temporary HP the feature grants you (Inspiring Leader: level + CHA modifier). */
  tempHp?: number;
  unavailableReason?: string;
}

/** The same resolved resource data drives display and commands, including shared-use features. */
export function featureUseDetails(
  ctx: Pick<CommandContext, 'live' | 'sheet'>,
  featureId: string,
): FeatureUseDetails {
  const { feature, pool, poolId } = lookup(ctx, featureId);
  const uses = featureResource(ctx.sheet.features, ctx.live, poolId);
  const cost = feature?.def.cost ?? 1;
  const alsoId = feature?.def.alsoSpends;
  const alsoFeature = alsoId ? ctx.sheet.features.find(({ def }) => def.id === alsoId) : undefined;
  const alsoUses = alsoFeature && featureResource(ctx.sheet.features, ctx.live, alsoFeature.def.id);
  const also = alsoFeature && alsoUses ? { feature: alsoFeature, uses: alsoUses } : undefined;
  const restores = feature?.def.restoresUseOf;
  const restoreSpent = restores
    ? featureResource(ctx.sheet.features, ctx.live, restores)?.spent
    : undefined;
  const die = feature?.die ?? pool?.die;
  const bonusDef = feature?.def.dieBonus;
  const dieBonus = bonusDef === 'proficiency' ? ctx.sheet.proficiency : bonusDef;
  const tempHpDef = feature?.def.tempHp;
  const tempHp =
    featureId === DEFENSIVE_FIELD
      ? feature?.level
      : tempHpDef
        ? Math.max(1, feature!.level + ctx.sheet.abilities[tempHpDef.abilityMod].mod)
        : undefined;
  let unavailableReason: string | undefined;
  if (!feature) unavailableReason = 'You do not have this feature';
  else if (isDead(ctx.live)) unavailableReason = 'You are dead';
  else if (feature.def.activation === 'passive')
    unavailableReason = `${feature.def.name} is passive`;
  else if (featureId === BLADESONG && hasBladesong(ctx.live))
    unavailableReason = 'Bladesong is already active';
  else if (featureId === DEFENSIVE_FIELD && ctx.sheet.arcaneArmor?.model !== 'guardian')
    unavailableReason = 'Wear Guardian Arcane Armor to use Defensive Field';
  else if ((feature.def.usesFrom && !pool?.uses) || (alsoId && !also))
    unavailableReason = `${feature.def.name}'s required resource pool is unavailable`;
  else if (uses?.remaining === 0) unavailableReason = `No ${pool!.def.name} uses left`;
  else if (uses && uses.remaining < cost)
    unavailableReason = `Needs ${cost} ${pool!.def.name}; ${uses.remaining} left`;
  else if (also?.uses.remaining === 0) unavailableReason = `No ${also.feature.def.name} uses left`;
  else if (restores && !restoreSpent) unavailableReason = 'No spent use to recover';
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
    ...(tempHp !== undefined ? { tempHp } : {}),
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
const GUARDED_MIND = 'feature.fighter.psi-warrior-guarded-mind-end';
const endsWithGuardedMind = (condition: string) =>
  condition === 'charmed' || condition === 'frightened';

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
    if (featureId === GUARDED_MIND && !ctx.sheet.conditions.some(endsWithGuardedMind))
      checks.push(block('You are neither charmed nor frightened'));
    if (featureId === BLADESONG) {
      const restriction = bladesongRestriction(ctx.build, ctx.live, ctx.registry);
      if (restriction) checks.push(block(`Cannot start Bladesong while ${restriction}`));
      checks.push(...timeRangeChecks(ctx.live.clock.seconds, BLADESONG_SECONDS));
    }
    if (feature.def.concentration && ctx.live.concentration)
      checks.push(
        warn(
          `${feature.def.name} needs concentration; this ends concentration on ${ctx.registry.get('spell', ctx.live.concentration.spellId).name}`,
        ),
      );
    const itemId = feature.def.needsItem;
    if (
      itemId &&
      !ctx.build.items.some(
        (item) => item.itemId === itemId && (ctx.live.items[item.instanceId]?.qty ?? 1) > 0,
      )
    )
      checks.push(warn(`No ${ctx.registry.get('item', itemId).name} carried`));
    const { tempHp } = featureUseDetails(ctx, featureId);
    if (tempHp !== undefined && ctx.live.tempHp > tempHp)
      checks.push(
        warn(
          `Temp HP don't stack: you have ${ctx.live.tempHp}, more than ${tempHp}; you keep yours`,
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
    const { feature, pool, poolId, uses, cost, also, die, dieBonus, tempHp } = featureUseDetails(
      ctx,
      featureId,
    );
    const name = feature?.def.name ?? featureId;
    const slot = feature && ECONOMY_BY_ACTIVATION[feature.def.activation];
    if (slot) spendEconomy(live, slot);
    const notes: string[] = [];
    if (featureId === GUARDED_MIND) {
      live.conditions = live.conditions.filter((condition) => !endsWithGuardedMind(condition));
      live.effects = live.effects.filter((effect) => !effect.conditions.some(endsWithGuardedMind));
      notes.push('charm and fear ended');
    }
    if (featureId === BLADESONG) {
      live.effects.push({
        id: uniqueEffectId(live, BLADESONG),
        name,
        sourceId: BLADESONG,
        endsAt: live.clock.seconds + BLADESONG_SECONDS,
        concentration: false,
        conditions: [],
        modifiers: [
          { target: 'ac', value: { abilityMod: 'INT', min: 1 } },
          { target: 'speed', value: 10 },
        ],
      });
      notes.push('active for 1 min');
    }
    if (feature?.def.dropToOne) {
      live.hp = 1;
      resetDeathSaves(live);
      removeCondition(live, 'unconscious');
      notes.push('back up at 1 HP');
    }
    if (die) notes.push(dieBonus === undefined ? die : `${die} + ${dieBonus}`);
    if (tempHp !== undefined) {
      if (live.tempHp >= tempHp) notes.push(`you keep your ${live.tempHp} temp HP`);
      else {
        live.tempHp = tempHp;
        if (featureId === DEFENSIVE_FIELD)
          live.defensiveFieldArmorId = ctx.sheet.arcaneArmor!.instanceId;
        else delete live.defensiveFieldArmorId;
        notes.push(`you gain ${tempHp} temp HP`);
      }
    }
    if (feature?.def.useNote) notes.push(feature.def.useNote);
    if (feature?.def.concentration) {
      const ended = dropConcentration(live, ctx.registry);
      notes.push(ended ? `concentration on ${ended} ended` : 'concentration');
    }
    if (feature?.def.stationary && live.combat) {
      live.combat.economy.speedZero = true;
      notes.push('speed 0 this turn');
    }
    if (feature?.def.restoreSlot) {
      const level = restoredLevel(ctx, slotLevel)!;
      live.slotsUsed[level] = Math.max(0, (live.slotsUsed[level] ?? 0) - 1);
      notes.push(`regained a level ${level} slot`);
    }
    const restores = feature?.def.restoresUseOf;
    if (restores) {
      const spent = featureResource(ctx.sheet.features, live, restores)?.spent ?? 0;
      writeFeatureResource(ctx.sheet.features, live, restores, spent - 1);
      notes.push(`recovered one use of ${featureName(ctx, restores)}`);
    }
    // Action Surge grants one more action this turn, with a fresh Attack action.
    if (featureId === ACTION_SURGE && live.combat?.economy.actionUsed) {
      live.combat.economy.actionUsed = false;
      delete live.combat.economy.attacksMade;
      notes.push('action ready again');
    }
    if (also) {
      const spent = also.uses.spent + 1;
      writeFeatureResource(ctx.sheet.features, live, also.feature.def.id, spent);
      notes.push(usesLeft(also.feature.def.name, spent, also.uses.max));
    }
    if (uses) {
      const spent = uses.spent + (cost ?? 1);
      writeFeatureResource(ctx.sheet.features, live, poolId, spent);
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
    writeFeatureResource(ctx.sheet.features, live, poolId, spent);
    const max = uses?.max ?? 0;
    return `${pool?.def.name ?? poolId}: ${max - spent}/${max} left`;
  },
};
