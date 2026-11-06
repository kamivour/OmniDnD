import { z } from 'zod';
import { companionStats, freshCompanionLive } from '../calc/companions';
import type { Condition } from '../rules2014';
import { CompanionSchema, ConditionSchema, type Companion } from '../schema';
import type { Check, Command, CommandContext } from './runner';
import { block, economyChecks, info, spendEconomy, warn, withNotes } from './shared';

/** Commands for pets, mounts, familiars, summons and sidekicks. Their HP and conditions never touch the owner's. */

const IdPayloadSchema = z.strictObject({ id: z.string().min(1) });
const AmountPayloadSchema = IdPayloadSchema.extend({ amount: z.int().min(0).max(1_000_000) });
const ConditionPayloadSchema = IdPayloadSchema.extend({ condition: ConditionSchema });
const UsePayloadSchema = IdPayloadSchema.extend({
  useId: z.string().min(1),
  /** Positive spends, negative restores. */
  delta: z.int().min(-1000).max(1000),
});
const InitiativePayloadSchema = IdPayloadSchema.extend({ initiative: z.int().nullable() });
const CommandPayloadSchema = IdPayloadSchema.extend({
  /** What the owner spends to direct it: Beast Master's Command, Steel Defender's bonus action, a mount's reaction. */
  slot: z.enum(['action', 'bonus', 'reaction']),
  order: z.string().trim().max(200).optional(),
});
const CompanionPayloadSchema = z.strictObject({ companion: CompanionSchema });

type CommandSlot = 'action' | 'bonus' | 'reaction';

const find = (ctx: Pick<CommandContext, 'build'>, id: string) =>
  ctx.build.companions?.find((companion) => companion.id === id);

/** Resolves the companion and its live entry, or a block check. */
function target<S extends z.ZodType<{ id: string }>>(
  ctx: CommandContext,
  input: unknown,
  schema: S,
) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { checks: [block('Companion command details are invalid')] };
  const companion = find(ctx, parsed.data.id);
  const state = ctx.live.companions?.[parsed.data.id];
  if (!companion || !state) return { checks: [block('Companion does not exist')] };
  return { checks: [] as Check[], companion, state, data: parsed.data as z.infer<S> };
}

function expireAt(companion: Companion, now: number) {
  return companion.durationSeconds === undefined ? undefined : now + companion.durationSeconds;
}

export interface AddCompanionPayload {
  companion: Companion;
}

export const addCompanion: Command<AddCompanionPayload> = {
  name: 'addCompanion',
  check: (ctx, input) => {
    const parsed = CompanionPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Companion details are invalid')];
    const { companion } = parsed.data;
    if (find(ctx, companion.id)) return [block('A companion with this id already exists')];
    const limit = companion.limit;
    if (!limit) return [];
    const active = (ctx.build.companions ?? []).filter(
      (other) =>
        other.limit?.key === limit.key && ctx.live.companions?.[other.id]?.status === 'active',
    ).length;
    return active >= limit.max ? [warn(`Already at the limit for ${limit.key}: ${limit.max}`)] : [];
  },
  apply: (draft, { companion }, ctx) => {
    const { maxHp } = companionStats(companion, { build: draft.build, sheet: ctx.sheet });
    draft.build.companions ??= [];
    draft.build.companions.push(companion);
    draft.live.companions ??= {};
    draft.live.companions[companion.id] = freshCompanionLive(
      maxHp,
      expireAt(companion, ctx.live.clock.seconds),
    );
    return `Add companion: ${companion.name}`;
  },
};

export interface UpdateCompanionPayload {
  companion: Companion;
}

