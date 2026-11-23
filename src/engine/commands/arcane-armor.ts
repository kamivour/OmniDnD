import {
  ARMOR_MODELS,
  arcaneArmor,
  armorModelName,
  wornSuit,
  type ArmorModel,
} from '../calc/arcane-armor';
import type { LiveState } from '../schema';
import type { Command, CommandContext } from './runner';
import { block, deadCheck, economyChecks, spendEconomy, warn } from './shared';

export const ARCANE_ARMOR = 'feature.artificer.armorer-arcane-armor';

function smithToolsCheck({ build, live }: CommandContext) {
  return build.items.some(
    ({ itemId, instanceId }) =>
      itemId === 'item.smiths-tools' && (live.items[instanceId]?.qty ?? 0) > 0,
  )
    ? []
    : [warn('Use smith’s tools to configure Arcane Armor')];
}

export const configureArcaneArmor: Command<{ model: ArmorModel }> = {
  name: 'configureArcaneArmor',
  check: (ctx, { model }) => {
    if (!ctx.sheet.features.some(({ def }) => def.id === ARCANE_ARMOR))
      return [block('You do not have Arcane Armor')];
    const suit = wornSuit(ctx.build, ctx.live, ctx.registry);
    if (!suit || !ARMOR_MODELS.includes(model))
      return [block('Wear a suit and choose an armor model')];
    if (ctx.live.arcaneArmor?.instanceId === suit.instanceId)
      return [block('Change your active armor model at the end of a rest')];
    return [...deadCheck(ctx), ...smithToolsCheck(ctx), ...economyChecks(ctx, 'action')];
  },
  apply: ({ live }, { model }, ctx) => {
    const suit = wornSuit(ctx.build, ctx.live, ctx.registry)!;
    live.arcaneArmor = { instanceId: suit.instanceId, model };
    spendEconomy(live, 'action');
    return `Configured ${suit.def.name} as ${armorModelName[model]} Arcane Armor`;
  },
};

export function armorModelChecks(ctx: CommandContext, model?: ArmorModel) {
  if (model === undefined) return [];
  const armor = arcaneArmor(ctx.build, ctx.live, ctx.registry);
  if (!armor || !ARMOR_MODELS.includes(model))
    return [block('Wear your Arcane Armor to change its model')];
  return armor.model === model ? [] : smithToolsCheck(ctx);
}

export function changeArmorModel(live: LiveState, model?: ArmorModel) {
  if (!model || !live.arcaneArmor || live.arcaneArmor.model === model) return undefined;
  live.arcaneArmor.model = model;
  return `Arcane Armor model: ${armorModelName[model]}`;
}
