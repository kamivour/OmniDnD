import { computeSheet, type CharacterState } from '../../engine/calc/sheet';
import { formatClock } from '../../engine/clock';
import { completeShortRest, runCommand, type ShortRestPayload } from '../../engine/commands';
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

/** Presentation of engine results, including resources that a short rest leaves unchanged. */
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
