import { z } from 'zod';
import type { Command } from './runner';
import {
  block,
  deadCheck,
  economyChecks,
  endSelfInvisibility,
  notInCombat,
  spendEconomy,
  warn,
  withNotes,
} from './shared';

const StandardActionIdSchema = z.enum([
  'attack',
  'dash',
  'disengage',
  'dodge',
  'help',
  'hide',
  'ready',
  'search',
  'use-object',
  'grapple',
  'shove',
]);
export type StandardActionId = z.infer<typeof StandardActionIdSchema>;

/**
 * Own-words 2014 reminders. Targets, rolls and outcomes are resolved at the table.
 * https://www.dndbeyond.com/sources/dnd/basic-rules-2014/combat
 */
export const STANDARD_ACTIONS: readonly {
  id: StandardActionId;
  name: string;
  lines: readonly string[];
}[] = [
  {
    id: 'attack',
    name: 'Attack',
    lines: [
      'Take the Attack action. Resolve permitted attacks, targets, rolls and damage at the table.',
    ],
  },
  {
    id: 'dash',
    name: 'Dash',
    lines: [
      'Add your current speed to this turn’s movement allowance. Changes to speed also change this allowance.',
    ],
  },
  {
    id: 'disengage',
    name: 'Disengage',
    lines: ['Your movement avoids opportunity attacks for the rest of this turn.'],
  },
  {
    id: 'dodge',
    name: 'Dodge',
    lines: [
      'Until your next turn starts, attackers you can see have disadvantage against you and you have advantage on DEX saves.',
      'This benefit ends if you are incapacitated or have speed 0. Resolve its benefits at the table.',
    ],
  },
  {
    id: 'help',
    name: 'Help',
    lines: [
      'Help an ally’s task, or distract an enemy within 5 ft for an ally’s attack. The relevant next check or first attack gains advantage before your next turn. Resolve the result at the table.',
    ],
  },
  {
    id: 'hide',
    name: 'Hide',
    lines: [
      'Attempt a DEX (Stealth) check. The DM decides whether circumstances allow hiding and who notices you.',
    ],
  },
  {
    id: 'ready',
    name: 'Ready',
    lines: [
      'Choose a perceivable trigger and an action or movement response. Releasing it before your next turn uses your reaction.',
      'A readied spell requires a one-action casting time and concentration. Spell holding and release are handled at the table.',
    ],
  },
  {
    id: 'search',
    name: 'Search',
    lines: [
      'Look for something. The DM chooses the appropriate check, commonly WIS (Perception) or INT (Investigation).',
    ],
  },
  {
    id: 'use-object',
    name: 'Use an Object',
    lines: [
      'Use an object that requires your action, or make an additional object interaction. Resolve object-specific effects at the table.',
    ],
  },
  {
    id: 'grapple',
    name: 'Grapple',
    lines: [
      'Replace an Attack-action attack with a grapple attempt against a reachable creature at most one size larger. A free hand is required.',
      'Contest your Athletics against its Athletics or Acrobatics. The DM resolves success and the target’s condition.',
    ],
  },
  {
    id: 'shove',
    name: 'Shove',
    lines: [
      'Replace an Attack-action attack with a shove against a reachable creature at most one size larger.',
      'Contest your Athletics against its Athletics or Acrobatics. On success, choose prone or a 5-ft push; resolve the target at the table.',
    ],
  },
];

const TakeCombatActionPayloadSchema = z.union([
  z.strictObject({ action: StandardActionIdSchema }),
  z.strictObject({
    action: z.literal('weapon-attack'),
    instanceId: z.string().min(1),
    reaction: z.boolean().optional(),
  }),
]);
export type TakeCombatActionPayload = z.infer<typeof TakeCombatActionPayloadSchema>;

/** Named actions represent actual activity; manual economy corrections do not trigger spell ends. */
export const takeCombatAction: Command<TakeCombatActionPayload> = {
  name: 'takeCombatAction',
  check: (ctx, payload) => {
    const parsed = TakeCombatActionPayloadSchema.safeParse(payload);
    if (!parsed.success) return [block('Combat action details are invalid')];
    const choice = parsed.data;
    const checks = [...deadCheck(ctx), ...notInCombat(ctx)];
    const reaction = choice.action === 'weapon-attack' && choice.reaction === true;
    if (choice.action === 'weapon-attack') {
      const weapon = ctx.sheet.attacks.find((attack) => attack.instanceId === choice.instanceId);
      if (!weapon) checks.push(block('That weapon is not equipped or available'));
      else if (reaction && weapon.type !== 'melee')
        checks.push(warn(`${weapon.name} is not a melee weapon for an opportunity attack`));
    }
    checks.push(...economyChecks(ctx, reaction ? 'reaction' : 'action'));
    return checks;
  },
  apply: ({ live }, payload, ctx) => {
    const choice = TakeCombatActionPayloadSchema.parse(payload);
    const reaction = choice.action === 'weapon-attack' && choice.reaction === true;
    spendEconomy(live, reaction ? 'reaction' : 'action');
    if (choice.action === 'dash' && live.combat)
      live.combat.economy.dashCount = (live.combat.economy.dashCount ?? 0) + 1;
    const attacks =
      choice.action === 'weapon-attack' ||
      choice.action === 'attack' ||
      choice.action === 'grapple' ||
      choice.action === 'shove';
    const notes = attacks ? endSelfInvisibility(live, 'attack') : [];
    if (choice.action === 'weapon-attack') {
      const weapon = ctx.sheet.attacks.find((attack) => attack.instanceId === choice.instanceId)!;
      return withNotes(`${reaction ? 'Reaction attack' : 'Attack'}: ${weapon.name}`, notes);
    }
    return withNotes(
      `Action: ${STANDARD_ACTIONS.find((action) => action.id === choice.action)!.name}`,
      notes,
    );
  },
};
