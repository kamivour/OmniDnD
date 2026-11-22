import { z } from 'zod';
import {
  featSpellPickProblem,
  featSpellReassignmentClass,
  freeUseKey,
  otherClassSpells,
  wizardSpellbook,
} from '../calc/feat-spells';
import { AbilitySchema, refId } from '../schema';
import type { Command, CommandContext } from './runner';
import { block, passTime, timeRangeChecks, withNotes } from './shared';
import { SECONDS_PER_HOUR } from '../rules2014';

const ChooseFeatSpellsPayloadSchema = z.strictObject({
  featureId: refId('feature'),
  classId: refId('class').optional(),
  ability: AbilitySchema.optional(),
  spellIds: z.array(refId('spell')),
});

export type ChooseFeatSpellsPayload = z.infer<typeof ChooseFeatSpellsPayloadSchema>;

function prepare(ctx: CommandContext, input: ChooseFeatSpellsPayload) {
  const parsed = ChooseFeatSpellsPayloadSchema.safeParse(input);
  if (!parsed.success) return { problem: 'Spell choice details are invalid' };
  const choice = parsed.data;
  const owned = ctx.sheet.features.find(({ def }) => def.id === choice.featureId);
  if (!owned) return { problem: 'That feat or trait is not on this character' };
  const spellList = owned.def.spells?.picks?.find((pick) => pick.spellList)?.spellList;
  const subclass = ctx.build.classes.find((row) => row.classId === spellList)?.subclassId;
  const problem = featSpellPickProblem(
    ctx.registry,
    ctx.campaign,
    owned.def,
    choice,
    subclass,
    ctx.build.featSpells?.[choice.featureId]?.spellIds,
    owned.def.spells?.spellbook ? wizardSpellbook(ctx.build).known : undefined,
  );
  const other = otherClassSpells(ctx.registry, ctx.build, owned.def);
  if (!problem && choice.spellIds.some((id) => other.has(id)))
    return { problem: 'The class already knows one of these spells' };
  const previous = ctx.build.featSpells?.[choice.featureId]?.spellIds;
  const study =
    owned.def.spells?.spellbook === 'prepared' &&
    previous?.some(
      (id) => wizardSpellbook(ctx.build).known.has(id) && !choice.spellIds.includes(id),
    )
      ? 8 * SECONDS_PER_HOUR
      : 0;
  return problem ? { problem } : { choice, def: owned.def, study };
}

/** Records the spells (and class or ability) picked for a feat or racial trait. */
export const chooseFeatSpells: Command<ChooseFeatSpellsPayload> = {
  name: 'chooseFeatSpells',
  check: (ctx, input) => {
    const { problem, study } = prepare(ctx, input);
    if (problem) return [block(problem)];
    if (study && ctx.live.combat) return [block('End combat before studying your spellbook')];
    return study ? timeRangeChecks(ctx.live.clock.seconds, study) : [];
  },
  apply: (draft, input, ctx) => {
    const { choice, def, study } = prepare(ctx, input);
    if (!choice || !def) throw new Error('Invalid feat spells reached Apply');
    const { featureId, ...stored } = choice;
    // A correction must not restore a spent free casting, such as an Arcanum.
    const previous = draft.build.featSpells?.[featureId]?.spellIds ?? [];
    const picked = def.spells?.picks ?? [];
    const used = draft.live.featSpellsUsed;
    if (used && picked.length === 1 && picked[0]?.free && picked[0].free !== 'will') {
      const removed = previous.filter((id) => !stored.spellIds.includes(id));
      const added = stored.spellIds.filter((id) => !previous.includes(id));
      let next = 0;
      for (const spellId of removed) {
        const oldKey = freeUseKey(featureId, spellId);
        if (!used[oldKey]) continue;
        const nextId = added[next++];
        if (nextId === undefined) continue;
        used[freeUseKey(featureId, nextId)] = used[oldKey]!;
        delete used[oldKey];
      }
    }
    draft.build.featSpells = { ...draft.build.featSpells, [featureId]: stored };
    const reassign = featSpellReassignmentClass(def);
    if (reassign) {
      const moved = new Set(stored.spellIds);
      for (const entry of draft.build.spells) {
        if (entry.classId !== reassign) continue;
        entry.known = entry.known.filter((id) => !moved.has(id));
        if (entry.prepared) entry.prepared = entry.prepared.filter((id) => !moved.has(id));
      }
    }
    const spells = choice.spellIds.map((id) => ctx.registry.get('spell', id).name);
    const summary = `${def.name}: chose ${spells.length > 0 ? spells.join(', ') : 'options'}`;
    return study ? withNotes(summary, ['8 h study', ...passTime(draft.live, study, ctx)]) : summary;
  },
};
