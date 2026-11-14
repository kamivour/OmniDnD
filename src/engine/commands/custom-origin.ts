import { z } from 'zod';
import { optionalRules } from '../calc/campaign-rules';
import { CUSTOM_ORIGIN_SOURCE, customOriginIssue } from '../calc/custom-origin';
import { AbilitySchema } from '../schema';
import { racialGrantIndexes } from './edit-build';
import type { Check, Command, CommandContext } from './runner';
import { block } from './shared';

export { CUSTOM_ORIGIN_SOURCE };

const CustomOriginPayloadSchema = z.strictObject({
  increases: z.array(
    z.strictObject({ ability: AbilitySchema, value: z.union([z.literal(1), z.literal(2)]) }),
  ),
});

export type CustomOriginPayload = z.infer<typeof CustomOriginPayloadSchema>;

function check(ctx: CommandContext, payload: CustomOriginPayload): Check[] {
  const parsed = CustomOriginPayloadSchema.safeParse(payload);
  if (!parsed.success) return [block('Custom origin details are invalid')];
  if (!optionalRules(ctx.campaign).customOrigin)
    return [block("This campaign does not use Tasha's custom origin")];
  const race = ctx.registry.entries.get(ctx.build.subraceId ?? ctx.build.raceId);
  if (race?.kind !== 'race') return [block('Choose a race first')];
  const issue = customOriginIssue(race, parsed.data.increases);
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

/** Moves the race's ability increases (replacing any earlier custom origin) to the chosen abilities. */
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
