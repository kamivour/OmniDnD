import type { Draft } from 'immer';
import { z } from 'zod';
import {
  CharacterBuildSchema,
  CUSTOM_ITEM_PREFIX,
  CustomItemSchema,
  LiveStateSchema,
  refId,
  type ItemDef,
} from '../schema';
import { equalData } from './management';
import type { CharacterData, Check, Command, CommandContext } from './runner';
import { block, changeLiveItems, warn, type ItemChange } from './shared';

const InstanceIdSchema = z.string().min(1);
const BaselineSchema = z.strictObject({
  item: CharacterBuildSchema.shape.items.element,
  live: LiveStateSchema.shape.items.valueType,
});
const AddInventoryItemPayloadSchema = z.strictObject({
  instanceId: InstanceIdSchema,
  itemId: refId('item'),
  quantity: z.int().nonnegative(),
  container: InstanceIdSchema.optional(),
  notes: z.string().optional(),
});
const EditInventoryItemPayloadSchema = z.strictObject({
  instanceId: InstanceIdSchema,
  quantity: z.int().nonnegative(),
  /** Omitted: preserve the recorded field. Null: explicitly clear it. */
  container: InstanceIdSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
  expected: BaselineSchema.optional(),
});
const RemoveInventoryItemPayloadSchema = z.strictObject({
  instanceId: InstanceIdSchema,
  expected: BaselineSchema.optional(),
});

export type InventoryItemBaseline = z.infer<typeof BaselineSchema>;
export type AddInventoryItemPayload = z.infer<typeof AddInventoryItemPayloadSchema>;
export type EditInventoryItemPayload = z.infer<typeof EditInventoryItemPayloadSchema>;
export type RemoveInventoryItemPayload = z.infer<typeof RemoveInventoryItemPayloadSchema>;

const RESERVED_NEW_IDS = new Set(['__proto__', 'constructor', 'prototype']);

function ownedItem(ctx: CommandContext, instanceId: string) {
  const index = ctx.build.items.findIndex((item) => item.instanceId === instanceId);
  const item = ctx.build.items[index];
  const live = Object.hasOwn(ctx.live.items, instanceId) ? ctx.live.items[instanceId] : undefined;
  if (!item || !live) return undefined;
  const def = ctx.registry.entries.get(item.itemId);
  return def?.kind === 'item' ? { item, live, def, index } : undefined;
}

function baselineChecks(
  target: NonNullable<ReturnType<typeof ownedItem>>,
  expected: InventoryItemBaseline | undefined,
): Check[] {
  return expected && !equalData(expected, { item: target.item, live: target.live })
    ? [block('This item changed after review. Review it again.')]
    : [];
}

/** New links must have a present, usable container all the way to Carried. */
function containerChecks(
  ctx: CommandContext,
  instanceId: string,
  container: string | null | undefined,
): Check[] {
  const visited = new Set([instanceId]);
  let current = container;
  // Older recorded empty links mean Carried, matching the read-only inventory grouping.
  while (current !== null && current !== undefined && current !== '') {
    if (visited.has(current)) return [block('That container link would create or retain a cycle')];
    visited.add(current);
    const parent = ownedItem(ctx, current);
    if (!parent) return [block('The container path includes an unavailable item')];
    if (parent.def.category !== 'container')
      return [block(`${parent.def.name} is not a container`)];
    if (parent.live.qty === 0)
      return [block(`${parent.def.name} has quantity 0; choose a present container`)];
    current = parent.item.container;
  }
  return [];
}

/** A legacy constructor key must not become an intermediate Immer inverse-patch path. */
function changeQuantity(
  draft: Draft<CharacterData>,
  ctx: CommandContext,
  instanceId: string,
  quantity: number,
) {
  if (ctx.live.items[instanceId]!.qty === quantity) return;
  if (instanceId === 'constructor' || instanceId === '__proto__') {
    draft.live.items = {
      ...ctx.live.items,
      [instanceId]: { ...ctx.live.items[instanceId]!, qty: quantity },
    };
  } else draft.live.items[instanceId]!.qty = quantity;
}

/** Record an acquired catalogue item without buying, equipping or consuming it. */
export const addInventoryItem: Command<AddInventoryItemPayload> = {
  name: 'addInventoryItem',
  check: (ctx, input) => {
    const parsed = AddInventoryItemPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('New item details are invalid')];
    const { instanceId, itemId, container } = parsed.data;
    if (RESERVED_NEW_IDS.has(instanceId)) return [block('Choose a fresh item instance id')];
    if (
      ctx.build.items.some((item) => item.instanceId === instanceId) ||
      Object.hasOwn(ctx.live.items, instanceId)
    )
      return [block('That item instance id already exists')];
    const def = ctx.registry.entries.get(itemId);
    if (!def || def.kind !== 'item') return [block('That catalogue item is unavailable')];
    const checks = containerChecks(ctx, instanceId, container);
    // DMG magic items are awarded by the DM, not chosen from campaign books (D116).
    // Custom items belong to the character, not to a book.
    if (
      def.source !== 'DMG' &&
      !def.id.startsWith(CUSTOM_ITEM_PREFIX) &&
      !ctx.campaign.sources.includes(def.source)
    )
      checks.push(warn(`${def.name} is outside this campaign's enabled sources`));
    return checks;
  },
  apply: (draft, { instanceId, itemId, quantity, container, notes }, ctx) => {
    const def = ctx.registry.get('item', itemId);
    draft.build.items.push({
      instanceId,
      itemId,
      ...(container === undefined ? {} : { container }),
      ...(notes === undefined ? {} : { notes }),
    });
    draft.live.items[instanceId] = {
      qty: quantity,
      equipped: false,
      attuned: false,
      ...(def.charges && { charges: def.charges.max }),
    };
    return `Add item: ${def.name} ×${quantity}`;
  },
};

