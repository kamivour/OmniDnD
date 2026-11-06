import { z } from 'zod';
import type { Draft } from 'immer';
import { armorReplacements } from '../calc/equipment';
import { attunedItems } from '../calc/attunement';
import { ATTUNEMENT_LIMIT } from '../rules2014';
import type { ItemDef } from '../schema';
import type { CharacterData, Command, CommandContext } from './runner';
import { block, info, warn } from './shared';

const InstancePayloadSchema = z.strictObject({ instanceId: z.string().min(1) });
const AdjustItemQuantityPayloadSchema = InstancePayloadSchema.extend({
  quantity: z.int().nonnegative(),
});
const EquipItemPayloadSchema = InstancePayloadSchema.extend({ equipped: z.boolean() });
const SetItemAttunementPayloadSchema = InstancePayloadSchema.extend({
  attuned: z.boolean(),
  expected: z.boolean().optional(),
});

export type AdjustItemQuantityPayload = z.infer<typeof AdjustItemQuantityPayloadSchema>;
export type EquipItemPayload = z.infer<typeof EquipItemPayloadSchema>;
export type SetItemAttunementPayload = z.infer<typeof SetItemAttunementPayloadSchema>;

function ownedItem(ctx: CommandContext, instanceId: string) {
  const item = ctx.build.items.find((entry) => entry.instanceId === instanceId);
  const live = Object.hasOwn(ctx.live.items, instanceId) ? ctx.live.items[instanceId] : undefined;
  if (!item || !live) return undefined;
  try {
    return { item, live, def: ctx.registry.get('item', item.itemId) };
  } catch {
    return undefined;
  }
}

type ItemChange = {
  instanceId: string;
  values: Partial<CommandContext['live']['items'][string]>;
};

function changeItems(draft: Draft<CharacterData>, ctx: CommandContext, changes: ItemChange[]) {
  // Immer forbids inverse-patch traversal through these names. A legacy owned item can
  // still use "constructor", so replace the map only when an affected key needs it.
  if (
    changes.some(({ instanceId }) => instanceId === 'constructor' || instanceId === '__proto__')
  ) {
    draft.live.items = {
      ...ctx.live.items,
      ...Object.fromEntries(
        changes.map(({ instanceId, values }) => [
          instanceId,
          {
            ...ctx.live.items[instanceId]!,
            ...values,
          },
        ]),
      ),
    };
    return;
  }
  for (const { instanceId, values } of changes)
    Object.assign(draft.live.items[instanceId]!, values);
}

/** Change a recorded count without silently clearing equipment, charges or attunement. */
export const adjustItemQuantity: Command<AdjustItemQuantityPayload> = {
  name: 'adjustItemQuantity',
  check: (ctx, input) => {
    const parsed = AdjustItemQuantityPayloadSchema.safeParse(input);
    if (!parsed.success)
      return [block('Item quantity must be a safe whole number of zero or more')];
    return ownedItem(ctx, parsed.data.instanceId)
      ? []
      : [block('That item instance is unavailable')];
  },
  apply: (draft, { instanceId, quantity }, ctx) => {
    const { def, live } = ownedItem(ctx, instanceId)!;
    changeItems(draft, ctx, [{ instanceId, values: { qty: quantity } }]);
    return `${def.name}: quantity ${live.qty} → ${quantity}`;
  },
};

// 2014 Basic Rules, Equipment: https://www.dndbeyond.com/sources/dnd/basic-rules-2014/equipment
const ARMOR_TIME = {
  light: { don: '1 minute', doff: '1 minute' },
  medium: { don: '5 minutes', doff: '1 minute' },
  heavy: { don: '10 minutes', doff: '5 minutes' },
  shield: { don: '1 action', doff: '1 action' },
} as const;

function armorTime(def: ItemDef, equipped: boolean) {
  if (!def.armor) return undefined;
  return `${equipped ? 'Don' : 'Doff'} ${def.name}: ${ARMOR_TIME[def.armor.category][equipped ? 'don' : 'doff']}`;
}

