import { z } from 'zod';
import {
  ELIXIR_DETAILS,
  ELIXIR_RESULTS,
  elixirRestLimit,
  RESTORATIVE_REAGENTS,
} from '../calc/elixirs';
import type { LiveState } from '../schema';
import type { Command, CommandContext } from './runner';
import {
  block,
  deadCheck,
  economyChecks,
  rangeCheck,
  restoreHp,
  spendEconomy,
  timeRangeChecks,
  uniqueEffectId,
  warn,
  withNotes,
} from './shared';

function suppliesChecks(ctx: CommandContext) {
  return ctx.build.items.some(
    ({ itemId, instanceId }) =>
      itemId === 'item.alchemists-supplies' && (ctx.live.items[instanceId]?.qty ?? 0) > 0,
  )
    ? []
    : [warn('Alchemist’s supplies are required to make an elixir')];
}

export function elixirRestChecks(ctx: CommandContext, rolls?: number[]) {
  if (!rolls?.length) return [];
  const limit = elixirRestLimit(ctx.sheet.features);
  if (rolls.length > limit)
    return [block(`You can make up to ${limit} Experimental Elixir(s) at this rest`)];
  return [...suppliesChecks(ctx), ...rolls.flatMap((roll) => rangeCheck('Elixir d6', roll, 1, 6))];
}

export function restElixirs(
  live: LiveState,
  eventId: string,
  rolls: readonly number[] = [],
): string[] {
  const old = live.experimentalElixirs?.length ?? 0;
  const fresh = rolls.map((roll, index) => ({
    id: `${eventId}:elixir:${index}`,
    result: ELIXIR_RESULTS[roll - 1]!,
  }));
  if (fresh.length) live.experimentalElixirs = fresh;
  else delete live.experimentalElixirs;
  return [
    ...(old ? [`${old} unused elixir(s) expired`] : []),
    ...(fresh.length
      ? [`made ${fresh.map(({ result }) => ELIXIR_DETAILS[result].name).join(', ')} elixir(s)`]
      : []),
  ];
}

export function elixirSlots(
  ctx: Pick<CommandContext, 'live' | 'sheet'>,
): { id: string; label: string }[] {
  const { live, sheet } = ctx;
  const options = sheet.slots.max.flatMap((max, level) =>
    level > 0 && max > (live.slotsUsed[level] ?? 0)
      ? [{ id: String(level), label: `Level ${level} slot` }]
      : [],
  );
  const pact = sheet.slots.pact;
  if (pact && pact.count > (live.pactSlotsUsed ?? 0))
    options.push({ id: 'pact', label: `Level ${pact.level} Pact Magic slot` });
  return options;
}

const BrewSchema = z.strictObject({
  result: z.enum(ELIXIR_RESULTS),
  slot: z.union([z.literal('pact'), z.int().min(1).max(9)]),
});

export const brewExperimentalElixir: Command<z.infer<typeof BrewSchema>> = {
  name: 'brewExperimentalElixir',
  check: (ctx, payload) => {
    const parsed = BrewSchema.safeParse(payload);
    if (!parsed.success || !elixirRestLimit(ctx.sheet.features))
      return [block('Experimental Elixir is unavailable')];
    if (!elixirSlots(ctx).some(({ id }) => id === String(parsed.data.slot)))
      return [block('Choose an available spell slot')];
    return [...deadCheck(ctx), ...economyChecks(ctx, 'action'), ...suppliesChecks(ctx)];
  },
  apply: ({ live }, { result, slot }, ctx) => {
    if (slot === 'pact') live.pactSlotsUsed = (live.pactSlotsUsed ?? 0) + 1;
    else live.slotsUsed[slot] = (live.slotsUsed[slot] ?? 0) + 1;
    spendEconomy(live, 'action');
    (live.experimentalElixirs ??= []).push({ id: `${ctx.eventId}:elixir`, result });
    const cost = slot === 'pact' ? 'Pact Magic slot' : `level ${slot} slot`;
    return `Brewed a ${ELIXIR_DETAILS[result].name} elixir (${cost})`;
  },
};

const UseSchema = z.strictObject({
  id: z.string().min(1),
  mode: z.enum(['self', 'administer', 'other']),
  healRoll: z.number().optional(),
  tempHpRoll: z.number().optional(),
});

export function hasRestorativeReagents(ctx: Pick<CommandContext, 'sheet'>) {
  return ctx.sheet.features.some(({ def }) => def.id === RESTORATIVE_REAGENTS);
}

export const useExperimentalElixir: Command<z.infer<typeof UseSchema>> = {
  name: 'useExperimentalElixir',
  check: (ctx, input) => {
    const parsed = UseSchema.safeParse(input);
    if (!parsed.success) return [block('Invalid elixir use')];
    const { id, mode, healRoll, tempHpRoll } = parsed.data;
    const elixir = ctx.live.experimentalElixirs?.find((row) => row.id === id);
    if (!elixir) return [block('That elixir is no longer available')];
    const checks = mode === 'other' ? [] : [...deadCheck(ctx), ...economyChecks(ctx, 'action')];
    if (mode !== 'self') return checks;
    if (elixir.result === 'healing')
      checks.push(...rangeCheck('Healing 2d4 total', healRoll ?? NaN, 2, 8));
    if (hasRestorativeReagents(ctx))
      checks.push(...rangeCheck('Temporary HP 2d6 total', tempHpRoll ?? NaN, 2, 12));
    checks.push(
      ...timeRangeChecks(ctx.live.clock.seconds, ELIXIR_DETAILS[elixir.result].duration ?? 0),
    );
    return checks;
  },
  apply: ({ live }, { id, mode, healRoll, tempHpRoll }, ctx) => {
    const elixir = live.experimentalElixirs!.find((row) => row.id === id)!;
    const { name, note, duration, modifiers } = ELIXIR_DETAILS[elixir.result];
    live.experimentalElixirs = live.experimentalElixirs!.filter((row) => row.id !== id);
    if (mode !== 'other') spendEconomy(live, 'action');
    const notes: string[] = [];
    if (mode === 'self') {
      const int = ctx.sheet.abilities.INT.mod;
      if (elixir.result === 'healing') {
        const { before, after } = restoreHp(
          live,
          Math.max(0, healRoll! + int),
          ctx.sheet.maxHp.value,
        );
        notes.push(`HP ${before} → ${after}`);
      }
      if (hasRestorativeReagents(ctx)) {
        live.tempHp = Math.max(live.tempHp, tempHpRoll! + int);
        notes.push(`${live.tempHp} temporary HP`);
      }
      if (duration)
        live.effects.push({
          id: uniqueEffectId(live, elixir.id),
          name: `${name} elixir`,
          concentration: false,
          conditions: [],
          modifiers: modifiers ?? [],
          note,
          endsAt: live.clock.seconds + duration,
        });
    } else notes.push('recipient resolves the effect');
    const verb =
      mode === 'other'
        ? 'Another creature drank'
        : mode === 'administer'
          ? 'Administered'
          : 'Drank';
    return withNotes(`${verb} the ${name} elixir`, notes);
  },
};