/** Item identity and other live fields stay recorded while explicit edits change its count or location. */
export const editInventoryItem: Command<EditInventoryItemPayload> = {
  name: 'editInventoryItem',
  check: (ctx, input) => {
    const parsed = EditInventoryItemPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Item edits are invalid')];
    const { instanceId, container, expected } = parsed.data;
    const target = ownedItem(ctx, instanceId);
    if (!target) return [block('That item instance is unavailable')];
    const checks = baselineChecks(target, expected);
    if (container !== undefined && (container ?? undefined) !== target.item.container)
      checks.push(...containerChecks(ctx, instanceId, container));
    return checks;
  },
  apply: (draft, { instanceId, quantity, container, notes }, ctx) => {
    const target = ownedItem(ctx, instanceId)!;
    const item = draft.build.items[target.index]!;
    changeQuantity(draft, ctx, instanceId, quantity);
    const changes: string[] = [];
    if (quantity !== target.live.qty) changes.push(`quantity ${target.live.qty} → ${quantity}`);
    if (container !== undefined) {
      if (container === null) delete item.container;
      else item.container = container;
      if ((container ?? undefined) !== target.item.container)
        changes.push(
          container === null
            ? 'moved to Carried'
            : `moved to ${ownedItem(ctx, container)!.def.name}`,
        );
    }
    if (notes !== undefined) {
      if (notes === null) delete item.notes;
      else item.notes = notes;
      if ((notes ?? undefined) !== target.item.notes)
        changes.push(notes === null ? 'notes cleared' : 'notes updated');
    }
    return `Edit item: ${target.def.name}${changes.length > 0 ? `; ${changes.join('; ')}` : '; recorded choices unchanged'}`;
  },
};

/** Removing a record puts only its direct recorded contents in Carried; descendants stay linked. */
export const removeInventoryItem: Command<RemoveInventoryItemPayload> = {
  name: 'removeInventoryItem',
  check: (ctx, input) => {
    const parsed = RemoveInventoryItemPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Item removal details are invalid')];
    const target = ownedItem(ctx, parsed.data.instanceId);
    return target
      ? baselineChecks(target, parsed.data.expected)
      : [block('That item instance is unavailable')];
  },
  apply: (draft, { instanceId }, ctx) => {
    const target = ownedItem(ctx, instanceId)!;
    draft.build.items.splice(target.index, 1);
    let moved = 0;
    for (const item of draft.build.items) {
      if (item.container !== instanceId) continue;
      delete item.container;
      moved += 1;
    }
    if (instanceId === 'constructor' || instanceId === '__proto__') {
      const items = { ...ctx.live.items };
      delete items[instanceId];
      draft.live.items = items;
    } else delete draft.live.items[instanceId];
    return `Remove item: ${target.def.name}${moved > 0 ? `; moved ${moved} direct ${moved === 1 ? 'item' : 'items'} to Carried` : ''}`;
  },
};

const CreateCustomItemPayloadSchema = z.strictObject({
  item: z.unknown(),
  instanceId: InstanceIdSchema,
  quantity: z.int().nonnegative(),
  container: InstanceIdSchema.optional(),
  notes: z.string().optional(),
});
const EditCustomItemPayloadSchema = z.strictObject({
  item: z.unknown(),
  /** The definition the player reviewed; blocks if it changed meanwhile. */
  expected: z.unknown().optional(),
});
const DeleteCustomItemPayloadSchema = z.strictObject({ itemId: refId('item') });

export type CreateCustomItemPayload = {
  item: ItemDef;
  instanceId: string;
  quantity: number;
  container?: string;
  notes?: string;
};
export type EditCustomItemPayload = { item: ItemDef; expected?: ItemDef };
export type DeleteCustomItemPayload = z.infer<typeof DeleteCustomItemPayloadSchema>;

function customItemIndex(ctx: CommandContext, itemId: string) {
  return (ctx.build.customItems ?? []).findIndex((item) => item.id === itemId);
}

function customItemCheck(item: unknown): Check[] {
  const parsed = CustomItemSchema.safeParse(item);
  if (parsed.success) return [];
  return [
    block(`Custom item is invalid: ${parsed.error.issues[0]?.message ?? 'check the fields'}`),
  ];
}

