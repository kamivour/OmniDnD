import type { FeatureDef } from '../schema';
import type { Command, CommandContext } from './runner';
import { block } from './shared';

export type SmiteRule = NonNullable<FeatureDef['smite']>;

/** Damage dice for a smite paid with a slot of this level, e.g. "3d8". */
export function smiteDice(rule: SmiteRule, slotLevel: number, bonusTarget = false): string {
  const scaled = rule.dice + Math.max(0, slotLevel - 1);
  const count = Math.min(scaled, rule.maxDice ?? scaled) + (bonusTarget && rule.bonusVs ? 1 : 0);
  return `${count}${rule.die}`;
}

export interface SmitePayload {
  featureId: string;
  /** Spell slot level 1–9; leave out when paying with a Pact Magic slot. */
  slotLevel?: number;
  pact?: boolean;
  /** The target is one of `smite.bonusVs` (undead or fiend for Divine Smite). */
  bonusTarget?: boolean;
}

function smiteFeature(ctx: Pick<CommandContext, 'sheet'>, featureId: string) {
  const def = ctx.sheet.features.find((feature) => feature.def.id === featureId)?.def;
  return def?.smite ? { def, rule: def.smite } : undefined;
}

/** Slot level that pays for the smite, or undefined when the payload names none. */
function paidLevel(ctx: Pick<CommandContext, 'sheet'>, payload: SmitePayload) {
  return payload.pact ? ctx.sheet.slots.pact?.level : payload.slotLevel;
}

/** Spends a spell slot for a smite's extra damage. The hit itself is the player's call. */
export const smite: Command<SmitePayload> = {
  name: 'smite',
  check: (ctx, payload) => {
    const found = smiteFeature(ctx, payload.featureId);
    if (!found) return [block('This character has no smite feature like that')];
    const { live, sheet } = ctx;
    if (payload.pact) {
      const pact = sheet.slots.pact;
      if (!pact) return [block('You have no Pact Magic slots')];
      if ((live.pactSlotsUsed ?? 0) >= pact.count) return [block('No pact slots left')];
      return [];
    }
    if (found.rule.pactOnly) return [block(`${found.def.name} needs a Pact Magic slot`)];
    const level = payload.slotLevel;
    if (level === undefined || !Number.isInteger(level) || level < 1 || level > 9)
      return [block('Choose a slot level')];
    if ((live.slotsUsed[level] ?? 0) >= (sheet.slots.max[level] ?? 0))
      return [block(`No level ${level} slots left`)];
    return [];
  },
  apply: ({ live }, payload, ctx) => {
    const { def, rule } = smiteFeature(ctx, payload.featureId)!;
    const level = paidLevel(ctx, payload)!;
    if (payload.pact) live.pactSlotsUsed = (live.pactSlotsUsed ?? 0) + 1;
    else live.slotsUsed[level] = (live.slotsUsed[level] ?? 0) + 1;
    const bonus = !!payload.bonusTarget && !!rule.bonusVs;
    const parts = [
      `roll ${smiteDice(rule, level, bonus)} ${rule.type}`,
      bonus && `vs ${rule.bonusVs}`,
      rule.note,
    ].filter(Boolean);
    const slot = payload.pact ? `pact slot L${level}` : `L${level} slot`;
    return `${def.name} (${slot}): ${parts.join(', ')}`;
  },
};
