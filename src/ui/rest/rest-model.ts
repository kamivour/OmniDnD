import { computeSheet, type CharacterState } from '../../engine/calc/sheet';
import { formatClock } from '../../engine/clock';
import {
  completeLongRest,
  completeShortRest,
  runCommand,
  spellSelectionDetails,
  type Automation,
  type ShortRestPayload,
} from '../../engine/commands';
import type { Registry } from '../../engine/registry';

export interface RestChange {
  label: string;
  before: string;
  after: string;
}

/** A discarded command result previews the same calculation that Apply will run. */
export function previewShortRest(
  state: CharacterState,
  registry: Registry,
  payload: ShortRestPayload,
) {
  return runCommand(completeShortRest, state, payload, registry, {
    eventId: 'preview.short-rest',
    realTime: '1970-01-01T00:00:00.000Z',
  });
}

/** Preserve warnings while deriving a projected result; neither run writes state or history. */
export function previewLongRest(
  state: CharacterState,
  registry: Registry,
  automation: Automation = 'assisted',
) {
  const options = {
    eventId: 'preview.long-rest',
    realTime: '1970-01-01T00:00:00.000Z',
    automation,
  };
  const checked = runCommand(completeLongRest, state, null, registry, options);
  if (checked.result !== 'warn') return { ...checked, warnings: [] as string[] };
  const projected = runCommand(completeLongRest, state, null, registry, {
    ...options,
    force: true,
  });
  return { ...projected, warnings: checked.reasons };
}

/** Only supported classes that can currently prepare leveled spells need a rest prompt. */
export function preparedRestClassIds(state: CharacterState, registry: Registry): string[] {
  const context = { ...state, registry, sheet: computeSheet(state, registry) };
  return state.build.classes.flatMap(({ classId }) => {
    const details = spellSelectionDetails(context, classId);
    return (details.mode === 'prepared' || details.mode === 'spellbook') &&
      details.maxSpellLevel > 0
      ? [classId]
      : [];
  });
}

/** Presentation of engine results, including resources that a rest leaves unchanged. */
export function restChanges(
  before: CharacterState,
  after: CharacterState,
  registry: Registry,
): RestChange[] {
  const previous = computeSheet(before, registry);
  const next = computeSheet(after, registry);
  const rows: RestChange[] = [
    {
      label: 'HP',
      before: `${before.live.hp} / ${previous.maxHp.value}`,
      after: `${after.live.hp} / ${next.maxHp.value}`,
    },
    {
      label: 'Game clock',
      before: formatClock(before.live.clock.seconds),
      after: formatClock(after.live.clock.seconds),
    },
  ];
  if (before.live.tempHp !== after.live.tempHp)
    rows.push({
      label: 'Temporary HP',
      before: String(before.live.tempHp),
      after: String(after.live.tempHp),
    });
  if (before.live.exhaustion !== after.live.exhaustion)
    rows.push({
      label: 'Exhaustion',
      before: String(before.live.exhaustion),
      after: String(after.live.exhaustion),
    });
  if (
    before.live.deathSaves.success !== after.live.deathSaves.success ||
    before.live.deathSaves.fail !== after.live.deathSaves.fail
  ) {
    const saves = ({ success, fail }: CharacterState['live']['deathSaves']) =>
      `${success} ${success === 1 ? 'success' : 'successes'} / ${fail} ${fail === 1 ? 'failure' : 'failures'}`;
    rows.push({
      label: 'Death saves',
      before: saves(before.live.deathSaves),
      after: saves(after.live.deathSaves),
    });
  }
  if (before.live.lastLongRestEnd !== after.live.lastLongRestEnd)
    rows.push({
      label: 'Last long rest',
      before:
        before.live.lastLongRestEnd === undefined
          ? 'Never'
          : formatClock(before.live.lastLongRestEnd),
      after:
        after.live.lastLongRestEnd === undefined
          ? 'Never'
          : formatClock(after.live.lastLongRestEnd),
    });
  for (const pool of previous.hitDice) {
    rows.push({
      label: `${pool.die} Hit Dice`,
      before: `${Math.max(0, pool.max - (before.live.hitDiceSpent[pool.die] ?? 0))} / ${pool.max}`,
      after: `${Math.max(0, pool.max - (after.live.hitDiceSpent[pool.die] ?? 0))} / ${pool.max}`,
    });
  }
  for (const [level, max] of previous.slots.max.entries()) {
    if (max === 0) continue;
    rows.push({
      label: `Level ${level} slots`,
      before: `${Math.max(0, max - before.live.slotsUsed[level]!)} / ${max}`,
      after: `${Math.max(0, max - after.live.slotsUsed[level]!)} / ${max}`,
    });
  }
  const pact = previous.slots.pact;
  if (pact) {
    rows.push({
      label: `Pact slots (level ${pact.level})`,
      before: `${Math.max(0, pact.count - (before.live.pactSlotsUsed ?? 0))} / ${pact.count}`,
      after: `${Math.max(0, pact.count - (after.live.pactSlotsUsed ?? 0))} / ${pact.count}`,
    });
  } else if (before.live.pactSlotsUsed !== after.live.pactSlotsUsed) {
    rows.push({
      label: 'Pact slots spent',
      before: String(before.live.pactSlotsUsed ?? 0),
      after: String(after.live.pactSlotsUsed ?? 0),
    });
  }
  for (const feature of previous.features) {
    if (!feature.uses) continue;
    const max = feature.uses.max;
    rows.push({
      label: feature.def.name,
      before: `${Math.max(0, max - (before.live.featureUsesSpent[feature.def.id] ?? 0))} / ${max}`,
      after: `${Math.max(0, max - (after.live.featureUsesSpent[feature.def.id] ?? 0))} / ${max}`,
    });
  }
  if (before.live.concentration) {
    const name = registry.get('spell', before.live.concentration.spellId).name;
    rows.push({
      label: 'Concentration',
      before: name,
      after: after.live.concentration
        ? registry.get('spell', after.live.concentration.spellId).name
        : 'None',
    });
    const checks = before.live.concentration.pendingSaves?.length ?? 0;
    if (checks > 0)
      rows.push({
        label: 'Pending concentration checks',
        before: String(checks),
        after: String(after.live.concentration?.pendingSaves?.length ?? 0),
      });
  }
  for (const effect of before.live.effects) {
    rows.push({
      label: effect.name,
      before: 'Active',
      after: after.live.effects.some(({ id }) => id === effect.id) ? 'Active' : 'Ended',
    });
  }
  if (previous.conditions.join(', ') !== next.conditions.join(', ')) {
    rows.push({
      label: 'Conditions',
      before: previous.conditions.join(', ') || 'None',
      after: next.conditions.join(', ') || 'None',
    });
  }
  return rows;
}
