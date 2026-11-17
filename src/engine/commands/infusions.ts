import { z } from 'zod';
import { attunedItems } from '../calc/attunement';
import { DamageTypeSchema } from '../schema/common';
import {
  activeInfusions,
  artificerLevel,
  INFUSIONS,
  infusionFits,
  infusionKey,
  infusionLimit,
  magicalItem,
} from '../calc/infusions';
import { block, warn } from './shared';
import type { Command } from './runner';

const Input = z.strictObject({
  featureId: z.string(),
  instanceId: z.string(),
  damageType: DamageTypeSchema.optional(),
  attune: z.boolean().optional(),
});
export const infuseItem: Command<z.infer<typeof Input>> = {
  name: 'infuseItem',
  check: (ctx, input) => {
    const parsed = Input.safeParse(input);
    if (!parsed.success) return [block('Infusion details are invalid')];
    const { featureId, instanceId, damageType, attune } = parsed.data;
    if (['__proto__', 'constructor', 'prototype'].includes(instanceId))
      return [block('Use a new inventory entry for this item')];
    const key = infusionKey(featureId),
      rule = INFUSIONS[key];
    if (
      !rule ||
      artificerLevel(ctx.build) < rule.level ||
      !ctx.build.featureIds.includes(featureId)
    )
      return [block('Choose an infusion you know and meet the level requirement for')];
    const item = ctx.build.items.find((i) => i.instanceId === instanceId);
    const def = item ? ctx.registry.entries.get(item.itemId) : undefined;
    if (def?.kind !== 'item' || ctx.live.items[instanceId]?.qty !== 1 || !infusionFits(key, def))
      return [
        block(
          'Choose one eligible item; split stacked items into separate inventory entries first',
        ),
      ];
    if (magicalItem(def) || ctx.live.infusions?.some((i) => i.instanceId === instanceId))
      return [block('Infusions require a nonmagical item with no existing infusion')];
    if (
      key === 'resistant-armor' &&
      (!damageType ||
        ['force', 'psychic', 'bludgeoning', 'piercing', 'slashing'].includes(damageType))
    )
      return [block('Choose acid, cold, fire, lightning, necrotic, poison, radiant or thunder')];
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
    const checks = [];
    if (
      ctx.live.lastLongRestEnd === undefined ||
      ctx.live.clock.seconds !== ctx.live.lastLongRestEnd
    )
      checks.push(
        warn('Infuse items when finishing a long rest. Confirm this was completed at the table.'),
      );
    if (current.length >= infusionLimit(ctx.build))
      checks.push(warn('At your infusion limit: the oldest infusion will end.'));
    if (
      attune &&
      rule.attunement &&
      !ctx.live.items[instanceId]?.attuned &&
      attunedItems(ctx).length -
        current
          .slice(0, Math.max(0, current.length - infusionLimit(ctx.build) + 1))
          .filter((i) => ctx.live.items[i.instanceId]?.attuned).length >=
        ctx.sheet.attunementLimit
    )
      return [block('No attunement slots left; end a bond or infuse without attuning')];
    return checks;
  },
  apply: ({ live }, input, ctx) => {
    const current = activeInfusions(ctx.build, ctx.live);
    const ended = current.length >= infusionLimit(ctx.build) ? current.shift() : undefined;
    if (ended && live.items[ended.instanceId]) live.items[ended.instanceId]!.attuned = false;
    live.infusions = [
      ...current,
      {
        featureId: input.featureId,
        instanceId: input.instanceId,
        ...(input.damageType ? { damageType: input.damageType } : {}),
      },
    ];
    if (input.attune && INFUSIONS[infusionKey(input.featureId)]?.attunement)
      live.items[input.instanceId]!.attuned = true;
    const name = ctx.registry.get(
      'item',
      ctx.build.items.find((i) => i.instanceId === input.instanceId)!.itemId,
    ).name;
    return `${ctx.registry.get('feature', input.featureId).name}: ${name}${ended ? '; oldest infusion ended' : ''}`;
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
  apply: ({ live }, { instanceId }) => {
    live.infusions = live.infusions!.filter((i) => i.instanceId !== instanceId);
    if (live.items[instanceId]) live.items[instanceId]!.attuned = false;
    return 'Record infusion ended';
  },
};
