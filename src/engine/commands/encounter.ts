import { z } from 'zod';
import { abilityModifier } from '../calc/abilities';
import { companionAbilityMod } from '../calc/companions';
import { groupNames, nextInOrder, turnOrder } from '../calc/encounter';
import { SECONDS_PER_ROUND } from '../rules2014';
import { ConditionSchema, refId, type Combatant, type Encounter } from '../schema';
import { beginTurn, finishTurn } from './combat';
import type { Check, Command, CommandContext } from './runner';
import { block, freshEconomy, info, passTime, timeRangeChecks, warn, withNotes } from './shared';

/**
 * The ally/enemy tracker (M15, D141). It records what the player tells it: initiative rolls, damage
 * dealt to enemies, defeated marks. It never rolls, hits, saves or decides what a creature does.
 */

const Roll = z.int().min(-30).max(60);
const Hp = z.int().min(1).max(100_000);
const IdPayload = z.strictObject({ id: z.string().min(1) });
const AmountPayload = IdPayload.extend({ amount: z.int().min(0).max(1_000_000) });

const StartPayload = z.strictObject({ roll: Roll.optional() });

const InitiativePayload = z.union([
  IdPayload.extend({ roll: Roll }),
  IdPayload.extend({ total: z.int().min(-30).max(80) }),
  IdPayload.extend({ clear: z.literal(true) }),
]);

const AddPayload = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('creature'),
    creatureId: refId('creature'),
    side: z.enum(['ally', 'enemy']),
    count: z.int().min(1).max(20).optional(),
    /** One entry per creature when the player rolled hit points; absent: the statblock's average. */
    hp: z.array(Hp).optional(),
  }),
  z.strictObject({
    kind: z.literal('custom'),
    name: z.string().trim().min(1).max(60),
    side: z.enum(['ally', 'enemy']),
    ac: z.int().min(0).max(40),
    hp: Hp,
    initiativeBonus: z.int().min(-10).max(20),
    count: z.int().min(1).max(20).optional(),
  }),
  z.strictObject({ kind: z.literal('companion'), companionId: z.string().min(1) }),
]);

export type AddCombatantPayload = z.infer<typeof AddPayload>;
export type SetInitiativePayload = z.infer<typeof InitiativePayload>;

const find = (encounter: Encounter | undefined, id: string) =>
  encounter?.combatants.find((entry) => entry.id === id);

/** The encounter and the combatant a payload names, or a block. */
function target<S extends z.ZodType<{ id: string }>>(
  ctx: CommandContext,
  input: unknown,
  schema: S,
  own = false,
) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { checks: [block('Tracker details are invalid')] };
  const encounter = ctx.live.encounter;
  if (!encounter) return { checks: [block('No encounter is running')] };
  const combatant = find(encounter, parsed.data.id);
  if (!combatant) return { checks: [block('That combatant is not in the encounter')] };
  if (own && combatant.side !== 'ally' && combatant.side !== 'enemy')
    return {
      checks: [block('Use the HP and condition controls for you and your companions')],
    };
  return { checks: [] as Check[], encounter, combatant, data: parsed.data as z.infer<S> };
}

/** Draft access once a check has passed. */
function draftTarget(draft: { live: { encounter?: Encounter } }, id: string): Combatant {
  return find(draft.live.encounter, id)!;
}

function rolled(bonus: number, input: SetInitiativePayload): number | undefined {
  if ('roll' in input) return input.roll + bonus;
  if ('total' in input) return input.total;
  return undefined;
}

