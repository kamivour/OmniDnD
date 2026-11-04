import { z } from 'zod';

/** 2014 Basic Rules, Character Advancement (also SRD 5.1). */
const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000,
  195000, 225000, 265000, 305000, 355000,
] as const;

export function xpForLevel(level: number): number {
  return XP_THRESHOLDS[z.int().min(1).max(20).parse(level) - 1]!;
}