/** Define a new item for this character and record the first copy of it. */
export const createCustomItem: Command<CreateCustomItemPayload> = {
  name: 'createCustomItem',
  check: (ctx, input) => {
    const parsed = CreateCustomItemPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('New item details are invalid')];
    const invalid = customItemCheck(parsed.data.item);
    if (invalid.length > 0) return invalid;
    const item = parsed.data.item as ItemDef;
    const { instanceId, container } = parsed.data;
    if (ctx.registry.entries.has(item.id)) return [block('That custom item id is already used')];
    if (RESERVED_NEW_IDS.has(instanceId)) return [block('Choose a fresh item instance id')];
    if (
      ctx.build.items.some((entry) => entry.instanceId === instanceId) ||
      Object.hasOwn(ctx.live.items, instanceId)
    )
      return [block('That item instance id already exists')];
    return containerChecks(ctx, instanceId, container);
  },
  apply: (draft, { item, instanceId, quantity, container, notes }) => {
    const def = CustomItemSchema.parse(item);
    (draft.build.customItems ??= []).push(def);
    draft.build.items.push({
      instanceId,
      itemId: def.id,
      ...(container === undefined ? {} : { container }),
      ...(notes === undefined ? {} : { notes }),
    });
    draft.live.items[instanceId] = {
      qty: quantity,
      equipped: false,
      attuned: false,
      ...(def.charges && { charges: def.charges.max }),
    };
    return `Create custom item: ${def.name} ×${quantity}`;
  },
};

/** Replace a custom item's definition. Every copy follows; charges stay within the new maximum. */
export const editCustomItem: Command<EditCustomItemPayload> = {
  name: 'editCustomItem',
  check: (ctx, input) => {
    const parsed = EditCustomItemPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Item edits are invalid')];
    const invalid = customItemCheck(parsed.data.item);
    if (invalid.length > 0) return invalid;
    const item = parsed.data.item as ItemDef;
    const index = customItemIndex(ctx, item.id);
    if (index < 0) return [block('That custom item is unavailable')];
    const current = ctx.build.customItems![index]!;
    if (parsed.data.expected !== undefined && !equalData(parsed.data.expected, current))
      return [block('This item changed after review. Review it again.')];
    const copies = ctx.build.items.filter((entry) => entry.itemId === item.id);
    const live = (instanceId: string) =>
      Object.hasOwn(ctx.live.items, instanceId) ? ctx.live.items[instanceId] : undefined;
    const checks: Check[] = [];
    if (
      current.attunement &&
      !item.attunement &&
      copies.some((entry) => live(entry.instanceId)?.attuned)
    )
      checks.push(warn(`${current.name} will no longer need attunement; its bond ends`));
    if (
      current.category !== item.category &&
      copies.some((entry) => live(entry.instanceId)?.equipped)
    )
      checks.push(warn(`${current.name} is equipped; check it after changing its type`));
    return checks;
  },
  apply: (draft, { item }, ctx) => {
    const def = CustomItemSchema.parse(item);
    const index = customItemIndex(ctx, def.id);
    const before = ctx.build.customItems![index]!;
    draft.build.customItems![index] = def;
    const changes: ItemChange[] = [];
    for (const entry of ctx.build.items) {
      if (entry.itemId !== def.id || !Object.hasOwn(ctx.live.items, entry.instanceId)) continue;
      const live = ctx.live.items[entry.instanceId]!;
      const values: ItemChange['values'] = {};
      if (!def.charges) {
        if (live.charges !== undefined) values.charges = undefined;
        if (live.rechargePending !== undefined) values.rechargePending = undefined;
      } else if (live.charges === undefined || !before.charges) values.charges = def.charges.max;
      else if (live.charges > def.charges.max) values.charges = def.charges.max;
      if (live.attuned && !def.attunement) values.attuned = false;
      if (Object.keys(values).length > 0) changes.push({ instanceId: entry.instanceId, values });
    }
    changeLiveItems(draft.live, ctx.live.items, changes);
    return `Edit custom item: ${before.name}${before.name === def.name ? '' : ` → ${def.name}`}`;
  },
};

/** Remove a custom item definition once nothing on the character uses it. */
export const deleteCustomItem: Command<DeleteCustomItemPayload> = {
  name: 'deleteCustomItem',
  check: (ctx, input) => {
    const parsed = DeleteCustomItemPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Item removal details are invalid')];
    const { itemId } = parsed.data;
    if (customItemIndex(ctx, itemId) < 0) return [block('That custom item is unavailable')];
    if (ctx.build.items.some((entry) => entry.itemId === itemId))
      return [block('Remove every copy from the inventory first')];
    const { weapons, tools, expertise } = ctx.build.proficiencies;
    const used: readonly string[] = [...weapons, ...tools, ...expertise, ...ctx.build.favorites];
    if (used.includes(itemId)) return [block('Proficiencies or favorites still use this item')];
    return [];
  },
  apply: (draft, { itemId }, ctx) => {
    const index = customItemIndex(ctx, itemId);
    const name = ctx.build.customItems![index]!.name;
    draft.build.customItems!.splice(index, 1);
    if (draft.build.customItems!.length === 0) delete draft.build.customItems;
    return `Delete custom item: ${name}`;
  },
};
