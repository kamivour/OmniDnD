import { formatDuration } from '../clock';
import { LONG_REST_INTERVAL_SECONDS, LONG_REST_SECONDS, SHORT_REST_SECONDS } from '../rules2014';
import type { HitDieName } from '../schema';
import type { Check, Command, CommandContext } from './runner';
import {
  block,
  deadCheck,
  faces,
  featureName,
  maxHpAfter,
  passTime,
  rangeCheck,
  resetDeathSaves,
  rechargeItems,
  restoreFeatures,
  restoreHp,
  timeRangeChecks,
  warn,
  withNotes,
} from './shared';

const SONG_OF_REST = 'feature.bard.song-of-rest';

function restChecks(ctx: CommandContext): Check[] {
  return [...deadCheck(ctx), ...(ctx.live.combat ? [block('End combat before resting')] : [])];
}

function hitDiceLeft({ sheet, live }: CommandContext, die: HitDieName): number {
  const max = sheet.hitDice.find((pool) => pool.die === die)?.max ?? 0;
  return max - (live.hitDiceSpent[die] ?? 0);
}

export interface ShortRestPayload {
  /** Each Hit Die spent, with the die roll the player entered. CON is added by the engine. */
  hitDice?: { die: HitDieName; roll: number }[];
  /** Extra healing from Song of Rest, if you regain HP from spent Hit Dice. */
  songOfRest?: number;
  /** Defaults to your own feature when available, otherwise another bard's unknown die. */
  songOfRestSource?: 'self' | 'other';
}

/**
 * One hour. Hit Dice are spent inside the rest (D54): each heals its roll + CON, at least 0.
 * Short-rest features and Pact Magic slots come back.
 */
export const completeShortRest: Command<ShortRestPayload> = {
  name: 'completeShortRest',
  check: (ctx, { hitDice = [], songOfRest, songOfRestSource }) => {
    const checks = restChecks(ctx);
    const counts = new Map<HitDieName, number>();
    for (const { die, roll } of hitDice) {
      counts.set(die, (counts.get(die) ?? 0) + 1);
      checks.push(...rangeCheck(`${die} roll`, roll, 1, faces(die)));
    }
    for (const [die, count] of counts) {
      const left = hitDiceLeft(ctx, die);
      if (count > left) {
        checks.push(
          block(left === 0 ? `No ${die} Hit Dice left` : `Only ${left} ${die} Hit Dice left`),
        );
      }
    }
    if (songOfRest !== undefined) {
      const hitDieHealing = hitDice.reduce(
        (total, { roll }) => total + Math.max(0, roll + ctx.sheet.abilities.CON.mod),
        0,
      );
      if (hitDieHealing <= 0 || ctx.live.hp >= ctx.sheet.maxHp.value) {
        checks.push(block('Song of Rest only adds to healing from spent Hit Dice'));
      }
      // Your own Song of Rest die, or up to d12 from another bard.
      const own = ctx.sheet.features.find(({ def }) => def.id === SONG_OF_REST)?.die;
      const source = songOfRestSource ?? (own ? 'self' : 'other');
      if (source === 'self' && !own) checks.push(block('You do not have Song of Rest'));
      checks.push(
        ...rangeCheck(
          'Song of Rest roll',
          songOfRest,
          1,
          source === 'self' && own ? faces(own) : 12,
        ),
      );
    }
    checks.push(...timeRangeChecks(ctx.live.clock.seconds, SHORT_REST_SECONDS));
    return checks;
  },
  apply: ({ live }, { hitDice = [], songOfRest, songOfRestSource }, ctx) => {
    const notes: (string | undefined)[] = passTime(live, SHORT_REST_SECONDS, ctx);
    const con = ctx.sheet.abilities.CON.mod;
    let healing = 0;
    for (const { die, roll } of hitDice) {
      live.hitDiceSpent[die] = (live.hitDiceSpent[die] ?? 0) + 1;
      healing += Math.max(0, roll + con);
    }
    healing += songOfRest ?? 0;
    if (hitDice.length > 0) {
      const { before, after } = restoreHp(live, healing, ctx.sheet.maxHp.value);
      const own = ctx.sheet.features.find(({ def }) => def.id === SONG_OF_REST)?.die;
      const source = songOfRestSource ?? (own ? 'self' : 'other');
      const song =
        songOfRest === undefined
          ? ''
          : ` + ${featureName(ctx, SONG_OF_REST)}${source === 'other' ? ' (other bard)' : ''}`;
      notes.push(
        `${hitDice.length} Hit ${hitDice.length === 1 ? 'Die' : 'Dice'}${song}: HP ${before} → ${after}`,
      );
    }
    const restored = restoreFeatures(live, ctx.sheet, ['short']);
    if (live.pactSlotsUsed) {
      delete live.pactSlotsUsed;
      restored.push('pact slots');
    }
    if (restored.length > 0) notes.push(`restored ${restored.join(', ')}`);
    notes.push(...rechargeItems(live, ctx, ctx.live.items, ['short']));
    return withNotes(`Short rest (${formatDuration(SHORT_REST_SECONDS)})`, notes);
  },
};

