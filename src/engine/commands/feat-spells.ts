import { z } from 'zod';
import { featSpellPickProblem } from '../calc/feat-spells';
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
  const problem = featSpellPickProblem(ctx.registry, ctx.campaign, owned.def, choice);
  return problem ? { problem } : { choice, name: owned.def.name };
}

/** Records the spells (and class or ability) picked for a feat or racial trait. */
export const chooseFeatSpells: Command<ChooseFeatSpellsPayload> = {
  name: 'chooseFeatSpells',
  check: (ctx, input) => {
    const { problem } = prepare(ctx, input);
    return problem ? [block(problem)] : [];
  },
  apply: (draft, input, ctx) => {
    const { choice, name } = prepare(ctx, input);
    if (!choice) throw new Error('Invalid feat spells reached Apply');
    const { featureId, ...stored } = choice;
    draft.build.featSpells = { ...draft.build.featSpells, [featureId]: stored };
    const spells = choice.spellIds.map((id) => ctx.registry.get('spell', id).name);
    return `${name}: chose ${spells.length > 0 ? spells.join(', ') : 'options'}`;
  },
};