/** Record the actual outfit. Time and turn actions remain explicit separate commands (Q26). */
export const equipItem: Command<EquipItemPayload> = {
  name: 'equipItem',
  check: (ctx, input) => {
    const parsed = EquipItemPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Equipment details are invalid')];
    const { instanceId, equipped } = parsed.data;
    const item = ownedItem(ctx, instanceId);
    if (!item) return [block('That item instance is unavailable')];
    if (equipped && item.live.qty === 0) return [block('No quantity left to equip')];
    const checks = [];
    if (
      equipped &&
      item.def.armor &&
      !ctx.build.proficiencies.armor.includes(item.def.armor.category)
    )
      checks.push(
        warn(
          `Not proficient with ${item.def.name}: STR/DEX checks, saves and attacks have disadvantage; you cannot cast spells`,
        ),
      );
    const timing = [
      ...(item.live.qty > 0 && item.live.equipped !== equipped
        ? [armorTime(item.def, equipped)]
        : []),
      ...(equipped
        ? armorReplacements(ctx, ctx.registry, instanceId)
            .filter((entry) => ctx.live.items[entry.instanceId]!.qty > 0)
            .map(({ def }) => armorTime(def, false))
        : []),
    ].filter((entry): entry is string => entry !== undefined);
    if (timing.length > 0)
      checks.push(info(`${timing.join('; ')}. Record any elapsed time or action separately.`));
    return checks;
  },
  apply: (draft, { instanceId, equipped }, ctx) => {
    const item = ownedItem(ctx, instanceId)!;
    const replacements = equipped ? armorReplacements(ctx, ctx.registry, instanceId) : [];
    changeItems(draft, ctx, [
      ...replacements.map(({ instanceId: replacedId }) => ({
        instanceId: replacedId,
        values: { equipped: false },
      })),
      { instanceId, values: { equipped } },
    ]);
    const replaced =
      replacements.length > 0
        ? `; replaced ${replacements.map(({ def }) => def.name).join(', ')}`
        : '';
    return `${equipped ? 'Equip' : 'Unequip'}: ${item.def.name}${replaced}`;
  },
};

/** Record the actual 2014 bond; rest time, prerequisites, curses and magical effects stay manual. */
export const setItemAttunement: Command<SetItemAttunementPayload> = {
  name: 'setItemAttunement',
  check: (ctx, input) => {
    const parsed = SetItemAttunementPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Attunement details are invalid')];
    const { instanceId, attuned, expected } = parsed.data;
    const target = ownedItem(ctx, instanceId);
    if (!target) return [block('That item instance is unavailable')];
    if (expected !== undefined && expected !== target.live.attuned)
      return [block('The recorded attunement changed after review. Review it again.')];
    if (attuned === target.live.attuned) return [];
    const checks = [];
    if (attuned) {
      if (target.live.qty === 0) return [block('No quantity left to attune')];
      const existing = attunedItems(ctx);
      if (existing.length >= ATTUNEMENT_LIMIT)
        return [block(`Already attuned to ${ATTUNEMENT_LIMIT} items; end a recorded bond first`)];
      if (existing.some((item) => item.itemId === target.item.itemId))
        return [block(`Already attuned to another copy of ${target.def.name}`)];
      if (target.def.attunement !== true)
        checks.push(
          warn(
            `${target.def.name} has no recorded attunement requirement; confirm the DM's ruling`,
          ),
        );
    }
    checks.push(
      info(
        `${attuned ? 'Attunement' : 'Ending attunement'} recorded. Confirm any required focused short rest, contact, prerequisites, curses and ending conditions at the table; record time separately.`,
      ),
    );
    return checks;
  },
  apply: (draft, { instanceId, attuned }, ctx) => {
    const target = ownedItem(ctx, instanceId)!;
    changeItems(draft, ctx, [{ instanceId, values: { attuned } }]);
    return `${attuned ? 'Attune' : 'End attunement'}: ${target.def.name}`;
  },
};
