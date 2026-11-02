import { SECONDS_PER_HOUR, SECONDS_PER_MINUTE } from '../rules2014';
import type { SpellDef } from '../schema';
import type { Check, Command, CommandContext } from './runner';
import { previewSpellHealing, spellCastDetails, type SpellCastDetails } from './spell-options';
import {
  block,
  deadCheck,
  dropConcentration,
  economyChecks,
  info,
  passTime,
  rangeCheck,
  restoreHp,
  spendEconomy,
  uniqueEffectId,
  warn,
  withNotes,
  type EconomySlot,
} from './shared';

export interface CastSpellPayload {
  spellId: string;
  /** Slot level to spend. Absent for cantrips, rituals and Pact Magic. */
  slotLevel?: number;
  /** Spend a Pact Magic slot; it is always cast at the pact slot level. */
  pact?: boolean;
  /** Cast as a ritual: no slot, 10 minutes longer. */
  ritual?: boolean;
  /** The caster picked themself as the target of a spell whose effect can land on anyone. */
  onSelf?: boolean;
  /** Healing on yourself: the dice total you rolled, before the casting modifier. */
  healRoll?: number;
  /** Class whose spellcasting ability applies. Default: the class that knows the spell. */
  classId?: string;
}

/** Ritual casting takes 10 minutes longer than the spell's casting time (PHB 2014). */
const RITUAL_EXTRA_SECONDS = 10 * SECONDS_PER_MINUTE;

const ECONOMY_BY_COST: Partial<Record<SpellDef['casting']['cost'], EconomySlot>> = {
  action: 'action',
  bonus: 'bonus',
  reaction: 'reaction',
};

/** Seconds of casting beyond a single action, bonus action or reaction. */
function castingSeconds(spell: SpellDef, ritual: boolean): number {
  const { cost, amount = 0 } = spell.casting;
  const base =
    cost === 'minutes'
      ? amount * SECONDS_PER_MINUTE
      : cost === 'hours'
        ? amount * SECONDS_PER_HOUR
        : 0;
  return base + (ritual ? RITUAL_EXTRA_SECONDS : 0);
}

/** The slot level the spell is cast at, or undefined for a cantrip or ritual. */
function castLevel(ctx: CommandContext, spell: SpellDef, payload: CastSpellPayload) {
  if (payload.ritual || spell.level === 0) return undefined;
  return payload.pact ? ctx.sheet.slots.pact?.level : payload.slotLevel;
}

function slotChecks(ctx: CommandContext, spell: SpellDef, payload: CastSpellPayload): Check[] {
  const { sheet, live } = ctx;
  if (payload.ritual) {
    if (!spell.ritual) return [block(`${spell.name} is not a ritual`)];
    if (payload.slotLevel !== undefined || payload.pact) {
      return [block('A ritual uses no spell slot')];
    }
    return [];
  }
  if (spell.level === 0) {
    return payload.slotLevel !== undefined || payload.pact
      ? [block('Cantrips use no spell slot')]
      : [];
  }
  if (payload.pact) {
    const pact = sheet.slots.pact;
    if (!pact) return [block('You have no Pact Magic slots')];
    if (pact.level < spell.level) return [block(`Pact slots are level ${pact.level}`)];
    if ((live.pactSlotsUsed ?? 0) >= pact.count) return [block('No pact slots left')];
    return [];
  }
  const level = payload.slotLevel;
  if (level === undefined) return [block('Choose a slot level')];
  const range = rangeCheck('Slot level', level, 1, 9);
  if (range.length > 0) return range;
  if (level < spell.level) {
    return [block(`${spell.name} needs a slot of level ${spell.level} or higher`)];
  }
  if ((live.slotsUsed[level] ?? 0) >= (sheet.slots.max[level] ?? 0)) {
    return [block(`No level ${level} slots left`)];
  }
  return [];
}

