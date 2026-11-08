import { z } from 'zod';
import { asiLevels, applyLevelChoices, LevelChoicesSchema } from '../calc/level-choices';
import { OPTION_FAMILIES, pendingChoices } from '../calc/pending-choices';
import { CharacterBuildSchema, refId, type CharacterBuild } from '../schema';
import type { Command, CommandContext } from './runner';
import { block } from './shared';

const ResolveChoicesPayloadSchema = z.strictObject({
  classId: refId('class'),
  choices: LevelChoicesSchema,
});

export type ResolveChoicesPayload = z.infer<typeof ResolveChoicesPayloadSchema>;

/**
 * The class level an ability score improvement belongs to: the first earned level that no
 * improvement was recorded for, after feats have used up the earliest ones.
 */
function openAsiLevel(ctx: CommandContext, classId: string, className: string): number | undefined {
  const level = ctx.build.classes.find((entry) => entry.classId === classId)?.level ?? 0;
  const used = new Set(
    ctx.build.abilityScores.bonuses
      .map((bonus) => bonus.source)
      .filter((source) => source.startsWith(`ASI: ${className} `))
      .map((source) => Number(source.slice(`ASI: ${className} `.length))),
  );
  const feats = ctx.build.featureIds.filter((id) => {
    const row = ctx.registry.entries.get(id);
    return row?.kind === 'feature' && row.origin === 'feat';
  }).length;
  return asiLevels(classId)
    .filter((at) => at <= level && !used.has(at))
    .slice(feats)[0];
}

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
    const family = OPTION_FAMILIES.find(
      (row) => row.classId === classId && id.startsWith(row.prefix),
    );
    if (!family) return { checks: [block('That feature is not a pick for this class')] };
    const picked = (choices.features ?? []).filter((other) => other.startsWith(family.prefix));
    const room = open.find((row) => row.prefix === family.prefix)?.count ?? 0;
    if (picked.length > room)
      return { checks: [block(`Only ${room} ${family.label} picks are open`)] };
  }

  let newLevel = entry.level;
  if (choices.asi !== undefined) {
    const at = openAsiLevel(ctx, classId, def.name);
    if (at === undefined) return { checks: [block('No ability score improvement is waiting')] };
    newLevel = at;
  }
  const applied = applyLevelChoices({
    campaign: ctx.campaign,
    build: ctx.build,
    registry: ctx.registry,
    score: (ability) => ctx.sheet.abilities[ability].score.value,
    classId,
    newLevel,
    choices,
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
