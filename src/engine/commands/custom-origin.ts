import { z } from 'zod';
import { optionalRules } from '../calc/campaign-rules';
import { AbilitySchema } from '../schema';
import { racialGrantIndexes } from './edit-build';
import type { Check, Command, CommandContext } from './runner';
import { block } from './shared';

export const CUSTOM_ORIGIN_SOURCE = 'Custom origin';

const CustomOriginPayloadSchema = z.strictObject({
  increases: z.array(
    z.strictObject({ ability: AbilitySchema, value: z.union([z.literal(1), z.literal(2)]) }),
  ),
});

export type CustomOriginPayload = z.infer<typeof CustomOriginPayloadSchema>;

/** Tasha: +2 and +1 to two different abilities, or +1 to three different abilities. */
function shapeIssue(increases: CustomOriginPayload['increases']): string | undefined {
  const values = increases.map(({ value }) => value).sort();
  const distinct = new Set(increases.map(({ ability }) => ability)).size === increases.length;
  const valid =
    (values.length === 2 && values[0] === 1 && values[1] === 2) ||
    (values.length === 3 && values.every((value) => value === 1));
  if (!valid || !distinct)
    return 'Raise two different abilities by +2 and +1, or three different abilities by +1';
  return undefined;
}

function check(ctx: CommandContext, payload: CustomOriginPayload): Check[] {
  const parsed = CustomOriginPayloadSchema.safeParse(payload);
  if (!parsed.success) return [block('Custom origin details are invalid')];
  if (!optionalRules(ctx.campaign).customOrigin)
    return [block("This campaign does not use Tasha's custom origin")];
  const issue = shapeIssue(parsed.data.increases);
  if (issue) return [block(issue)];
  const mine = ctx.build.abilityScores.bonuses;
  const removed = new Set([...racialGrantIndexes(ctx.build, ctx.registry)]);
  mine.forEach((bonus, index) => bonus.source === CUSTOM_ORIGIN_SOURCE && removed.add(index));
  const kept = mine.filter((_bonus, index) => !removed.has(index));
  for (const { ability, value } of parsed.data.increases) {
    const total =
      ctx.build.abilityScores.base[ability] +
      kept
        .filter((bonus) => bonus.ability === ability)
        .reduce((sum, bonus) => sum + bonus.value, 0) +
      value;
    if (total > 20) return [block(`${ability} cannot go above 20`)];
  }
  return [];
}

/** Replaces the race's ability bonuses (and any earlier custom origin) with the chosen increases. */
export const setCustomOrigin: Command<CustomOriginPayload> = {
  name: 'setCustomOrigin',
  check,
  apply: ({ build }, payload, ctx) => {
    const { increases } = CustomOriginPayloadSchema.parse(payload);
    const removed = racialGrantIndexes(ctx.build, ctx.registry);
    build.abilityScores.bonuses = [
      ...build.abilityScores.bonuses.filter(
        (bonus, index) => !removed.has(index) && bonus.source !== CUSTOM_ORIGIN_SOURCE,
      ),
      ...increases.map(({ ability, value }) => ({ source: CUSTOM_ORIGIN_SOURCE, ability, value })),
    ];
    return `Custom origin: ${increases.map(({ ability, value }) => `${ability} +${value}`).join(', ')}`;
  },
};