/** Edits a definition. HP is capped to the new maximum; spent uses keep only uses that still exist. */
export const updateCompanion: Command<UpdateCompanionPayload> = {
  name: 'updateCompanion',
  check: (ctx, input) => {
    const parsed = CompanionPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Companion details are invalid')];
    return find(ctx, parsed.data.companion.id) ? [] : [block('Companion does not exist')];
  },
  apply: (draft, { companion }, ctx) => {
    const index = draft.build.companions!.findIndex((other) => other.id === companion.id);
    draft.build.companions![index] = companion;
    const state = draft.live.companions![companion.id]!;
    const { maxHp } = companionStats(companion, { build: draft.build, sheet: ctx.sheet });
    state.hp = Math.min(state.hp, maxHp);
    const useIds = new Set(companion.uses.map((use) => use.id));
    for (const id of Object.keys(state.usesSpent)) {
      if (!useIds.has(id)) delete state.usesSpent[id];
    }
    for (const use of companion.uses) {
      if ((state.usesSpent[use.id] ?? 0) > use.max) state.usesSpent[use.id] = use.max;
    }
    return `Edit companion: ${companion.name}`;
  },
};

export const removeCompanion: Command<{ id: string }> = {
  name: 'removeCompanion',
  check: (ctx, input) => target(ctx, input, IdPayloadSchema).checks,
  apply: (draft, { id }) => {
    const index = draft.build.companions!.findIndex((companion) => companion.id === id);
    const [removed] = draft.build.companions!.splice(index, 1);
    delete draft.live.companions![id];
    return `Remove companion: ${removed!.name}`;
  },
};

export const dismissCompanion: Command<{ id: string }> = {
  name: 'dismissCompanion',
  check: (ctx, input) => {
    const { checks, companion, state } = target(ctx, input, IdPayloadSchema);
    if (!companion || !state) return checks;
    return state.status === 'active' ? [] : [warn(`${companion.name} is already ${state.status}`)];
  },
  apply: (draft, { id }) => {
    const state = draft.live.companions![id]!;
    state.status = 'dismissed';
    delete state.endsAt;
    return `Dismiss ${find(draft, id)!.name}`;
  },
};

/** Brings a dismissed or destroyed companion back at full HP, with a fresh timer if it has one. */
export const resummonCompanion: Command<{ id: string }> = {
  name: 'resummonCompanion',
  check: (ctx, input) => {
    const { checks, companion, state } = target(ctx, input, IdPayloadSchema);
    if (!companion || !state) return checks;
    return state.status === 'active' ? [warn(`${companion.name} is already active`)] : [];
  },
  apply: (draft, { id }, ctx) => {
    const companion = find(draft, id)!;
    const { maxHp } = companionStats(companion, { build: draft.build, sheet: ctx.sheet });
    draft.live.companions![id] = freshCompanionLive(
      maxHp,
      expireAt(companion, ctx.live.clock.seconds),
    );
    return `Resummon ${companion.name}`;
  },
};

/** Temp HP soaks damage first. At 0 HP the companion is destroyed (a DM may rule otherwise: resummon it). */
export const damageCompanion: Command<{ id: string; amount: number }> = {
  name: 'damageCompanion',
  check: (ctx, input) => {
    const { checks, companion, state } = target(ctx, input, AmountPayloadSchema);
    if (!companion || !state) return checks;
    return state.status === 'destroyed' ? [warn(`${companion.name} is already destroyed`)] : [];
  },
  apply: (draft, { id, amount }) => {
    const companion = find(draft, id)!;
    const state = draft.live.companions![id]!;
    const absorbed = Math.min(state.tempHp, amount);
    state.tempHp -= absorbed;
    state.hp -= Math.min(state.hp, amount - absorbed);
    const notes: string[] = [];
    if (state.hp === 0 && state.status === 'active') {
      state.status = 'destroyed';
      delete state.endsAt;
      state.conditions = [];
      notes.push('destroyed');
    }
    return withNotes(`${companion.name} takes ${amount} damage (HP ${state.hp})`, notes);
  },
};

export const healCompanion: Command<{ id: string; amount: number }> = {
  name: 'healCompanion',
  check: (ctx, input) => {
    const { checks, companion, state } = target(ctx, input, AmountPayloadSchema);
    if (!companion || !state) return checks;
    return state.status === 'destroyed'
      ? [block(`${companion.name} is destroyed; resummon it instead`)]
      : [];
  },
  apply: (draft, { id, amount }, ctx) => {
    const companion = find(draft, id)!;
    const state = draft.live.companions![id]!;
    const { maxHp } = companionStats(companion, { build: draft.build, sheet: ctx.sheet });
    state.hp = Math.min(maxHp, state.hp + amount);
    return `${companion.name} heals ${amount} (HP ${state.hp}/${maxHp})`;
  },
};