export const startEncounter: Command<{ roll?: number }> = {
  name: 'startEncounter',
  check: (ctx, input) => {
    const parsed = StartPayload.safeParse(input);
    if (!parsed.success) return [block('Tracker details are invalid')];
    return ctx.live.encounter ? [block('An encounter is already running')] : [];
  },
  apply: (draft, input, ctx) => {
    const { roll } = StartPayload.parse(input);
    if (!draft.live.combat)
      draft.live.combat = { round: 0, turnActive: false, economy: freshEconomy() };
    const bonus = ctx.sheet.initiative.value;
    const you: Combatant = {
      id: 'you',
      name: ctx.build.name,
      side: 'you',
      conditions: [],
      initiativeBonus: bonus,
      ...(roll === undefined ? {} : { initiative: roll + bonus }),
      defeated: false,
    };
    const companions: Combatant[] = (ctx.build.companions ?? [])
      .filter((companion) => ctx.live.companions?.[companion.id]?.status === 'active')
      .map((companion) => ({
        id: `companion:${companion.id}`,
        name: companion.name,
        side: 'companion' as const,
        companionId: companion.id,
        conditions: [],
        initiativeBonus: companionAbilityMod(companion, 'DEX'),
        defeated: false,
      }));
    draft.live.encounter = {
      id: `encounter-${ctx.eventId}`,
      round: 0,
      combatants: [you, ...companions],
    };
    return withNotes('Encounter started', [
      companions.length > 0
        ? `with ${companions.map((entry) => entry.name).join(', ')}`
        : undefined,
    ]);
  },
};

export const endEncounter: Command<null> = {
  name: 'endEncounter',
  check: ({ live }) => (live.encounter ? [] : [block('No encounter is running')]),
  apply: ({ live }) => {
    delete live.encounter;
    return 'Encounter closed (combat continues)';
  },
};

export const addCombatant: Command<AddCombatantPayload> = {
  name: 'addCombatant',
  check: (ctx, input) => {
    const parsed = AddPayload.safeParse(input);
    if (!parsed.success) return [block('Combatant details are invalid')];
    const encounter = ctx.live.encounter;
    if (!encounter) return [block('No encounter is running')];
    const add = parsed.data;
    if (add.kind === 'companion') {
      if (!ctx.build.companions?.some((companion) => companion.id === add.companionId))
        return [block('Companion does not exist')];
      if (encounter.combatants.some((entry) => entry.companionId === add.companionId))
        return [block('That companion is already in the encounter')];
      return [];
    }
    if (add.kind === 'creature') {
      const entry = ctx.registry.entries.get(add.creatureId);
      if (entry?.kind !== 'creature') return [block('That creature is not in the data')];
      if (add.hp && add.hp.length !== (add.count ?? 1))
        return [block(`Enter one HP for each of the ${add.count ?? 1} creatures`)];
    }
    if (encounter.combatants.length + (add.count ?? 1) > 60)
      return [block('An encounter holds up to 60 combatants')];
    return [];
  },
  apply: (draft, input, ctx) => {
    const add = AddPayload.parse(input);
    const encounter = draft.live.encounter!;
    if (add.kind === 'companion') {
      const companion = ctx.build.companions!.find((entry) => entry.id === add.companionId)!;
      encounter.combatants.push({
        id: `companion:${companion.id}`,
        name: companion.name,
        side: 'companion',
        companionId: companion.id,
        conditions: [],
        initiativeBonus: companionAbilityMod(companion, 'DEX'),
        defeated: false,
      });
      return `${companion.name} joins the encounter`;
    }
    const count = add.count ?? 1;
    let name: string;
    let ac: number;
    let hps: number[];
    let bonus: number;
    let creatureId: string | undefined;
    if (add.kind === 'creature') {
      const creature = ctx.registry.entries.get(add.creatureId);
      if (creature?.kind !== 'creature') throw new Error('Creature reached Apply unchecked');
      name = creature.name;
      ac = creature.ac;
      hps = add.hp ?? Array.from({ length: count }, () => creature.hp);
      bonus = abilityModifier(creature.abilities.DEX);
      creatureId = creature.id;
    } else {
      name = add.name;
      ac = add.ac;
      hps = Array.from({ length: count }, () => add.hp);
      bonus = add.initiativeBonus;
    }
    const { names, renames } = groupNames(
      encounter.combatants.map((entry) => entry.name),
      name,
      count,
    );
    for (const entry of encounter.combatants) {
      const renamed = renames[entry.name];
      if (renamed) entry.name = renamed;
    }
    const start = encounter.combatants.length;
    names.forEach((label, index) => {
      encounter.combatants.push({
        id: `${ctx.eventId}:${start + index}`,
        name: label,
        side: add.side,
        ...(creatureId ? { creatureId } : {}),
        ac,
        maxHp: hps[index]!,
        hp: hps[index]!,
        tempHp: 0,
        conditions: [],
        initiativeBonus: bonus,
        defeated: false,
      });
    });
    return `Added ${names.join(', ')} (${add.side}, AC ${ac}, HP ${hps.join('/')})`;
  },
};

