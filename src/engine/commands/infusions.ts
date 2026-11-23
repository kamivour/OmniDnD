import { z } from 'zod';
import { attunedItems } from '../calc/attunement';
import { DamageTypeSchema } from '../schema/common';
import {
  activeInfusions,
  artificerLevel,
  INFUSIONS,
  HOMUNCULUS_INFUSION,
  infusionFits,
  infusionKey,
  infusionLimit,
  infusionMinimumLevel,
  isResistantArmorType,
  magicalItem,
} from '../calc/infusions';
import { replicaFits, replicaItem } from '../calc/infusion-replicas';
import { companionStats, freshCompanionLive } from '../calc/companions';
import { homunculusServant } from '../calc/homunculus';
import { storageWarnings } from './inventory';
import { block, deadCheck, info, warn, withNotes } from './shared';
import type { CharacterData, Command, CommandContext } from './runner';

type Application = NonNullable<CharacterData['live']['infusions']>[number];

export function endInfusionIn({ build, live }: CharacterData, entry: Application): string[] {
  const { instanceId, replicaBaseItemId, companionId } = entry;
  live.infusions = live.infusions?.filter((row) => row.instanceId !== instanceId);
  const state = live.items[instanceId];
  if (state) state.attuned = false;
  if (companionId) {
    const companion = live.companions?.[companionId];
    if (companion?.status === 'active') {
      companion.status = 'dismissed';
      companion.conditions = [];
      companion.tempHp = 0;
      delete companion.endsAt;
    }
    return ['Homunculus vanished; its heart remains'];
  }
  if (!replicaBaseItemId) return [];
  const replica = build.items.find((item) => item.instanceId === instanceId);
  if (replica) replica.itemId = replicaBaseItemId;
  if (state) {
    if (entry.replicaBaseCharges === undefined) delete state.charges;
    else state.charges = entry.replicaBaseCharges;
  }
  let moved = 0;
  for (const item of build.items) {
    if (item.container !== instanceId) continue;
    delete item.container;
    moved++;
  }
  return moved ? [`${moved} direct ${moved === 1 ? 'item moved' : 'items moved'} to Carried`] : [];
}

function itemFor(ctx: CommandContext, instanceId: string) {
  const item = ctx.build.items.find((row) => row.instanceId === instanceId);
  const def = item && ctx.registry.entries.get(item.itemId);
  return def?.kind === 'item' ? def : undefined;
}

