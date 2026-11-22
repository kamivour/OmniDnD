import { z } from 'zod';
import { applyLevelChoices, LevelChoicesSchema } from '../calc/level-choices';
import { openAsiChoices } from '../calc/asi-choices';
import {
  familyIncludes,
  FEAT_OPTION_FAMILIES,
  OPTION_FAMILIES,
  pendingChoices,
  RACE_OPTION_FAMILIES,
} from '../calc/pending-choices';
import { CharacterBuildSchema, refId, type CharacterBuild } from '../schema';
import type { Command, CommandContext } from './runner';
import { block } from './shared';

const ResolveChoicesPayloadSchema = z.strictObject({
  classId: refId('class'),
  choices: LevelChoicesSchema,
});

export type ResolveChoicesPayload = z.infer<typeof ResolveChoicesPayloadSchema>;

function prepare(ctx: CommandContext, input: ResolveChoicesPayload) {
  const parsed = ResolveChoicesPayloadSchema.safeParse(input);
  if (!parsed.success) return { checks: [block('Choice details are invalid')] };
  const { classId, choices } = parsed.data;
  const def = ctx.registry.entries.get(classId);
  const entry = ctx.build.classes.find((row) => row.classId === classId);
  if (def?.kind !== 'class' || !entry)
    return { checks: [block('The class is not on this character')] };
  const open = pendingChoices(ctx, ctx.registry);
  const has = (kind: string) => open.some((row) => row.kind === kind && row.classId === classId);
  const openAsi = open.some((row) => row.kind === 'asi');

  if (choices.subclassId !== undefined && !has('subclass'))
    return { checks: [block(`${def.name} has no subclass to choose`)] };
  if (choices.asi !== undefined && !openAsi)
    return { checks: [block('No ability score improvement is waiting')] };
  const expertise = open.find((row) => row.kind === 'expertise' && row.classId === classId);
  if ((choices.expertise?.length ?? 0) > (expertise?.count ?? 0))
    return { checks: [block(`Only ${expertise?.count ?? 0} expertise picks are open`)] };
  for (const id of choices.features ?? []) {
    const family =
      OPTION_FAMILIES.find((row) => row.classId === classId && familyIncludes(row, id)) ??
      RACE_OPTION_FAMILIES.find(
        (row) =>
          (row.raceId === ctx.build.raceId || row.raceId === ctx.build.subraceId) &&
          familyIncludes(row, id),
      ) ??
      FEAT_OPTION_FAMILIES.find(
        (row) => ctx.build.featureIds.includes(row.featId) && familyIncludes(row, id),
      );
    if (!family) return { checks: [block('That feature is not a pick for this class')] };
    const picked = (choices.features ?? []).filter((other) => familyIncludes(family, other));
    // A class list and a feat (Fighting Initiate) can share a prefix; their open picks add up.
    const rows = open.filter((row) => row.kind === 'option' && row.prefix === family.prefix);
    const room = rows.reduce((sum, row) => sum + row.count, 0);
    if (picked.length > room)
      return { checks: [block(`Only ${room} ${family.label} picks are open`)] };
    if (!rows.some((row) => row.optionIds?.includes(id)))
      return { checks: [block('That option is not available in this campaign')] };
  }

  let newLevel = entry.level;
  if (choices.asi !== undefined) {
    const at = openAsiChoices(ctx.build, ctx.registry).find(
      (row) => row.classId === classId,
    )?.level;
    if (at === undefined) return { checks: [block('No ability score improvement is waiting')] };
    newLevel = at;
  }
  const applied = applyLevelChoices({
    campaign: ctx.campaign,
    build: ctx.build,
    registry: ctx.registry,
    score: (ability) => {
      const score = ctx.sheet.abilities[ability].score;
      // A deferred ASI still applies to the score earned before Primal Champion.
      return (
        score.value - (score.parts.find(({ label }) => label === 'Primal Champion')?.value ?? 0)
      );
    },
    classId,
    newLevel,
    choices,
    granted: ctx.sheet.proficiencies,
  });
  if ('blocked' in applied) return { checks: [block(applied.blocked)] };
  if (!CharacterBuildSchema.safeParse(applied.build).success)
    return { checks: [block('These choices would leave an invalid character')] };
  return { checks: [], build: applied.build as CharacterBuild, summary: applied.summary };
}

/** Settles skipped level choices (subclass, ability increase or feat, expertise, class picks) later. */
export const resolveChoices: Command<ResolveChoicesPayload> = {
  name: 'resolveChoices',
  check: (ctx, input) => prepare(ctx, input).checks,
  apply: (draft, input, ctx) => {
    const next = prepare(ctx, input);
    if (!next.build) throw new Error('Invalid choices reached Apply');
    draft.build.classes = next.build.classes;
    draft.build.proficiencies = next.build.proficiencies;
    draft.build.abilityScores.bonuses = next.build.abilityScores.bonuses;
    draft.build.featureIds = next.build.featureIds;
    return `Chose: ${next.summary.join(', ')}`;
  },
};