export const removeCombatant: Command<{ id: string }> = {
  name: 'removeCombatant',
  check: (ctx, input) => {
    const found = target(ctx, input, IdPayload);
    if (!found.combatant) return found.checks;
    return found.combatant.side === 'you' ? [block('You cannot leave your own encounter')] : [];
  },
  apply: (draft, { id }) => {
    const encounter = draft.live.encounter!;
    const gone = find(encounter, id)!;
    if (encounter.currentId === id) {
      // Hand the turn marker to whoever went before, so Next turn still moves on to the right one.
      const order = turnOrder(encounter);
      const at = order.findIndex((entry) => entry.id === id);
      const before = at > 0 ? order[at - 1] : undefined;
      if (before) encounter.currentId = before.id;
      else delete encounter.currentId;
    }
    encounter.combatants = encounter.combatants.filter((entry) => entry.id !== id);
    return `${gone.name} removed from the encounter`;
  },
};

export const setInitiative: Command<SetInitiativePayload> = {
  name: 'setInitiative',
  check: (ctx, input) => target(ctx, input, InitiativePayload).checks,
  apply: (draft, input, ctx) => {
    const parsed = InitiativePayload.parse(input);
    const combatant = draftTarget(draft, parsed.id);
    // The bonus can change (a new magic item, a condition): refresh it for you.
    if (combatant.side === 'you') combatant.initiativeBonus = ctx.sheet.initiative.value;
    const total = rolled(combatant.initiativeBonus, parsed);
    if (total === undefined) {
      delete combatant.initiative;
      return `${combatant.name} initiative cleared`;
    }
    combatant.initiative = total;
    const sign = combatant.initiativeBonus >= 0 ? '+' : '';
    const how =
      'roll' in parsed ? ` (rolled ${parsed.roll} ${sign}${combatant.initiativeBonus})` : '';
    return `${combatant.name} initiative ${total}${how}`;
  },
};

/** 0 HP is shown, never acted on: the player marks a creature defeated. */
export const damageCombatant: Command<{ id: string; amount: number }> = {
  name: 'damageCombatant',
  check: (ctx, input) => {
    const found = target(ctx, input, AmountPayload, true);
    if (!found.combatant) return found.checks;
    return found.combatant.hp === 0 ? [warn(`${found.combatant.name} is already at 0 HP`)] : [];
  },
  apply: (draft, { id, amount }) => {
    const combatant = draftTarget(draft, id);
    const absorbed = Math.min(combatant.tempHp!, amount);
    combatant.tempHp = combatant.tempHp! - absorbed;
    combatant.hp = combatant.hp! - Math.min(combatant.hp!, amount - absorbed);
    return withNotes(`${combatant.name} takes ${amount} damage (HP ${combatant.hp})`, [
      combatant.hp === 0 && !combatant.defeated ? 'at 0 HP' : undefined,
    ]);
  },
};

export const healCombatant: Command<{ id: string; amount: number }> = {
  name: 'healCombatant',
  check: (ctx, input) => target(ctx, input, AmountPayload, true).checks,
  apply: (draft, { id, amount }) => {
    const combatant = draftTarget(draft, id);
    combatant.hp = Math.min(combatant.maxHp!, combatant.hp! + amount);
    return `${combatant.name} heals ${amount} (HP ${combatant.hp}/${combatant.maxHp})`;
  },
};

/** Temp HP does not stack: the player enters the number they keep. */
export const setCombatantTempHp: Command<{ id: string; amount: number }> = {
  name: 'setCombatantTempHp',
  check: (ctx, input) => target(ctx, input, AmountPayload, true).checks,
  apply: (draft, { id, amount }) => {
    const combatant = draftTarget(draft, id);
    combatant.tempHp = amount;
    return `${combatant.name} temp HP ${amount}`;
  },
};

