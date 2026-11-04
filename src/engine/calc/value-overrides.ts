import { z } from 'zod';
import {
  DieSchema,
  HitDieSchema,
  refId,
  type CharacterBuild,
  type Die,
  type LiveState,
} from '../schema';
import type { Stat } from './stat';

type OverrideBuild = Pick<CharacterBuild, 'overrides'>;

export interface NumberDomain {
  min?: number;
  max?: number;
}

export interface NumberOverride {
  path: string;
  note: string;
  calculated: number;
  value: number;
}

export interface DieOverride {
  path: string;
  note: string;
  calculated: Die;
  value: Die;
}

/** JSON Pointer segments keep instance IDs containing slashes or tildes unambiguous. */
export function overridePath(...segments: (string | number)[]): string {
  return segments
    .map((segment) => `/${String(segment).replaceAll('~', '~0').replaceAll('/', '~1')}`)
    .join('');
}

const safeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);

/** Callers choose supported targets; unknown legacy paths are never interpreted as object writes. */
export function overrideStat(
  build: OverrideBuild,
  path: string,
  base: Stat,
  domain: NumberDomain = {},
): Stat & { override?: NumberOverride } {
  if (!safeInteger(base.value)) return base;
  const entry = build.overrides.findLast(
    (candidate) =>
      candidate.path === path &&
      candidate.note.trim().length > 0 &&
      safeInteger(candidate.value) &&
      candidate.value >= (domain.min ?? Number.MIN_SAFE_INTEGER) &&
      candidate.value <= (domain.max ?? Number.MAX_SAFE_INTEGER) &&
      Number.isSafeInteger(candidate.value - base.value),
  );
  if (!entry || typeof entry.value !== 'number') return base;
  const note = entry.note.trim();
  return {
    ...base,
    value: entry.value,
    parts: [
      ...(base.parts.length ? base.parts : [{ label: 'Calculated', value: base.value }]),
      { label: `Override: ${note}`, value: entry.value - base.value },
    ],
    notes: [
      ...(base.notes ?? []),
      `Override: ${note}. Calculated ${base.value}; using ${entry.value}.`,
    ],
    override: { path, note, calculated: base.value, value: entry.value },
  };
}

/** Feature dice remain bounded to the engine's supported die types. */
export function resolveDieOverride(
  build: OverrideBuild,
  path: string,
  base: Die,
): { value: Die; override?: DieOverride } {
  for (let index = build.overrides.length - 1; index >= 0; index -= 1) {
    const entry = build.overrides[index]!;
    if (entry.path !== path || !entry.note.trim()) continue;
    const parsed = DieSchema.safeParse(entry.value);
    if (!parsed.success) continue;
    const note = entry.note.trim();
    return {
      value: parsed.data,
      override: { path, note, calculated: base, value: parsed.data },
    };
  }
  return { value: base };
}

const NonNegativeSafeInteger = z.int().min(0).max(Number.MAX_SAFE_INTEGER);

/** Remaining counts are counter corrections, not permanent outputs that could prevent spending. */
export const CounterCorrectionValueSchema = z
  .strictObject({
    kind: z.literal('remaining-correction'),
    remaining: NonNegativeSafeInteger,
    spentBefore: NonNegativeSafeInteger,
    spent: NonNegativeSafeInteger,
    max: NonNegativeSafeInteger,
  })
  .refine(
    ({ remaining, spent, max }) => remaining <= max && spent <= max && remaining + spent === max,
    'Remaining and spent must add up to the maximum',
  );

export type CounterCorrectionValue = z.infer<typeof CounterCorrectionValueSchema>;

export interface CounterCorrection {
  path: string;
  note: string;
  value: CounterCorrectionValue;
}

/** A newer valid correction supersedes older notes even after its own counter has changed. */
export function counterCorrection(
  build: OverrideBuild,
  path: string,
  spent: number,
  max: number,
): CounterCorrection | undefined {
  for (let index = build.overrides.length - 1; index >= 0; index -= 1) {
    const entry = build.overrides[index]!;
    if (entry.path !== path || !entry.note.trim()) continue;
    const parsed = CounterCorrectionValueSchema.safeParse(entry.value);
    if (!parsed.success) continue;
    if (parsed.data.spent !== spent || parsed.data.max !== max) return undefined;
    return { path, note: entry.note.trim(), value: parsed.data };
  }
  return undefined;
}

/** Only known physical spending counters have correction lifetimes. No arbitrary path access. */
export function correctionSpent(live: LiveState, path: string): number | undefined {
  const parts = path
    .split('/')
    .slice(1)
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
  if (overridePath(...parts) !== path) return undefined;
  if (parts.length === 3 && parts[0] === 'hitDice' && parts[2] === 'remaining') {
    const die = HitDieSchema.safeParse(parts[1]);
    return die.success ? (live.hitDiceSpent[die.data] ?? 0) : undefined;
  }
  if (
    parts.length === 3 &&
    parts[0] === 'slots' &&
    parts[1] === 'remaining' &&
    /^[1-9]$/.test(parts[2] ?? '')
  )
    return live.slotsUsed[Number(parts[2])] ?? 0;
  if (path === '/slots/pact/remaining') return live.pactSlotsUsed ?? 0;
  if (
    parts.length === 4 &&
    parts[0] === 'features' &&
    parts[2] === 'uses' &&
    parts[3] === 'remaining' &&
    refId('feature').safeParse(parts[1]).success
  )
    return live.featureUsesSpent[parts[1]!] ?? 0;
  return undefined;
}

/** A later use, adjustment or rest ends the note; the command's own patches make expiry undoable. */
export function retainCounterCorrections(
  build: OverrideBuild,
  live: LiveState,
  previousLive: LiveState,
): CharacterBuild['overrides'] {
  return build.overrides.filter((entry) => {
    const correction = CounterCorrectionValueSchema.safeParse(entry.value);
    const spent = correction.success ? correctionSpent(live, entry.path) : undefined;
    const before = correction.success ? correctionSpent(previousLive, entry.path) : undefined;
    return (
      !correction.success ||
      spent === undefined ||
      before === undefined ||
      spent === before ||
      correction.data.spent !== before ||
      spent === correction.data.spent
    );
  });
}