function healChecks(spell: SpellDef, details: SpellCastDetails, roll: number): Check[] {
  const heal = details.healing;
  if (!heal) return [block(`${spell.name} does not heal`)];
  const checks = rangeCheck('Healing roll', roll, heal.minRoll, heal.maxRoll);
  if (heal.modifier === undefined)
    checks.push(block(`${spell.name}'s healing modifier is unavailable for this casting class`));
  return checks;
}

/**
 * PHB 2014: after a bonus-action spell, the only other spell you may cast that turn is a cantrip
 * with a casting time of 1 action. Tracked only during your own turn.
 */
function bonusActionSpellChecks({ live }: CommandContext, spell: SpellDef): Check[] {
  const combat = live.combat;
  if (!combat?.turnActive) return [];
  const isBonus = spell.casting.cost === 'bonus';
  const isActionCantrip = spell.level === 0 && spell.casting.cost === 'action';
  const { bonusActionSpellCast, otherSpellCast } = combat.economy;
  if ((isBonus && otherSpellCast) || (bonusActionSpellCast && !isActionCantrip)) {
    return [
      warn(
        'Bonus-action spell rule: only a 1-action cantrip can share a turn with a bonus-action spell',
      ),
    ];
  }
  return [];
}

function knowsSpell({ build }: CommandContext, spellId: string): string | undefined {
  return build.spells.find(
    (list) => list.known.includes(spellId) || list.prepared?.includes(spellId),
  )?.classId;
}

export const castSpell: Command<CastSpellPayload> = {
  name: 'castSpell',
  check: (ctx, payload) => {
    const spell = ctx.registry.get('spell', payload.spellId);
    const details = spellCastDetails(ctx, {
      ...payload,
      slotLevel: castLevel(ctx, spell, payload),
    });
    const checks = [...deadCheck(ctx), ...slotChecks(ctx, spell, payload)];
    if (details.classId !== undefined && !details.selected)
      checks.push(warn(`${spell.name} is not selected for this casting class`));
    else if (!knowsSpell(ctx, spell.id)) checks.push(warn(`You don't know ${spell.name}`));
    if (!payload.ritual && details.needsPreparation && !details.preparedForCasting)
      checks.push(warn(`${spell.name} is not prepared for this casting class`));
    if (payload.ritual && details.classId !== undefined && details.ritualReason)
      checks.push(warn(details.ritualReason));
    if (payload.healRoll !== undefined) {
      checks.push(...healChecks(spell, details, payload.healRoll));
    }
    if (payload.onSelf && !spell.effect) {
      checks.push(block(`${spell.name} puts no effect on a target`));
    }

    const slot = ECONOMY_BY_COST[spell.casting.cost];
    if (slot) checks.push(...economyChecks(ctx, slot));
    if (ctx.live.combat && castingSeconds(spell, payload.ritual ?? false) > 0) {
      checks.push(warn(`${spell.name} takes longer than a turn to cast`));
    }
    checks.push(...bonusActionSpellChecks(ctx, spell));

    if (spell.duration.concentration && ctx.live.concentration) {
      const current = ctx.registry.get('spell', ctx.live.concentration.spellId);
      checks.push(info(`Ends concentration on ${current.name}`));
    }
    return checks;
  },
  apply: ({ live }, payload, ctx) => {
    const spell = ctx.registry.get('spell', payload.spellId);
    const ritual = payload.ritual ?? false;
    const level = castLevel(ctx, spell, payload);
    const notes: (string | undefined)[] = [];

    if (payload.pact) live.pactSlotsUsed = (live.pactSlotsUsed ?? 0) + 1;
    else if (level !== undefined) live.slotsUsed[level] = (live.slotsUsed[level] ?? 0) + 1;

    const slot = ECONOMY_BY_COST[spell.casting.cost];
    if (slot) spendEconomy(live, slot);
    if (live.combat?.turnActive) {
      if (spell.casting.cost === 'bonus') live.combat.economy.bonusActionSpellCast = true;
      if (spell.level > 0 || spell.casting.cost !== 'action') {
        live.combat.economy.otherSpellCast = true;
      }
    }
    // Outside combat, long casting times move the clock before the spell takes effect.
    const extra = castingSeconds(spell, ritual);
    if (!live.combat && extra > 0) notes.push(...passTime(live, extra, ctx));

    const now = live.clock.seconds;
    const endsAt = spell.duration.seconds === undefined ? undefined : now + spell.duration.seconds;
    if (spell.duration.concentration) {
      const ended = dropConcentration(live, ctx.registry);
      if (ended) notes.push(`concentration on ${ended} ended`);
      live.concentration = {
        spellId: spell.id,
        ...(level === undefined ? {} : { slotLevel: level }),
        ...(endsAt === undefined ? {} : { endsAt }),
      };
    }

    const template = spell.effect;
    if (template && (template.target === 'self' || payload.onSelf)) {
      const id = uniqueEffectId(live, spell.id);
      live.effects.push({
        id,
        name: spell.name,
        sourceId: spell.id,
        ...(endsAt === undefined ? {} : { endsAt }),
        concentration: spell.duration.concentration,
        conditions: [...(template.conditions ?? [])],
        modifiers: [...(template.modifiers ?? [])],
        ...(template.note === undefined ? {} : { note: template.note }),
      });
      if (spell.duration.concentration && live.concentration) live.concentration.effectId = id;
      notes.push(`${spell.name} on you`);
    }

    if (payload.healRoll !== undefined && spell.heal) {
      // Validation already proved the modifier and rolled total are available.
      const { amount } = previewSpellHealing(
        ctx,
        { ...payload, slotLevel: level },
        payload.healRoll,
      )!;
      const { before, after } = restoreHp(live, amount, ctx.sheet.maxHp.value);
      notes.push(`healed ${amount} (HP ${before} → ${after})`);
    }

    const how = ritual
      ? 'ritual'
      : payload.pact
        ? `L${level} pact slot`
        : level === undefined
          ? undefined
          : `L${level} slot`;
    return withNotes(`Cast ${spell.name}${how ? ` (${how})` : ''}`, notes);
  },
};