const Input = z.strictObject({
  featureId: z.string(),
  instanceId: z.string(),
  damageType: DamageTypeSchema.optional(),
  attune: z.boolean().optional(),
  materialConfirmed: z.boolean().optional(),
});
export const infuseItem: Command<z.infer<typeof Input>> = {
  name: 'infuseItem',
  check: (ctx, input) => {
    const parsed = Input.safeParse(input);
    if (!parsed.success) return [block('Infusion details are invalid')];
    const { featureId, instanceId, damageType, attune, materialConfirmed } = parsed.data;
    if (['__proto__', 'constructor', 'prototype'].includes(instanceId))
      return [block('Use a new inventory entry for this item')];
    const key = infusionKey(featureId),
      rule = INFUSIONS[key];
    const replica = replicaItem(ctx.registry, featureId);
    const homunculus = featureId === HOMUNCULUS_INFUSION;
    if (
      (!rule && !replica && !homunculus) ||
      artificerLevel(ctx.build) < infusionMinimumLevel(featureId) ||
      !ctx.build.featureIds.includes(featureId)
    )
      return [block('Choose an infusion you know and meet the level requirement for')];
    const def = itemFor(ctx, instanceId);
    if (
      !def ||
      ctx.live.items[instanceId]?.qty !== 1 ||
      !(replica ? replicaFits(replica, def) : homunculus || infusionFits(key, def))
    )
      return [
        block(
          'Choose one eligible item; split stacked items into separate inventory entries first',
        ),
      ];
    if (magicalItem(def) || ctx.live.infusions?.some((i) => i.instanceId === instanceId))
      return [block('Infusions require a nonmagical item with no existing infusion')];
    if (homunculus && !materialConfirmed)
      return [block('Confirm that the heart is a gem or crystal worth at least 100 gp')];
    if (key === 'resistant-armor' && (!damageType || !isResistantArmorType(damageType)))
      return [block('Choose an eligible damage type for Resistant Armor')];
    if (damageType && key !== 'resistant-armor')
      return [block('This infusion has no damage choice')];
    const current = activeInfusions(ctx.build, ctx.live);
    if (current.length > infusionLimit(ctx.build))
      return [
        block('More infused items than your current limit. Record the ended infusions first.'),
      ];
    if (current.some((i) => i.featureId === featureId))
      return [
        block(
          'This infusion is already on an item. Record its ending before applying it elsewhere',
        ),
      ];
    const checks = homunculus ? [...deadCheck(ctx)] : [];
    if (
      ctx.live.lastLongRestEnd === undefined ||
      ctx.live.clock.seconds !== ctx.live.lastLongRestEnd
    )
      checks.push(
        warn('Infuse items when finishing a long rest. Confirm this was completed at the table.'),
      );
    if (current.length >= infusionLimit(ctx.build))
      checks.push(warn('At your infusion limit: the oldest infusion will end.'));
    const replaced = current.length >= infusionLimit(ctx.build) ? current[0] : undefined;
    const bonds = attunedItems(ctx).filter(({ instanceId }) => instanceId !== replaced?.instanceId);
    if (
      attune &&
      (rule?.attunement || replica?.attunement) &&
      !ctx.live.items[instanceId]?.attuned &&
      bonds.length >= ctx.sheet.attunementLimit
    )
      return [block('No attunement slots left; end a bond or infuse without attuning')];
    if (attune && replica?.attunement && bonds.some(({ itemId }) => itemId === replica.id))
      return [block(`Already attuned to another copy of ${replica.name}`)];
    if (replica) {
      checks.push(info('Confirm that the base item matches this recipe.'));
      checks.push(
        ...storageWarnings(ctx, {
          instanceId,
          quantity: 1,
          container: undefined,
          replacementId: replica.id,
        }),
      );
    }
    return checks;
  },
  apply: (draft, input, ctx) => {
    const { live, build } = draft;
    const current = activeInfusions(ctx.build, ctx.live);
    const ended = current.length >= infusionLimit(ctx.build) ? current[0] : undefined;
    const notes = ended ? ['oldest infusion ended', ...endInfusionIn(draft, ended)] : [];
    const item = build.items.find(({ instanceId }) => instanceId === input.instanceId)!;
    const replica = replicaItem(ctx.registry, input.featureId);
    const homunculus = input.featureId === HOMUNCULUS_INFUSION;
    const baseId = item.itemId;
    const baseCharges = live.items[input.instanceId]?.charges;
    if (replica) {
      item.itemId = replica.id;
      delete live.items[input.instanceId]!.charges;
    }
    let companionId: string | undefined;
    if (homunculus) {
      const root = `homunculus:${ctx.eventId}`;
      companionId = root;
      let suffix = 2;
      while (build.companions?.some(({ id }) => id === companionId))
        companionId = `${root}:${suffix++}`;
      const companion = homunculusServant(companionId);
      const { maxHp } = companionStats(companion, ctx);
      build.companions ??= [];
      build.companions.push(companion);
      live.companions ??= {};
      live.companions[companionId] = freshCompanionLive(maxHp);
    }
    live.infusions = [
      ...(live.infusions ?? []),
      {
        featureId: input.featureId,
        instanceId: input.instanceId,
        ...(input.damageType ? { damageType: input.damageType } : {}),
        ...(replica ? { replicaBaseItemId: baseId } : {}),
        ...(replica && baseCharges !== undefined ? { replicaBaseCharges: baseCharges } : {}),
        ...(companionId ? { companionId } : {}),
      },
    ];
    const attunement = INFUSIONS[infusionKey(input.featureId)]?.attunement || replica?.attunement;
    if (replica || (attunement && input.attune))
      live.items[input.instanceId]!.attuned = !!(attunement && input.attune);
    const name = ctx.registry.get('item', baseId).name;
    return withNotes(`${ctx.registry.get('feature', input.featureId).name}: ${name}`, notes);
  },
};

export const endInfusion: Command<{ instanceId: string }> = {
  name: 'endInfusion',
  check: (ctx, input) =>
    !input ||
    typeof input.instanceId !== 'string' ||
    !ctx.live.infusions?.some((i) => i.instanceId === input.instanceId)
      ? [block('That infusion is unavailable')]
      : [
          warn(
            'Record an infusion ending at the table, such as forgetting it or replacing it at your limit. Resting alone does not end it.',
          ),
        ],
  apply: (draft, { instanceId }, ctx) => {
    const entry = ctx.live.infusions!.find((row) => row.instanceId === instanceId)!;
    return withNotes('Record infusion ended', endInfusionIn(draft, entry));
  },
};