export const toggleCombatantCondition: Command<{
  id: string;
  condition: z.infer<typeof ConditionSchema>;
}> = {
  name: 'toggleCombatantCondition',
  check: (ctx, input) =>
    target(ctx, input, IdPayload.extend({ condition: ConditionSchema }), true).checks,
  apply: (draft, { id, condition }) => {
    const combatant = draftTarget(draft, id);
    if (combatant.conditions.includes(condition)) {
      combatant.conditions = combatant.conditions.filter((entry) => entry !== condition);
      return `${combatant.name} no longer ${condition}`;
    }
    combatant.conditions.push(condition);
    return `${combatant.name} is ${condition}`;
  },
};

export const setDefeated: Command<{ id: string; defeated: boolean }> = {
  name: 'setDefeated',
  check: (ctx, input) => {
    const found = target(ctx, input, IdPayload.extend({ defeated: z.boolean() }));
    if (!found.combatant) return found.checks;
    return found.combatant.side === 'you' ? [block('Mark yourself with the HP controls')] : [];
  },
  apply: (draft, { id, defeated }) => {
    const combatant = draftTarget(draft, id);
    combatant.defeated = defeated;
    return `${combatant.name} ${defeated ? 'defeated' : 'back in the fight'}`;
  },
};

/** A companion acts on its own turn or straight after you. */
export const setCompanionWithOwner: Command<{ id: string; withOwner: boolean }> = {
  name: 'setCompanionWithOwner',
  check: (ctx, input) => {
    const found = target(ctx, input, IdPayload.extend({ withOwner: z.boolean() }));
    if (!found.combatant) return found.checks;
    return found.combatant.side === 'companion'
      ? []
      : [block('Only a companion can act with its owner')];
  },
  apply: (draft, { id, withOwner }) => {
    const combatant = draftTarget(draft, id);
    if (withOwner) combatant.withOwner = true;
    else delete combatant.withOwner;
    return withNotes(
      `${combatant.name} acts ${withOwner ? 'with you' : 'on its own initiative'}`,
      [],
    );
  },
};

/**
 * Moves to the next combatant. A new round passes six game seconds, as Start Turn does. Your own
 * turn start restores your economy and ends "until the start of your turn" effects; leaving your
 * turn ends the "end of your turn" ones.
 */
export const nextTurn: Command<null> = {
  name: 'nextTurn',
  check: (ctx) => {
    const encounter = ctx.live.encounter;
    if (!encounter) return [block('No encounter is running')];
    const found = nextInOrder(encounter);
    if (!found) return [block('Enter an initiative for at least one combatant who is still up')];
    const checks: Check[] = [];
    const waiting = encounter.combatants.filter(
      (entry) => entry.initiative === undefined && !entry.defeated,
    );
    if (waiting.length > 0)
      checks.push(
        warn(`No initiative yet for ${waiting.map((entry) => entry.name).join(', ')}: skipped`),
      );
    if (found.newRound || encounter.round === 0)
      checks.push(...timeRangeChecks(ctx.live.clock.seconds, SECONDS_PER_ROUND));
    const mine = encounter.combatants.find((entry) => entry.side === 'you');
    if (mine && mine.defeated) checks.push(info('You are marked defeated'));
    return checks;
  },
  apply: (draft, _payload, ctx) => {
    const { live } = draft;
    const encounter = live.encounter!;
    const found = nextInOrder(encounter)!;
    const notes: string[] = [];
    const leaving = find(encounter, encounter.currentId ?? '');
    if (leaving?.side === 'you') notes.push(...finishTurn(live, Math.max(1, encounter.round)));
    if (found.newRound || encounter.round === 0) {
      encounter.round += 1;
      if (encounter.round > 1) notes.push(...passTime(live, SECONDS_PER_ROUND, ctx));
      live.combat!.round = encounter.round;
    }
    encounter.currentId = found.next.id;
    if (found.next.side === 'you') notes.push(...beginTurn(live, encounter.round));
    return withNotes(`Round ${encounter.round}: ${found.next.name}`, notes);
  },
};
