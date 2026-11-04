import { produce, type Draft } from 'immer';
import { z } from 'zod';
import {
  overrideTargets,
  type OverrideCounter,
  type OverrideExpectation,
  type OverrideTarget,
} from '../calc/override-targets';
import { computeSheet } from '../calc/sheet';
import { CounterCorrectionValueSchema } from '../calc/value-overrides';
import { DieSchema } from '../schema';
import { equalData } from './management';
import type { CharacterData, Command, CommandContext } from './runner';
import { block } from './shared';

const ExpectedSchema = z.strictObject({
  value: z.union([z.number(), z.string()]),
  calculated: z.union([z.number(), z.string()]).optional(),
  max: z.int().nonnegative().optional(),
  spent: z.int().nonnegative().optional(),
  override: z.unknown().optional(),
});
const ResetPayloadSchema = z.strictObject({
  path: z.string().min(1),
  expected: ExpectedSchema.optional(),
});
const SetPayloadSchema = ResetPayloadSchema.extend({
  value: z.union([z.number(), z.string()]),
  note: z.string().trim().min(1),
});

export type SetValueOverridePayload = z.infer<typeof SetPayloadSchema>;
export type ResetValueOverridePayload = z.infer<typeof ResetPayloadSchema>;

function changedSinceReview(target: OverrideTarget, expected: OverrideExpectation | undefined) {
  return (
    expected !== undefined &&
    (expected.value !== target.value ||
      (expected.calculated !== undefined && expected.calculated !== target.calculated) ||
      (expected.max !== undefined &&
        (target.kind !== 'remaining' || expected.max !== target.max)) ||
      (expected.spent !== undefined &&
        (target.kind !== 'remaining' || expected.spent !== target.spent)) ||
      (Object.hasOwn(expected, 'override') &&
        !equalData(expected.override, target.expected.override)))
  );
}

function setSpent(live: Draft<CharacterData['live']>, counter: OverrideCounter, spent: number) {
  switch (counter.kind) {
    case 'hitDice':
      if (spent === 0) delete live.hitDiceSpent[counter.die];
      else live.hitDiceSpent[counter.die] = spent;
      break;
    case 'slots':
      live.slotsUsed[counter.level] = spent;
      break;
    case 'pact':
      if (spent === 0) delete live.pactSlotsUsed;
      else live.pactSlotsUsed = spent;
      break;
    case 'feature':
      if (spent === 0) delete live.featureUsesSpent[counter.featureId];
      else live.featureUsesSpent[counter.featureId] = spent;
      break;
  }
}

function applySet(
  draft: Draft<CharacterData>,
  target: OverrideTarget,
  { value, note }: SetValueOverridePayload,
) {
  draft.build.overrides = draft.build.overrides.filter((entry) => entry.path !== target.path);
  const stored =
    target.kind === 'remaining'
      ? CounterCorrectionValueSchema.parse({
          kind: 'remaining-correction',
          remaining: value,
          spentBefore: target.override?.value.spentBefore ?? target.spent,
          spent: target.max - Number(value),
          max: target.max,
        })
      : value;
  draft.build.overrides.push({ path: target.path, value: stored, note });
  if (target.kind === 'remaining' && typeof stored === 'object')
    setSpent(draft.live, target.counter, stored.spent);
}

function applyReset(draft: Draft<CharacterData>, target: OverrideTarget) {
  draft.build.overrides = draft.build.overrides.filter((entry) => entry.path !== target.path);
  if (target.kind === 'remaining' && target.override)
    setSpent(draft.live, target.counter, target.override.value.spentBefore);
}

function safeNumbers(value: unknown): boolean {
  if (typeof value === 'number') return Number.isSafeInteger(value);
  if (typeof value !== 'object' || value === null) return true;
  return Object.values(value).every(safeNumbers);
}

