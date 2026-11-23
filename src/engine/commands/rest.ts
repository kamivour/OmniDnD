import { crossesDawn, formatDuration } from '../clock';
import { restDurations } from '../calc/rests';
import { featureResource, writeFeatureResource } from '../calc/features';
import { MYSTIC_ARCANUM } from '../calc/feat-spells';
import { spellSelectionDetails } from '../calc/spell-selections';
import { dedicatedWeaponOptions } from '../calc/monk-weapons';
import type { ArmorModel } from '../calc/arcane-armor';
import { armorModelChecks, changeArmorModel } from './arcane-armor';
import { elixirRestChecks, restElixirs } from './experimental-elixirs';
import { LONG_REST_INTERVAL_SECONDS } from '../rules2014';
import type { HitDieName } from '../schema';
import type { Check, Command, CommandContext } from './runner';
import {
  block,
  deadCheck,
  faces,
  featureName,
  maxHpAfter,
  passTime,
  endTriggeredEffects,
  rangeCheck,
  resetDeathSaves,
  rechargeItems,
  restoreCompanionUses,
  restoreFeatures,
  restoreHp,
  timeRangeChecks,
  warn,
  withNotes,
} from './shared';

const SONG_OF_REST = 'feature.bard.song-of-rest';
const FONT_OF_MAGIC = 'feature.sorcerer.font-of-magic';
const SORCEROUS_RESTORATION = 'feature.sorcerer.sorcerous-restoration';
const ARCANE_RECOVERY = 'feature.wizard.arcane-recovery';
const WIZARD = 'class.wizard';
const CANTRIP_FORMULAS = 'feature.tce.wizard-cantrip-formulas';

export function wizardRestCantrips(
  ctx: Pick<CommandContext, 'sheet' | 'build' | 'campaign' | 'registry' | 'live'>,
) {
  if (!ctx.sheet.features.some(({ def }) => def.id === CANTRIP_FORMULAS)) return undefined;
  const details = spellSelectionDetails(ctx, WIZARD);
  const learned = new Set(details.selection.known);
  return {
    known: details.cantrips.ids,
    available: details.candidates.cantrips.filter((id) => !learned.has(id)),
  };
}

export function arcaneRecoveryOptions({
  campaign,
  sheet,
  live,
}: Pick<CommandContext, 'campaign' | 'sheet' | 'live'>) {
  const feature = sheet.features.find(({ def }) => def.id === ARCANE_RECOVERY);
  if (!feature) return undefined;
  const start = live.clock.seconds;
  const uses = featureResource(sheet.features, live, ARCANE_RECOVERY);
  const available = Boolean(
    uses &&
    uses.max > 0 &&
    (uses.remaining > 0 || crossesDawn(start, start + restDurations(campaign).short)),
  );
  const budget = Math.ceil(feature.level / 2);
  const expended = sheet.slots.max.flatMap((max, level) => {
    if (level < 1 || level > 5) return [];
    const used = live.slotsUsed[level] ?? 0;
    const count = Math.min(max, used, Math.floor(budget / level));
    return count > 0 ? [{ level, count }] : [];
  });
  return { budget, available, expended };
}

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
  /** Slot levels chosen for Arcane Recovery, one entry per expended slot. */
  arcaneRecovery?: number[];
  dedicatedWeaponId?: string;
  arcaneArmorModel?: ArmorModel;
}

/**
 * Campaign-length short rest. Hit Dice are spent inside it (D54): each heals roll + CON, at least 0.
 * Short-rest features and Pact Magic slots come back.
 */
export const completeShortRest: Command<ShortRestPayload> = {
  name: 'completeShortRest',
  check: (
    ctx,
    {
      hitDice = [],
      songOfRest,
      songOfRestSource,
      arcaneRecovery = [],
      dedicatedWeaponId,
      arcaneArmorModel,
    },
  ) => {
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
    if (arcaneRecovery.length > 0) {
      const options = arcaneRecoveryOptions(ctx);
      if (!options?.available) checks.push(block('Arcane Recovery is unavailable until dawn'));
      else if (arcaneRecovery.some((level) => !options.expended.some((row) => row.level === level)))
        checks.push(block('Choose expended spell slots of level 1–5'));
      else if (
        options.expended.some(
          ({ level, count }) => arcaneRecovery.filter((value) => value === level).length > count,
        )
      )
        checks.push(block('Choose only the number of slots expended at each level'));
      else if (arcaneRecovery.reduce((total, level) => total + level, 0) > options.budget)
        checks.push(block(`Arcane Recovery restores up to ${options.budget} combined slot levels`));
    }
    checks.push(...timeRangeChecks(ctx.live.clock.seconds, restDurations(ctx.campaign).short));
    checks.push(...dedicatedWeaponChecks(ctx, dedicatedWeaponId));
    checks.push(...armorModelChecks(ctx, arcaneArmorModel));
    return checks;
  },
  apply: (
    { live },
    {
      hitDice = [],
      songOfRest,
      songOfRestSource,
      arcaneRecovery = [],
      dedicatedWeaponId,
      arcaneArmorModel,
    },
    ctx,
  ) => {
    const duration = restDurations(ctx.campaign).short;
    const notes: (string | undefined)[] = passTime(live, duration, ctx);
    notes.push(...endTriggeredEffects(live, (on) => on.event === 'short-rest'));
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
    restored.push(...restoreCompanionUses(live, ctx.build, ['short']));
    if (live.pactSlotsUsed) {
      delete live.pactSlotsUsed;
      restored.push('pact slots');
    }
    if (ctx.sheet.features.some(({ def }) => def.id === SORCEROUS_RESTORATION)) {
      const spent = featureResource(ctx.sheet.features, live, FONT_OF_MAGIC)?.spent ?? 0;
      const recovered = Math.min(4, spent);
      if (recovered > 0) {
        writeFeatureResource(ctx.sheet.features, live, FONT_OF_MAGIC, spent - recovered);
        restored.push(`${recovered} sorcery points`);
      }
    }
    if (arcaneRecovery.length > 0) {
      for (const level of arcaneRecovery) live.slotsUsed[level] = (live.slotsUsed[level] ?? 0) - 1;
      writeFeatureResource(ctx.sheet.features, live, ARCANE_RECOVERY, 1);
      restored.push(`Arcane Recovery: slots at levels ${arcaneRecovery.join(', ')}`);
    }
    if (restored.length > 0) notes.push(`restored ${restored.join(', ')}`);
    notes.push(dedicateWeapon(live, ctx, dedicatedWeaponId));
    notes.push(changeArmorModel(live, arcaneArmorModel));
    notes.push(...rechargeItems(live, ctx, ctx.live.items, ['short']));
    return withNotes(`Short rest (${formatDuration(duration)})`, notes);
  },
};