export const endConcentration: Command<null> = {
  name: 'endConcentration',
  check: ({ live }) => (live.concentration ? [] : [block('Not concentrating')]),
  apply: ({ live }, _payload, { registry }) =>
    `Concentration on ${dropConcentration(live, registry)} ended`,
};

export interface AdjustSlotPayload {
  /** Slot level 1–9, or Pact Magic slots. */
  level: number | 'pact';
  /** New number of used slots. */
  used: number;
}

function slotMax({ sheet }: CommandContext, level: AdjustSlotPayload['level']): number {
  return level === 'pact' ? (sheet.slots.pact?.count ?? 0) : (sheet.slots.max[level] ?? 0);
}

/** Manual correction from the `− / +` steppers (D37). */
export const adjustSlot: Command<AdjustSlotPayload> = {
  name: 'adjustSlot',
  check: (ctx, { level, used }) => {
    if (level !== 'pact') {
      const range = rangeCheck('Slot level', level, 1, 9);
      if (range.length > 0) return range;
    }
    const max = slotMax(ctx, level);
    if (max === 0) {
      return [
        block(level === 'pact' ? 'You have no pact slots' : `You have no level ${level} slots`),
      ];
    }
    return rangeCheck('Used slots', used, 0, max);
  },
  apply: ({ live }, { level, used }, ctx) => {
    const max = slotMax(ctx, level);
    if (level === 'pact') {
      live.pactSlotsUsed = used;
      return `Pact slots: ${max - used}/${max} left`;
    }
    live.slotsUsed[level] = used;
    return `L${level} slots: ${max - used}/${max} left`;
  },
};
