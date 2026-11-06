import type { Draft } from 'immer';
import { z } from 'zod';
import { CharacterBuildSchema, LiveStateSchema, refId } from '../schema';
import { equalData } from './management';
import type { CharacterData, Check, Command, CommandContext } from './runner';
import { block, warn } from './shared';

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
    if (def.source !== 'DMG' && !ctx.campaign.sources.includes(def.source))
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