/**
 * Eight hours. Needs at least 1 HP at the start. Only one long rest per 24 hours: the warning
 * compares this rest's end with the last one's (start to start, so a nightly rest is fine).
 */
export const completeLongRest: Command<null> = {
  name: 'completeLongRest',
  check: (ctx) => {
    const checks = restChecks(ctx);
    const { live } = ctx;
    if (live.hp === 0 && checks.length === 0) checks.push(block("Can't long rest at 0 HP"));
    const last = live.lastLongRestEnd;
    if (
      last !== undefined &&
      live.clock.seconds + LONG_REST_SECONDS - last < LONG_REST_INTERVAL_SECONDS
    ) {
      checks.push(warn('Less than 24 h since last long rest'));
    }
    checks.push(...timeRangeChecks(live.clock.seconds, LONG_REST_SECONDS));
    return checks;
  },
  apply: ({ live }, _payload, ctx) => {
    const notes: (string | undefined)[] = passTime(live, LONG_REST_SECONDS, ctx);

    const exhaustion = Math.max(0, live.exhaustion - 1);
    if (exhaustion !== live.exhaustion) {
      notes.push(`exhaustion ${live.exhaustion} → ${exhaustion}`);
      live.exhaustion = exhaustion;
    }
    // PHB 2014: temp HP last until depleted or a long rest ends.
    if (live.tempHp > 0) {
      notes.push('temp HP cleared');
      live.tempHp = 0;
    }
    const maxHp = maxHpAfter(ctx, { live: { ...ctx.live, exhaustion } });
    if (live.hp !== maxHp) notes.push(`HP ${live.hp} → ${maxHp}`);
    live.hp = maxHp;
    resetDeathSaves(live);

    const restored: string[] = [];
    if (live.slotsUsed.some((used) => used > 0)) {
      live.slotsUsed.forEach((used, level) => {
        if (used > 0) live.slotsUsed[level] = 0;
      });
      restored.push('spell slots');
    }
    if (live.pactSlotsUsed) {
      delete live.pactSlotsUsed;
      restored.push('pact slots');
    }
    restored.push(...restoreFeatures(live, ctx.sheet, ['short', 'long']));
    if (restored.length > 0) notes.push(`restored ${restored.join(', ')}`);
    notes.push(...rechargeItems(live, ctx, ctx.live.items, ['short', 'long']));

    // Half your total Hit Dice (at least 1) come back, largest dice first.
    const total = ctx.sheet.hitDice.reduce((sum, pool) => sum + pool.max, 0);
    let budget = Math.max(1, Math.floor(total / 2));
    let recovered = 0;
    const largestFirst = [...ctx.sheet.hitDice].sort((a, b) => faces(b.die) - faces(a.die));
    for (const { die } of largestFirst) {
      const spent = live.hitDiceSpent[die] ?? 0;
      const back = Math.min(spent, budget);
      if (back === 0) continue;
      budget -= back;
      recovered += back;
      if (spent === back) delete live.hitDiceSpent[die];
      else live.hitDiceSpent[die] = spent - back;
    }
    if (recovered > 0) notes.push(`${recovered} Hit ${recovered === 1 ? 'Die' : 'Dice'} back`);

    live.lastLongRestEnd = live.clock.seconds;
    return withNotes(`Long rest (${formatDuration(LONG_REST_SECONDS)})`, notes);
  },
};

export interface AdjustHitDicePayload {
  die: HitDieName;
  /** New number of spent dice of this size. */
  spent: number;
}

export const adjustHitDice: Command<AdjustHitDicePayload> = {
  name: 'adjustHitDice',
  check: ({ sheet }, { die, spent }) => {
    const max = sheet.hitDice.find((pool) => pool.die === die)?.max;
    if (max === undefined) return [block(`You have no ${die} Hit Dice`)];
    return rangeCheck('Spent Hit Dice', spent, 0, max);
  },
  apply: ({ live }, { die, spent }, { sheet }) => {
    if (spent === 0) delete live.hitDiceSpent[die];
    else live.hitDiceSpent[die] = spent;
    const max = sheet.hitDice.find((pool) => pool.die === die)?.max ?? 0;
    return `${die} Hit Dice: ${max - spent}/${max} left`;
  },
};
