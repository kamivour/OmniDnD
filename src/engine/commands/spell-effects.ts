import type { LiveState, SpellDef } from '../schema';
import type { CommandContext } from './runner';
import { dropConcentration, restoreHp, uniqueEffectId } from './shared';

interface SpellEffectChoices {
  level?: number;
  onSelf?: boolean;
  healAmount?: number;
  /** Only this character's concentration and automatic self effects are recorded. */
  otherHolder?: boolean;
}

/** Apply the spell's result after the command pays for its casting or item activation. */
export function applySpellEffects(
  live: LiveState,
  spell: SpellDef,
  { level, onSelf, healAmount, otherHolder }: SpellEffectChoices,
  ctx: Pick<CommandContext, 'registry' | 'sheet'>,
): string[] {
  const notes: string[] = [];
  const endsAt =
    spell.duration.seconds === undefined ? undefined : live.clock.seconds + spell.duration.seconds;
  const concentrate = spell.duration.concentration && !otherHolder;
  if (concentrate) {
    const ended = dropConcentration(live, ctx.registry);
    if (ended) notes.push(`concentration on ${ended} ended`);
    live.concentration = {
      spellId: spell.id,
      ...(level === undefined ? {} : { slotLevel: level }),
      ...(endsAt === undefined ? {} : { endsAt }),
    };
  }

  const template = spell.effect;
  if (
    template &&
    ((template.target === 'self' && !otherHolder) || (template.target === 'any' && onSelf))
  ) {
    const id = uniqueEffectId(live, spell.id);
    live.effects.push({
      id,
      name: spell.name,
      sourceId: spell.id,
      ...(endsAt === undefined ? {} : { endsAt }),
      concentration: concentrate,
      conditions: [...(template.conditions ?? [])],
      modifiers: [...(template.modifiers ?? [])],
      ...(template.note === undefined ? {} : { note: template.note }),
    });
    if (concentrate && live.concentration) live.concentration.effectId = id;
    notes.push(`${spell.name} on you`);
  }
  if (healAmount !== undefined) {
    const { before, after } = restoreHp(live, healAmount, ctx.sheet.maxHp.value);
    notes.push(`healed ${healAmount} (HP ${before} → ${after})`);
  }
  return notes;
}
