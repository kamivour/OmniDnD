import type { CharacterFeature } from '../calc/features';
import type { FeatureDef } from '../schema';
import type { Check, Command, CommandContext } from './runner';
import {
  block,
  economyChecks,
  featureName,
  rangeCheck,
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
function lookup({ sheet }: CommandContext, featureId: string) {
  const feature = sheet.features.find(({ def }) => def.id === featureId);
  const poolId = feature?.def.usesFrom ?? featureId;
  const pool: CharacterFeature | undefined =
    poolId === featureId ? feature : sheet.features.find(({ def }) => def.id === poolId);
  return { feature, pool, poolId };
}

export interface UseFeaturePayload {
  featureId: string;
}

export const useFeature: Command<UseFeaturePayload> = {
  name: 'useFeature',
  check: (ctx, { featureId }) => {
    const { feature, pool, poolId } = lookup(ctx, featureId);
    if (!feature) return [block(`You don't have ${featureName(ctx, featureId)}`)];
    if (feature.def.activation === 'passive') return [block(`${feature.def.name} is passive`)];
    const checks: Check[] = [];
    if (pool?.uses && (ctx.live.featureUsesSpent[poolId] ?? 0) >= pool.uses.max) {
      checks.push(block(`No ${pool.def.name} uses left`));
    }
    const slot = ECONOMY_BY_ACTIVATION[feature.def.activation];
    if (slot) checks.push(...economyChecks(ctx, slot));
    return checks;
  },
  apply: ({ live }, { featureId }, ctx) => {
    const { feature, pool, poolId } = lookup(ctx, featureId);
    const name = feature?.def.name ?? featureId;
    const slot = feature && ECONOMY_BY_ACTIVATION[feature.def.activation];
    if (slot) spendEconomy(live, slot);
    const notes: string[] = [];
    if (pool?.die) notes.push(pool.die);
    if (pool?.uses) {
      const spent = (live.featureUsesSpent[poolId] ?? 0) + 1;
      live.featureUsesSpent[poolId] = spent;
      notes.push(
        poolId === featureId
          ? `${pool.uses.max - spent}/${pool.uses.max} left`
          : usesLeft(pool.def.name, spent, pool.uses.max),
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
    const { pool } = lookup(ctx, featureId);
    if (!pool?.uses) return [block(`${featureName(ctx, featureId)} has no limited uses`)];
    return rangeCheck('Spent uses', spent, 0, pool.uses.max);
  },
  apply: ({ live }, { featureId, spent }, ctx) => {
    const { pool, poolId } = lookup(ctx, featureId);
    if (spent === 0) delete live.featureUsesSpent[poolId];
    else live.featureUsesSpent[poolId] = spent;
    const max = pool?.uses?.max ?? 0;
    return `${pool?.def.name ?? poolId}: ${max - spent}/${max} left`;
  },
};
