import { z } from 'zod';
import { featureProficiencies, proficiencyPickProblem } from '../calc/proficiencies';
import { computeSheet } from '../calc/sheet';
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
  const withoutThisPick = {
    ...ctx.build,
    proficiencyPicks: Object.fromEntries(
      Object.entries(ctx.build.proficiencyPicks ?? {}).filter(([id]) => id !== featureId),
    ),
  };
  const fromElsewhere = new Set<string>(
    featureProficiencies(withoutThisPick, ctx.sheet.features).proficiencies.skills,
  );
  const problem = proficiencyPickProblem(owned.def, picks, ctx.registry, fromElsewhere);
  if (problem) return { problem };
  const next = computeSheet(
    {
      ...ctx,
      build: {
        ...ctx.build,
        proficiencyPicks: { ...ctx.build.proficiencyPicks, [featureId]: picks },
      },
    },
    ctx.registry,
  ).proficiencies;
  const before = ctx.sheet.proficiencies;
  const has = (proficiencies: typeof next, id: string) =>
    [...proficiencies.skills, ...proficiencies.tools].includes(id);
  const stranded = before.expertise.find(
    (id) => next.expertise.includes(id) && has(before, id) && !has(next, id),
  );
  if (stranded)
    return {
      problem: `Expertise in ${label(stranded, ctx)} needs this proficiency. Change that expertise pick first.`,
    };
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