/** Verify actual application: safe fallback may deliberately ignore an unsafe retained override. */
function prospectiveSet(
  ctx: CommandContext,
  target: OverrideTarget,
  payload: SetValueOverridePayload,
) {
  const next = produce({ build: ctx.build, live: ctx.live }, (draft) =>
    applySet(draft, target, payload),
  );
  if (equalData(next.build, ctx.build) && equalData(next.live, ctx.live))
    return [block('This override is already saved')];
  try {
    const sheet = computeSheet({ campaign: ctx.campaign, ...next }, ctx.registry);
    if (!safeNumbers(sheet)) return [block('This override produces unsafe calculated values')];
    const applied = overrideTargets({ ...ctx, ...next, sheet }).find(
      (entry) => entry.path === payload.path,
    );
    const accepted =
      applied?.override !== undefined &&
      applied.value === payload.value &&
      applied.note === payload.note &&
      (target.kind === 'remaining' ||
        ('calculated' in applied.override && applied.override.value === payload.value));
    return accepted ? [] : [block('This override produces unsafe calculated values')];
  } catch {
    return [block('This override produces unsafe calculated values')];
  }
}

/** Explicit replacements preserve raw choices and current resources; only their calculations change. */
export const setValueOverride: Command<SetValueOverridePayload> = {
  name: 'setValueOverride',
  check: (ctx, input) => {
    const parsed = SetPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Override details are invalid')];
    const payload = parsed.data;
    const target = overrideTargets(ctx).find((entry) => entry.path === payload.path);
    if (!target) return [block('This calculated value is not available for this character')];
    if (changedSinceReview(target, payload.expected))
      return [block('This value changed while editing. Review it before saving')];
    if (target.kind === 'die') {
      if (!DieSchema.safeParse(payload.value).success)
        return [block('Choose a supported die type')];
    } else if (
      typeof payload.value !== 'number' ||
      !Number.isSafeInteger(payload.value) ||
      payload.value < (target.domain.min ?? Number.MIN_SAFE_INTEGER) ||
      payload.value > (target.domain.max ?? Number.MAX_SAFE_INTEGER)
    ) {
      return [block(`${target.label} is outside its allowed range`)];
    }
    return prospectiveSet(ctx, target, payload);
  },
  apply: (draft, input, ctx) => {
    const payload = SetPayloadSchema.parse(input);
    const target = overrideTargets(ctx).find((entry) => entry.path === payload.path)!;
    applySet(draft, target, payload);
    return target.kind === 'remaining'
      ? `Correct ${target.label}: ${payload.value}/${target.max} (${payload.note})`
      : `Override ${target.label}: ${payload.value} (${payload.note})`;
  },
};

/** Reset removes this target's retained entries; an active correction also restores prior spending. */
export const resetValueOverride: Command<ResetValueOverridePayload> = {
  name: 'resetValueOverride',
  check: (ctx, input) => {
    const parsed = ResetPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Override reset details are invalid')];
    const { path, expected } = parsed.data;
    const target = overrideTargets(ctx).find((entry) => entry.path === path);
    if (!target) return [block('This calculated value is not available for this character')];
    if (changedSinceReview(target, expected))
      return [block('This value changed while editing. Review it before saving')];
    if (!target.hasOverride) return [block('This value has no override to reset')];
    try {
      const next = produce({ build: ctx.build, live: ctx.live }, (draft) =>
        applyReset(draft, target),
      );
      const sheet = computeSheet({ campaign: ctx.campaign, ...next }, ctx.registry);
      return safeNumbers(sheet) ? [] : [block('Reset would produce unsafe calculated values')];
    } catch {
      return [block('Reset would produce unsafe calculated values')];
    }
  },
  apply: (draft, input, ctx) => {
    const { path } = ResetPayloadSchema.parse(input);
    const target = overrideTargets(ctx).find((entry) => entry.path === path)!;
    applyReset(draft, target);
    return `Reset ${target.label} ${target.kind === 'remaining' ? 'correction' : 'override'}`;
  },
};
