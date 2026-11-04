import type { Sheet } from '../../engine/calc/sheet';
import { counterCorrection } from '../../engine/calc/value-overrides';
import type { CharacterBuild } from '../../engine/schema';

/** Compact HUD text retains exact numbers in its accessible name and title. */
export function compactInteger(value: number): string {
  if (Math.abs(value) < 1_000_000) return String(value);
  const compact = value.toExponential(1).replace('.0e', 'e').replace('e+', 'e');
  return `${Number(compact) === value ? '' : '≈'}${compact}`;
}

/** Resource labels explain both a changed capacity and a still-active counter correction. */
export function resourceOverride(
  build: Pick<CharacterBuild, 'overrides'>,
  sheet: Sheet,
  maxPath: string,
  remainingPath: string,
  spent: number,
  max: number,
): { note: string } | undefined {
  const capacity = sheet.values[maxPath]?.stat.override;
  const correction = counterCorrection(build, remainingPath, spent, max);
  const notes = [
    ...(capacity ? [`Maximum: ${capacity.note}`] : []),
    ...(correction ? [`Remaining: ${correction.note}`] : []),
  ];
  return notes.length ? { note: notes.join('; ') } : undefined;
}