/**
 * Campaign-length long rest. Needs at least 1 HP at the start. One per 24 hours: the warning
 * compares this rest's end with the last one's (start to start, so a nightly rest is fine).
 */
export interface LongRestChoices {
  cantripSwap?: { remove: string; add: string };
  dedicatedWeaponId?: string;
  arcaneArmorModel?: ArmorModel;
  elixirRolls?: number[];
}

function dedicatedWeaponChecks(ctx: CommandContext, instanceId?: string) {
  if (instanceId === undefined) return [];
  return dedicatedWeaponOptions(ctx.build, ctx.live, ctx.sheet, ctx.registry).some(
    (weapon) => weapon.instanceId === instanceId,
  )
    ? []
    : [block('Choose a proficient weapon without the heavy or special property')];
}

function dedicateWeapon(
  live: Pick<CommandContext['live'], 'dedicatedWeaponId'>,
  ctx: CommandContext,
  instanceId?: string,
) {
  if (instanceId === undefined || live.dedicatedWeaponId === instanceId) return undefined;
  const weapon = dedicatedWeaponOptions(ctx.build, ctx.live, ctx.sheet, ctx.registry).find(
    (row) => row.instanceId === instanceId,
  );
  live.dedicatedWeaponId = instanceId;
  return `Dedicated Weapon: ${weapon?.name ?? instanceId}`;
}

export const completeLongRest: Command<LongRestChoices | null> = {
  name: 'completeLongRest',
  check: (ctx, choices) => {
    const checks = restChecks(ctx);
    const { live } = ctx;
    const duration = restDurations(ctx.campaign).long;
    if (live.hp === 0 && checks.length === 0) checks.push(block("Can't long rest at 0 HP"));
    const last = live.lastLongRestEnd;
    if (last !== undefined && live.clock.seconds + duration - last < LONG_REST_INTERVAL_SECONDS) {
      checks.push(warn('Less than 24 h since last long rest'));
    }
    if (choices?.cantripSwap) {
      const { remove, add } = choices.cantripSwap;
      const formulas = wizardRestCantrips(ctx);
      if (!formulas?.known.includes(remove) || !formulas.available.includes(add))
        checks.push(
          block('Cantrip Formulas needs a known Wizard cantrip and an available replacement'),
        );
    }
    checks.push(...timeRangeChecks(live.clock.seconds, duration));
    checks.push(...dedicatedWeaponChecks(ctx, choices?.dedicatedWeaponId));
    checks.push(...armorModelChecks(ctx, choices?.arcaneArmorModel));
    checks.push(...elixirRestChecks(ctx, choices?.elixirRolls));
    return checks;
  },
  apply: ({ live, build }, choices, ctx) => {
    const duration = restDurations(ctx.campaign).long;
    const notes: (string | undefined)[] = passTime(live, duration, ctx);
    notes.push(
      ...endTriggeredEffects(live, (on) => on.event === 'short-rest' || on.event === 'long-rest'),
    );

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
    if (live.createdSlots) {
      delete live.createdSlots;
      notes.push('created slots faded');
    }
    if (live.pactSlotsUsed) {
      delete live.pactSlotsUsed;
      restored.push('pact slots');
    }
    restored.push(...restoreFeatures(live, ctx.sheet, ['short', 'long']));
    if (live.featureUsesSpent[MYSTIC_ARCANUM]) {
      delete live.featureUsesSpent[MYSTIC_ARCANUM];
      if (!restored.includes('Mystic Arcanum')) restored.push('Mystic Arcanum');
    }
    restored.push(...restoreCompanionUses(live, ctx.build, ['short', 'long']));
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
    notes.push(...restElixirs(live, ctx.eventId, choices?.elixirRolls));
    notes.push(dedicateWeapon(live, ctx, choices?.dedicatedWeaponId));
    notes.push(changeArmorModel(live, choices?.arcaneArmorModel));
    if (choices?.cantripSwap) {
      const { remove, add } = choices.cantripSwap;
      for (const list of build.spells) {
        if (list.classId === WIZARD)
          list.known = list.known.map((id) => (id === remove ? add : id));
      }
      notes.push(
        `Cantrip Formulas: ${ctx.registry.get('spell', remove).name} → ${ctx.registry.get('spell', add).name}`,
      );
    }
    return withNotes(`Long rest (${formatDuration(duration)})`, notes);
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
