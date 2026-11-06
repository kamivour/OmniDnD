import { z } from 'zod';
import type { Draft } from 'immer';
import { armorReplacements } from '../calc/equipment';
import { attunedItems } from '../calc/attunement';
import { ATTUNEMENT_LIMIT } from '../rules2014';
import type { ItemDef } from '../schema';
import type { CharacterData, Command, CommandContext } from './runner';
import {
  block,
  changeLiveItems,
  deadCheck,
  diceRange,
  economyChecks,
  endSelfInvisibility,
  incapacitatedBy,
  info,
  restoreHp,
  spendEconomy,
  warn,
  withNotes,
  type ItemChange,
} from './shared';

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

function changeItems(draft: Draft<CharacterData>, ctx: CommandContext, changes: ItemChange[]) {
  changeLiveItems(draft.live, ctx.live.items, changes);
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

const SpendItemChargesPayloadSchema = InstancePayloadSchema.extend({
  count: z.int().positive(),
  /** Charges shown when the player chose; a mismatch means the record changed. */
  expected: z.int().nonnegative().optional(),
});
const SetItemChargesPayloadSchema = InstancePayloadSchema.extend({
  charges: z.int().nonnegative(),
});
const RechargeItemPayloadSchema = InstancePayloadSchema.extend({
  /** The entered regain roll, before any flat bonus. Omitted for "regain all" items. */
  roll: z.int().nonnegative().optional(),
});

export type SpendItemChargesPayload = z.infer<typeof SpendItemChargesPayloadSchema>;
export type SetItemChargesPayload = z.infer<typeof SetItemChargesPayloadSchema>;
export type RechargeItemPayload = z.infer<typeof RechargeItemPayloadSchema>;

/** The owned item and its charge record, when its catalogue entry has charges. */
function chargedItem(ctx: CommandContext, instanceId: string) {
  const owned = ownedItem(ctx, instanceId);
  if (!owned?.def.charges) return undefined;
  return {
    ...owned,
    charges: owned.def.charges,
    current: Math.min(owned.live.charges ?? owned.def.charges.max, owned.def.charges.max),
  };
}

/** Record charges the player spent. Spell effects, targets and destruction rolls stay manual. */
export const spendItemCharges: Command<SpendItemChargesPayload> = {
  name: 'spendItemCharges',
  check: (ctx, input) => {
    const parsed = SpendItemChargesPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Charge details are invalid')];
    const { instanceId, count, expected } = parsed.data;
    const item = chargedItem(ctx, instanceId);
    if (!item) return [block('That item has no recorded charges')];
    if (expected !== undefined && expected !== item.current)
      return [block('The recorded charges changed after review. Review them again.')];
    if (item.live.qty === 0) return [block('No quantity left to use')];
    if (count > item.current)
      return [block(`${item.def.name} has only ${item.current} charges left`)];
    const checks = [];
    if (item.def.attunement === true && !item.live.attuned)
      checks.push(warn(`${item.def.name} requires attunement before you can use its charges`));
    if (item.live.qty > 1)
      checks.push(
        info(
          'This entry keeps one charge count for all its copies; add copies separately to track each.',
        ),
      );
    if (count === item.current)
      checks.push(
        info(`Last charge spent. Check ${item.def.name}'s own rule for what happens now.`),
      );
    return checks;
  },
  apply: (draft, { instanceId, count }, ctx) => {
    const item = chargedItem(ctx, instanceId)!;
    const after = item.current - count;
    changeItems(draft, ctx, [{ instanceId, values: { charges: after } }]);
    return `${item.def.name}: spent ${count} ${count === 1 ? 'charge' : 'charges'}, ${item.current} → ${after}`;
  },
};

/** Correct a charge count to match the table, e.g. after a DM ruling. */
export const setItemCharges: Command<SetItemChargesPayload> = {
  name: 'setItemCharges',
  check: (ctx, input) => {
    const parsed = SetItemChargesPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Charges must be a whole number of zero or more')];
    const item = chargedItem(ctx, parsed.data.instanceId);
    if (!item) return [block('That item has no recorded charges')];
    if (parsed.data.charges > item.charges.max)
      return [block(`${item.def.name} holds at most ${item.charges.max} charges`)];
    return [];
  },
  apply: (draft, { instanceId, charges }, ctx) => {
    const item = chargedItem(ctx, instanceId)!;
    changeItems(draft, ctx, [
      {
        instanceId,
        values: {
          charges,
          ...(charges === item.charges.max && { rechargePending: undefined }),
        },
      },
    ]);
    return `${item.def.name}: charges set ${item.current} → ${charges}`;
  },
};

/** Apply a due regain. The player rolls; the app adds the item's bonus and caps at maximum. */
export const rechargeItem: Command<RechargeItemPayload> = {
  name: 'rechargeItem',
  check: (ctx, input) => {
    const parsed = RechargeItemPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Recharge details are invalid')];
    const { instanceId, roll } = parsed.data;
    const item = chargedItem(ctx, instanceId);
    if (!item) return [block('That item has no recorded charges')];
    if (!item.live.rechargePending) return [block(`No recharge is due for ${item.def.name}`)];
    const { regain } = item.charges;
    if (regain === undefined || regain === 'all') return [];
    if (roll === undefined) return [block(`Enter your ${regain.dice} roll`)];
    const { min, max } = diceRange(regain.dice);
    if (roll < min || roll > max) return [block(`A ${regain.dice} roll is ${min}–${max}`)];
    return [];
  },
  apply: (draft, { instanceId, roll }, ctx) => {
    const item = chargedItem(ctx, instanceId)!;
    const { regain, max } = item.charges;
    const amount = regain === undefined || regain === 'all' ? max : roll! + (regain.bonus ?? 0);
    const after = Math.min(max, item.current + amount);
    changeItems(draft, ctx, [
      { instanceId, values: { charges: after, rechargePending: undefined } },
    ]);
    const rolled =
      regain === undefined || regain === 'all'
        ? ''
        : ` (${regain.dice}: ${roll}${regain.bonus ? ` + ${regain.bonus}` : ''})`;
    return `${item.def.name}: regained charges${rolled}, ${item.current} → ${after}`;
  },
};

/** Dismiss a due regain, e.g. when the table skipped it. */
export const skipItemRecharge: Command<z.infer<typeof InstancePayloadSchema>> = {
  name: 'skipItemRecharge',
  check: (ctx, input) => {
    const parsed = InstancePayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Recharge details are invalid')];
    const item = chargedItem(ctx, parsed.data.instanceId);
    if (!item) return [block('That item has no recorded charges')];
    return item.live.rechargePending ? [] : [block(`No recharge is due for ${item.def.name}`)];
  },
  apply: (draft, { instanceId }, ctx) => {
    const item = chargedItem(ctx, instanceId)!;
    changeItems(draft, ctx, [{ instanceId, values: { rechargePending: undefined } }]);
    return `${item.def.name}: recharge skipped`;
  },
};

const ConsumeItemPayloadSchema = InstancePayloadSchema.extend({
  /** Who benefits: you, or another creature (its outcome stays at the table). */
  target: z.enum(['self', 'other']),
  /** Another creature gives you the item, spending its own action instead of yours. */
  byAlly: z.literal(true).optional(),
  /** The entered healing dice total, before the item's flat bonus. */
  roll: z.int().nonnegative().optional(),
  /** Quantity shown when the player chose; a mismatch means the record changed. */
  expected: z.int().nonnegative().optional(),
});
export type ConsumeItemPayload = z.infer<typeof ConsumeItemPayloadSchema>;

/** The owned item and its use data, when its catalogue entry can be used up. */
function usableItem(ctx: CommandContext, instanceId: string) {
  const owned = ownedItem(ctx, instanceId);
  return owned?.def.use ? { ...owned, use: owned.def.use } : undefined;
}

/** Whether this use spends your action: in combat, for action items you use yourself. */
function spendsAction(ctx: CommandContext, use: ItemDef['use'], byAlly?: true) {
  return ctx.live.combat !== undefined && use?.activation === 'action' && byAlly !== true;
}

/**
 * Use up one item (2014: drinking or giving a potion is an action). Healing on yourself takes the
 * entered roll plus the item's bonus; every other effect, target and roll stays at the table.
 */
export const consumeItem: Command<ConsumeItemPayload> = {
  name: 'consumeItem',
  check: (ctx, input) => {
    const parsed = ConsumeItemPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Item use details are invalid')];
    const { instanceId, target, byAlly, roll, expected } = parsed.data;
    const item = usableItem(ctx, instanceId);
    if (!item) return [block('That item has no recorded use')];
    if (expected !== undefined && expected !== item.live.qty)
      return [block('The recorded quantity changed after review. Review it again.')];
    if (item.live.qty === 0) return [block(`No ${item.def.name} left`)];
    if (byAlly && target !== 'self')
      return [block('Only an item given to you can come from an ally')];
    const checks = [...deadCheck(ctx)];
    const { healing } = item.use;
    if (healing && target === 'self') {
      if (roll === undefined) return [...checks, block(`Enter your ${healing.dice} roll`)];
      const { min, max } = diceRange(healing.dice);
      if (roll < min || roll > max)
        return [...checks, block(`A ${healing.dice} roll is ${min}–${max}`)];
      if (ctx.live.hp >= ctx.sheet.maxHp.value) checks.push(info('Your HP is already full'));
    } else if (roll !== undefined) return [block(`${item.def.name} has no roll to enter here`)];
    if (spendsAction(ctx, item.use, byAlly)) checks.push(...economyChecks(ctx, 'action'));
    else if (!byAlly && item.use.activation !== 'none') {
      const cause = incapacitatedBy(ctx.sheet.conditions);
      if (cause) checks.push(warn(`Incapacitated (${cause}): no actions`));
    }
    if (item.use.activation === 'special')
      checks.push(info(`${item.def.name} takes the time its own rule states.`));
    if (item.use.attack) checks.push(info('Resolve the attack roll and damage at the table.'));
    else if (!healing || target === 'other')
      checks.push(info(`Resolve ${item.def.name}'s effect at the table.`));
    return checks;
  },
  apply: (draft, { instanceId, target, byAlly, roll }, ctx) => {
    const item = usableItem(ctx, instanceId)!;
    const left = item.live.qty - 1;
    changeItems(draft, ctx, [{ instanceId, values: { qty: left } }]);
    const notes: string[] = [];
    if (spendsAction(ctx, item.use, byAlly)) spendEconomy(draft.live, 'action');
    if (item.use.attack) notes.push(...endSelfInvisibility(draft.live, 'attack'));
    const { healing } = item.use;
    if (healing && target === 'self') {
      const amount = roll! + (healing.bonus ?? 0);
      const { before, after } = restoreHp(draft.live, amount, ctx.sheet.maxHp.value);
      const rolled = `${healing.dice}: ${roll}${healing.bonus ? ` + ${healing.bonus}` : ''}`;
      notes.unshift(`healed ${amount} (${rolled}), HP ${before} → ${after}`);
      if (before === 0 && after > 0) notes.push('conscious again');
    }
    const lead = byAlly
      ? `${item.def.name} given to you`
      : target === 'other'
        ? `${item.def.name} used on another creature`
        : `Used ${item.def.name}`;
    return withNotes(`${lead}, ${left} left`, notes);
  },
};
