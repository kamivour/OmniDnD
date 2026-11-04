import type { Registry } from '../registry';
import type { CharacterBuild, HitDieName } from '../schema';
import type { CharacterState, Sheet } from './sheet';
import {
  counterCorrection,
  overridePath,
  type CounterCorrection,
  type DieOverride,
  type NumberDomain,
  type NumberOverride,
} from './value-overrides';

export interface OverrideExpectation {
  value: number | string;
  calculated?: number | string;
  max?: number;
  spent?: number;
  /** Exact matching records, including retained invalid entries. Pass a target's expected unchanged. */
  override?: unknown;
}

interface TargetBase {
  path: string;
  label: string;
  value: number | string;
  calculated: number | string;
  note?: string;
  hasOverride: boolean;
  expected: OverrideExpectation;
}

export type OverrideCounter =
  | { kind: 'hitDice'; die: HitDieName }
  | { kind: 'slots'; level: number }
  | { kind: 'pact' }
  | { kind: 'feature'; featureId: string };

export type OverrideTarget =
  | (TargetBase & {
      kind: 'number';
      value: number;
      calculated: number;
      domain: NumberDomain;
      override?: NumberOverride;
    })
  | (TargetBase & {
      kind: 'die';
      value: string;
      calculated: string;
      override?: DieOverride;
    })
  | (TargetBase & {
      kind: 'remaining';
      value: number;
      calculated: number;
      domain: { min: 0; max: number };
      max: number;
      spent: number;
      counter: OverrideCounter;
      override?: CounterCorrection;
    });

export type OverrideTargetContext = CharacterState & { sheet: Sheet; registry: Registry };

const recordsAt = (build: CharacterBuild, path: string) =>
  build.overrides.filter((entry) => entry.path === path);

const validCount = (value: number) => Number.isSafeInteger(value) && value >= 0;

/** The editor and commands share this catalog; a path never grants arbitrary write access. */
export function overrideTargets({ build, live, sheet }: OverrideTargetContext): OverrideTarget[] {
  const targets: OverrideTarget[] = [];
  const base = (
    path: string,
    label: string,
    value: number | string,
    calculated: number | string = value,
  ) => {
    const records = recordsAt(build, path);
    return {
      path,
      label,
      value,
      hasOverride: records.length > 0,
      expected: { value, calculated, override: records },
    };
  };
  for (const [path, { label, stat, domain }] of Object.entries(sheet.values)) {
    targets.push({
      ...base(path, label, stat.value, stat.override?.calculated ?? stat.value),
      kind: 'number',
      value: stat.value,
      calculated: stat.override?.calculated ?? stat.value,
      domain,
      ...(stat.override ? { override: stat.override, note: stat.override.note } : {}),
    });
  }
  for (const feature of sheet.features) {
    if (!feature.die) continue;
    const path = overridePath('features', feature.def.id, 'die');
    targets.push({
      ...base(
        path,
        `${feature.def.name} die`,
        feature.die,
        feature.dieOverride?.calculated ?? feature.die,
      ),
      kind: 'die',
      value: feature.die,
      calculated: feature.dieOverride?.calculated ?? feature.die,
      ...(feature.dieOverride
        ? { override: feature.dieOverride, note: feature.dieOverride.note }
        : {}),
    });
  }
  const remaining = (
    path: string,
    label: string,
    max: number,
    spent: number,
    counter: OverrideCounter,
  ) => {
    if (!validCount(max) || !validCount(spent)) return;
    const value = Math.max(0, max - spent);
    const correction = counterCorrection(build, path, spent, max);
    const calculated = correction ? Math.max(0, max - correction.value.spentBefore) : value;
    const shared = base(path, label, value, calculated);
    targets.push({
      ...shared,
      expected: { ...shared.expected, max, spent },
      kind: 'remaining',
      value,
      calculated,
      domain: { min: 0, max },
      max,
      spent,
      counter,
      ...(correction ? { override: correction, note: correction.note } : {}),
    });
  };
  for (const pool of sheet.hitDice)
    remaining(
      overridePath('hitDice', pool.die, 'remaining'),
      `${pool.die} Hit Dice remaining`,
      pool.max,
      live.hitDiceSpent[pool.die] ?? 0,
      { kind: 'hitDice', die: pool.die },
    );
  for (let level = 1; level <= 9; level += 1) {
    const max = sheet.slots.max[level] ?? 0;
    if (max <= 0 && !sheet.values[overridePath('slots', 'max', level)]?.stat.override) continue;
    remaining(
      overridePath('slots', 'remaining', level),
      `Level ${level} spell slots remaining`,
      max,
      live.slotsUsed[level] ?? 0,
      { kind: 'slots', level },
    );
  }
  if (sheet.slots.pact)
    remaining(
      '/slots/pact/remaining',
      'Pact slots remaining',
      sheet.slots.pact.count,
      live.pactSlotsUsed ?? 0,
      { kind: 'pact' },
    );
  for (const feature of sheet.features) {
    if (!feature.uses) continue;
    remaining(
      overridePath('features', feature.def.id, 'uses', 'remaining'),
      `${feature.def.name} uses remaining`,
      feature.uses.max,
      live.featureUsesSpent[feature.def.id] ?? 0,
      { kind: 'feature', featureId: feature.def.id },
    );
  }
  return targets;
}
