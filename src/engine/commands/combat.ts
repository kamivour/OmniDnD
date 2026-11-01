import { formatDuration } from '../clock';
import { SECONDS_PER_ROUND } from '../rules2014';
import type { Command } from './runner';
import {
  block,
  ECONOMY_LABEL,
  economyChecks,
  freshEconomy,
  notInCombat,
  passTime,
  spendEconomy,
  warn,
  withNotes,
  type EconomySlot,
} from './shared';

/**
 * No initiative or turn order (D42). Round 0 means combat started but your first turn has not.
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
    const checks = notInCombat(ctx);
    if (ctx.live.combat?.turnActive) checks.push(warn('Your turn is already active'));
    return checks;
  },
  apply: ({ live }, _payload, ctx) => {
    const combat = live.combat;
    if (!combat) return 'Not in combat';
    combat.round += 1;
    const notes = combat.round > 1 ? passTime(live, SECONDS_PER_ROUND, ctx) : [];
    combat.turnActive = true;
    combat.economy = freshEconomy();
    return withNotes(`Round ${combat.round}: your turn`, notes);
  },
};

export const endTurn: Command<null> = {
  name: 'endTurn',
  check: (ctx) => {
    const checks = notInCombat(ctx);
    if (ctx.live.combat && !ctx.live.combat.turnActive)
      checks.push(block('Your turn is not active'));
    return checks;
  },
  apply: ({ live }) => {
    const combat = live.combat;
    if (!combat) return 'Not in combat';
    combat.turnActive = false;
    // The bonus-action spell rule is per turn; the reaction stays spent until your next turn.
    combat.economy.bonusActionSpellCast = false;
    combat.economy.otherSpellCast = false;
    return `End of turn (round ${Math.max(1, combat.round)})`;
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
      const left = Math.max(0, ctx.sheet.speed.value - combat.economy.movementUsed);
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
      return `${verb} (${economy.movementUsed}/${ctx.sheet.speed.value} ft used)`;
    }
    const label = ECONOMY_LABEL[payload.kind];
    spendEconomy(live, payload.kind, !payload.release);
    if (payload.release) return `${label} available again`;
    return payload.label ? `${label}: ${payload.label}` : `${label} used`;
  },
};

export const endCombat: Command<null> = {
  name: 'endCombat',
  check: notInCombat,
  apply: ({ live }, _payload, ctx) => {
    const rounds = Math.max(1, live.combat?.round ?? 0);
    const notes = passTime(live, SECONDS_PER_ROUND, ctx);
    delete live.combat;
    const unit = rounds === 1 ? 'round' : 'rounds';
    return withNotes(
      `Combat ended after ${rounds} ${unit} (${formatDuration(rounds * SECONDS_PER_ROUND)})`,
      notes,
    );
  },
};
