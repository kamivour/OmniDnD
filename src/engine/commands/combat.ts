import { formatDuration } from '../clock';
import { SECONDS_PER_ROUND } from '../rules2014';
import type { LiveState } from '../schema';
import type { Command, CommandContext } from './runner';
import {
  block,
  ECONOMY_LABEL,
  endTriggeredEffects,
  economyChecks,
  freshEconomy,
  notInCombat,
  passTime,
  spendEconomy,
  timeRangeChecks,
  warn,
  withNotes,
  type EconomySlot,
} from './shared';

type Live = LiveState;

/** With a tracker running, Next turn moves the order, so the single-turn buttons step aside. */
const trackerRuns = ({ live }: CommandContext) =>
  live.encounter ? [block('The encounter tracker runs the turns: use Next turn')] : [];

/** Your turn begins: a fresh economy, and the effects that end at the start of your turn go. */
export function beginTurn(live: Live, round: number): string[] {
  const combat = live.combat;
  if (!combat) return [];
  const ended = endTriggeredEffects(
    live,
    // A forgotten End Turn still closes last round's "until the end of your turn" effects.
    (on) =>
      (on.event === 'turn-start' && on.round <= round) ||
      (on.event === 'turn-end' && on.round < round),
  );
  combat.turnActive = true;
  combat.economy = freshEconomy();
  return ended;
}

/** Your turn ends: end-of-turn effects go; the reaction stays spent until your next turn. */
export function finishTurn(live: Live, round: number): string[] {
  const combat = live.combat;
  if (!combat) return [];
  const ended = endTriggeredEffects(live, (on) => on.event === 'turn-end' && on.round <= round);
  combat.turnActive = false;
  // The bonus-action spell rule is per turn.
  combat.economy.bonusActionSpellCast = false;
  combat.economy.otherSpellCast = false;
  // Dash grants movement only for the current turn.
  delete combat.economy.dashCount;
  return ended;
}

/**
 * No initiative or turn order (D42) unless the ally/enemy tracker runs the fight (D141). Round 0 means combat started but your first turn has not.
 * Each Start Turn after the first moves the clock one round; End Combat adds the last round.
 */
export const startCombat: Command<null> = {
  name: 'startCombat',
  check: ({ live }) => (live.combat ? [block('Already in combat')] : []),
  apply: ({ live }) => {
    live.combat = { round: 0, turnActive: false, economy: freshEconomy() };
    return 'Combat started';
  },
};

export const startTurn: Command<null> = {
  name: 'startTurn',
  check: (ctx) => {
    const checks = [...notInCombat(ctx), ...trackerRuns(ctx)];
    if (ctx.live.combat?.turnActive) checks.push(warn('Your turn is already active'));
    if (ctx.live.combat && ctx.live.combat.round > 0) {
      checks.push(...timeRangeChecks(ctx.live.clock.seconds, SECONDS_PER_ROUND));
    }
    return checks;
  },
  apply: ({ live }, _payload, ctx) => {
    const combat = live.combat;
    if (!combat) return 'Not in combat';
    combat.round += 1;
    const notes = combat.round > 1 ? passTime(live, SECONDS_PER_ROUND, ctx) : [];
    notes.push(...beginTurn(live, combat.round));
    return withNotes(`Round ${combat.round}: your turn`, notes);
  },
};

export const endTurn: Command<null> = {
  name: 'endTurn',
  check: (ctx) => {
    const checks = [...notInCombat(ctx), ...trackerRuns(ctx)];
    if (ctx.live.combat && !ctx.live.combat.turnActive)
      checks.push(block('Your turn is not active'));
    return checks;
  },
  apply: ({ live }) => {
    const combat = live.combat;
    if (!combat) return 'Not in combat';
    const round = Math.max(1, combat.round);
    const ended = finishTurn(live, round);
    return withNotes(`End of turn (round ${round})`, ended);
  },
};

export type UseEconomyPayload =
  | {
      kind: EconomySlot;
      /** What it was spent on: "Dash", "Opportunity Attack". */
      label?: string;
      /** Give it back (manual correction). */
      release?: boolean;
    }
  /** Feet moved; negative gives movement back. */
  | { kind: 'movement'; feet: number };

/** Dash adds current speed to movement, rather than changing the character's speed. */
export function combatMovement({ live, sheet }: Pick<CommandContext, 'live' | 'sheet'>): {
  speed: number;
  maximum: number;
  used: number;
  remaining: number;
  dashCount: number;
} {
  const speed = sheet.speed.value;
  const dashCount = live.combat?.economy.dashCount ?? 0;
  const maximum = speed * (1 + dashCount);
  const used = live.combat?.economy.movementUsed ?? 0;
  return { speed, maximum, used, remaining: Math.max(0, maximum - used), dashCount };
}

/** Spend part of the turn economy on something that is not a spell or feature. */
export const useEconomy: Command<UseEconomyPayload> = {
  name: 'useEconomy',
  check: (ctx, payload) => {
    const checks = notInCombat(ctx);
    const combat = ctx.live.combat;
    if (!combat) return checks;
    if (payload.kind !== 'movement') {
      return payload.release ? checks : [...checks, ...economyChecks(ctx, payload.kind)];
    }
    if (!Number.isInteger(payload.feet) || payload.feet === 0) {
      return [...checks, block('Movement must be a whole number of feet, not 0')];
    }
    if (payload.feet > 0) {
      if (!combat.turnActive) checks.push(warn('Not your turn'));
      const left = combatMovement(ctx).remaining;
      if (payload.feet > left) checks.push(warn(`Only ${left} ft of movement left`));
    }
    return checks;
  },
  apply: ({ live }, payload, ctx) => {
    const economy = live.combat?.economy;
    if (!economy) return 'Not in combat';
    if (payload.kind === 'movement') {
      economy.movementUsed = Math.max(0, economy.movementUsed + payload.feet);
      const verb =
        payload.feet > 0 ? `Moved ${payload.feet} ft` : `Movement back ${-payload.feet} ft`;
      return `${verb} (${economy.movementUsed}/${combatMovement(ctx).maximum} ft used)`;
    }
    const label = ECONOMY_LABEL[payload.kind];
    spendEconomy(live, payload.kind, !payload.release);
    if (payload.release) return `${label} available again`;
    return payload.label ? `${label}: ${payload.label}` : `${label} used`;
  },
};

export const endCombat: Command<null> = {
  name: 'endCombat',
  check: (ctx) => [
    ...notInCombat(ctx),
    ...(ctx.live.combat ? timeRangeChecks(ctx.live.clock.seconds, SECONDS_PER_ROUND) : []),
  ],
  apply: ({ live }, _payload, ctx) => {
    const rounds = Math.max(1, live.combat?.round ?? 0);
    const notes = passTime(live, SECONDS_PER_ROUND, ctx);
    // Turn-timed effects cannot outlast the fight they were measured in.
    notes.push(
      ...endTriggeredEffects(live, (on) => on.event === 'turn-start' || on.event === 'turn-end'),
    );
    delete live.combat;
    delete live.encounter;
    const unit = rounds === 1 ? 'round' : 'rounds';
    return withNotes(
      `Combat ended after ${rounds} ${unit} (${formatDuration(rounds * SECONDS_PER_ROUND)})`,
      notes,
    );
  },
};
