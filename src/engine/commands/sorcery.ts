import { SLOT_CREATION_COST } from '../rules2014';
import type { Check, Command, CommandContext } from './runner';
import { featureUseDetails } from './features';
import { block, economyChecks, spendEconomy, warn } from './shared';

export const FONT_OF_MAGIC = 'feature.sorcerer.font-of-magic';
export const CONVERT_SLOT = 'feature.sorcerer.flexible-casting-converting-spell-slot';
export const CREATE_SLOT = 'feature.sorcerer.flexible-casting-creating-spell-slots';

/** Sorcery points: spent, max and remaining from the Font of Magic pool. */
export function sorceryPoints(ctx: Pick<CommandContext, 'live' | 'sheet'>) {
  return featureUseDetails(ctx, FONT_OF_MAGIC).uses;
}

const hasFeature = (ctx: Pick<CommandContext, 'sheet'>, id: string) =>
  ctx.sheet.features.some(({ def }) => def.id === id);

export interface ConvertSlotPayload {
  /** Spell slot level 1–9; leave out when converting a Pact Magic slot. */
  slotLevel?: number;
  pact?: boolean;
}

function convertedLevel(ctx: Pick<CommandContext, 'sheet'>, payload: ConvertSlotPayload) {
  return payload.pact ? ctx.sheet.slots.pact?.level : payload.slotLevel;
}

/** Flexible Casting: expend a slot for sorcery points equal to its level (bonus action). */
export const convertSlotToPoints: Command<ConvertSlotPayload> = {
  name: 'convertSlotToPoints',
  check: (ctx, payload) => {
    const points = sorceryPoints(ctx);
    if (!hasFeature(ctx, CONVERT_SLOT) || !points)
      return [block('This character has no Flexible Casting')];
    const { live, sheet } = ctx;
    if (payload.pact) {
      const pact = sheet.slots.pact;
      if (!pact) return [block('You have no Pact Magic slots')];
      if ((live.pactSlotsUsed ?? 0) >= pact.count) return [block('No pact slots left')];
    } else {
      const level = payload.slotLevel;
      if (level === undefined || !Number.isInteger(level) || level < 1 || level > 9)
        return [block('Choose a slot level')];
      if ((live.slotsUsed[level] ?? 0) >= (sheet.slots.max[level] ?? 0))
        return [block(`No level ${level} slots left`)];
    }
    const checks: Check[] = economyChecks(ctx, 'bonus');
    const gain = convertedLevel(ctx, payload) ?? 0;
    if (points.spent < gain)
      checks.push(
        warn(`Sorcery points cap at ${points.max}; ${gain - points.spent} would be lost`),
      );
    return checks;
  },
  apply: ({ live }, payload, ctx) => {
    const points = sorceryPoints(ctx)!;
    const level = convertedLevel(ctx, payload)!;
    spendEconomy(live, 'bonus');
    if (payload.pact) live.pactSlotsUsed = (live.pactSlotsUsed ?? 0) + 1;
    else live.slotsUsed[level] = (live.slotsUsed[level] ?? 0) + 1;
    const spent = Math.max(0, points.spent - level);
    live.featureUsesSpent[FONT_OF_MAGIC] = spent;
    const slot = payload.pact ? `pact slot L${level}` : `L${level} slot`;
    return `Flexible Casting: ${slot} → ${points.spent - spent} sorcery points (${points.max - spent}/${points.max} left)`;
  },
};

export interface CreateSlotPayload {
  slotLevel: number;
}

/** Flexible Casting: spend sorcery points to make a slot of level 1–5 (bonus action). */
export const createSlot: Command<CreateSlotPayload> = {
  name: 'createSlot',
  check: (ctx, { slotLevel }) => {
    const points = sorceryPoints(ctx);
    if (!hasFeature(ctx, CREATE_SLOT) || !points)
      return [block('This character has no Flexible Casting')];
    const cost = SLOT_CREATION_COST[slotLevel];
    if (cost === undefined) return [block('Created slots are level 1 to 5')];
    if (points.remaining < cost)
      return [block(`Needs ${cost} sorcery points; ${points.remaining} left`)];
    return economyChecks(ctx, 'bonus');
  },
  apply: ({ live }, { slotLevel }, ctx) => {
    const points = sorceryPoints(ctx)!;
    const cost = SLOT_CREATION_COST[slotLevel]!;
    spendEconomy(live, 'bonus');
    const created = live.createdSlots ?? Array.from({ length: 10 }, () => 0);
    created[slotLevel] = (created[slotLevel] ?? 0) + 1;
    live.createdSlots = created;
    const spent = points.spent + cost;
    live.featureUsesSpent[FONT_OF_MAGIC] = spent;
    return `Flexible Casting: ${cost} sorcery points → L${slotLevel} slot (${points.max - spent}/${points.max} points left; fades on a long rest)`;
  },
};