/** Temp HP does not stack: the higher value stays. */
export const setCompanionTempHp: Command<{ id: string; amount: number }> = {
  name: 'setCompanionTempHp',
  check: (ctx, input) => target(ctx, input, AmountPayloadSchema).checks,
  apply: (draft, { id, amount }) => {
    const state = draft.live.companions![id]!;
    state.tempHp = Math.max(state.tempHp, amount);
    return `${find(draft, id)!.name} temp HP ${state.tempHp}`;
  },
};

export const toggleCompanionCondition: Command<{ id: string; condition: Condition }> = {
  name: 'toggleCompanionCondition',
  check: (ctx, input) => {
    const { checks, companion, state } = target(ctx, input, ConditionPayloadSchema);
    if (!companion || !state) return checks;
    return state.status === 'active' ? [] : [warn(`${companion.name} is ${state.status}`)];
  },
  apply: (draft, { id, condition }) => {
    const name = find(draft, id)!.name;
    const state = draft.live.companions![id]!;
    if (state.conditions.includes(condition)) {
      state.conditions = state.conditions.filter((entry) => entry !== condition);
      return `${name} no longer ${condition}`;
    }
    state.conditions.push(condition);
    return `${name} is ${condition}`;
  },
};

export const adjustCompanionUse: Command<{ id: string; useId: string; delta: number }> = {
  name: 'adjustCompanionUse',
  check: (ctx, input) => {
    const { checks, companion, state, data } = target(ctx, input, UsePayloadSchema);
    if (!companion || !state) return checks;
    const use = companion.uses.find((entry) => entry.id === data.useId);
    if (!use) return [block('Companion has no such use')];
    const spent = state.usesSpent[use.id] ?? 0;
    if (data.delta > use.max - spent) return [block(`${use.name}: no uses left`)];
    if (data.delta < 0 && -data.delta > spent) return [block(`${use.name}: nothing to restore`)];
    return [];
  },
  apply: (draft, { id, useId, delta }) => {
    const companion = find(draft, id)!;
    const use = companion.uses.find((entry) => entry.id === useId)!;
    const state = draft.live.companions![id]!;
    const spent = (state.usesSpent[useId] ?? 0) + delta;
    if (spent === 0) delete state.usesSpent[useId];
    else state.usesSpent[useId] = spent;
    return `${companion.name}: ${use.name} ${use.max - spent}/${use.max}`;
  },
};

export const setCompanionInitiative: Command<{ id: string; initiative: number | null }> = {
  name: 'setCompanionInitiative',
  check: (ctx, input) => target(ctx, input, InitiativePayloadSchema).checks,
  apply: (draft, { id, initiative }) => {
    const state = draft.live.companions![id]!;
    if (initiative === null) delete state.initiative;
    else state.initiative = initiative;
    return `${find(draft, id)!.name} initiative ${initiative ?? 'cleared'}`;
  },
};

/** The owner spends part of their own turn to direct the companion. What it does stays with the DM. */
export const commandCompanion: Command<{ id: string; slot: CommandSlot; order?: string }> = {
  name: 'commandCompanion',
  check: (ctx, input) => {
    const { checks, companion, state, data } = target(ctx, input, CommandPayloadSchema);
    if (!companion || !state) return checks;
    const result: Check[] = [];
    if (state.status !== 'active') result.push(warn(`${companion.name} is ${state.status}`));
    const blocking = state.conditions.find(
      (condition) =>
        condition === 'incapacitated' ||
        condition === 'paralyzed' ||
        condition === 'stunned' ||
        condition === 'unconscious' ||
        condition === 'petrified',
    );
    if (blocking) result.push(info(`${companion.name} is ${blocking} and cannot act`));
    result.push(...economyChecks(ctx, data.slot));
    return result;
  },
  apply: (draft, { id, slot, order }) => {
    spendEconomy(draft.live, slot);
    return withNotes(`Command ${find(draft, id)!.name} (${slot})`, [order || undefined]);
  },
};
