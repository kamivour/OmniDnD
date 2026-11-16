import { z } from 'zod';
import { proficiencyPickProblem } from '../calc/proficiencies';
import { ProficiencyPicksSchema, refId } from '../schema';
import type { Command, CommandContext } from './runner';
import { block, warn } from './shared';

const ChooseProficienciesPayloadSchema = ProficiencyPicksSchema.extend({
  featureId: refId('feature'),
});

export type ChooseProficienciesPayload = z.infer<typeof ChooseProficienciesPayloadSchema>;

function prepare(ctx: CommandContext, input: ChooseProficienciesPayload) {
  const parsed = ChooseProficienciesPayloadSchema.safeParse(input);
  if (!parsed.success) return { problem: 'Proficiency choice details are invalid' };
  const { featureId, ...picks } = parsed.data;
  const owned = ctx.sheet.features.find(({ def }) => def.id === featureId);
  if (!owned) return { problem: 'That trait or feature is not on this character' };
  // Skills this feature gave before do not count: the new picks replace them.
  const previous = new Set(ctx.build.proficiencyPicks?.[featureId]?.skills ?? []);
  const fromElsewhere = new Set<string>(
    ctx.sheet.proficiencies.skills.filter(
      (skill) => !previous.has(skill) || ctx.build.proficiencies.skills.includes(skill),
    ),
  );
  const problem = proficiencyPickProblem(owned.def, picks, ctx.registry, fromElsewhere);
  if (problem) return { problem };
  // Skills picked for an expertise row (Blessings of Knowledge) are fine to repeat.
  const doubles = (skill: string) =>
    owned.def.proficiencies?.choose?.some(
      (row) => row.expertise && (row.skills ?? []).some((option) => option === skill),
    ) ?? false;
  const repeated = (picks.skills ?? []).filter(
    (skill) => fromElsewhere.has(skill) && !doubles(skill),
  );
  return { featureId, picks, name: owned.def.name, repeated };
}

const label = (value: string, ctx: CommandContext) =>
  ctx.registry.entries.get(value)?.name ?? value.replaceAll('-', ' ');

/** Records the skills, tools, languages or darkvision picked for a race trait or class feature. */
export const chooseProficiencies: Command<ChooseProficienciesPayload> = {
  name: 'chooseProficiencies',
  check: (ctx, input) => {
    const prepared = prepare(ctx, input);
    if (prepared.problem) return [block(prepared.problem)];
    const repeated = prepared.repeated ?? [];
    return repeated.length > 0
      ? [warn(`Already proficient: ${repeated.map((skill) => label(skill, ctx)).join(', ')}`)]
      : [];
  },
  apply: (draft, input, ctx) => {
    const { featureId, picks, name } = prepare(ctx, input);
    if (!featureId || !picks) throw new Error('Invalid proficiency picks reached Apply');
    draft.build.proficiencyPicks = { ...draft.build.proficiencyPicks, [featureId]: picks };
    const chosen = [
      ...(picks.skills ?? []),
      ...(picks.expertise ?? []).map((skill) => `${skill} expertise`),
      ...(picks.tools ?? []),
      ...(picks.languages ?? []),
      ...(picks.darkvision ? ['darkvision'] : []),
    ].map((value) => label(value, ctx));
    return `${name}: chose ${chosen.join(', ')}`;
  },
};
