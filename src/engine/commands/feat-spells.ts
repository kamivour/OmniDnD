import { z } from 'zod';
import {
  featSpellPickProblem,
  featSpellReassignmentClass,
  freeUseKey,
  otherClassSpells,
} from '../calc/feat-spells';
import { AbilitySchema, refId } from '../schema';
import type { Command, CommandContext } from './runner';
import { block } from './shared';

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
  );
  const other = otherClassSpells(ctx.registry, ctx.build, owned.def);
  if (!problem && choice.spellIds.some((id) => other.has(id)))
    return { problem: 'The class already knows one of these spells' };
  return problem ? { problem } : { choice, def: owned.def };
}

/** Records the spells (and class or ability) picked for a feat or racial trait. */
export const chooseFeatSpells: Command<ChooseFeatSpellsPayload> = {
  name: 'chooseFeatSpells',
  check: (ctx, input) => {
    const { problem } = prepare(ctx, input);
    return problem ? [block(problem)] : [];
  },
  apply: (draft, input, ctx) => {
    const { choice, def } = prepare(ctx, input);
    if (!choice || !def) throw new Error('Invalid feat spells reached Apply');
    const { featureId, ...stored } = choice;
    // A correction must not restore a spent free casting, such as an Arcanum.
    const previous = draft.build.featSpells?.[featureId]?.spellIds ?? [];
    const picked = def.spells?.picks ?? [];
    const used = draft.live.featSpellsUsed;
    if (
      used &&
      picked.length === 1 &&
      picked[0]?.count === 1 &&
      picked[0].free !== 'will' &&
      picked[0].free
    ) {
      for (const [index, spellId] of previous.entries()) {
        const oldKey = freeUseKey(featureId, spellId);
        const nextId = stored.spellIds[index];
        if (nextId === undefined || nextId === spellId || !used[oldKey]) continue;
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
    return `${def.name}: chose ${spells.length > 0 ? spells.join(', ') : 'options'}`;
  },
};
