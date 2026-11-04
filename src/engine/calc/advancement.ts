import { z } from 'zod';
import type { Registry } from '../registry';
import type { CharacterBuild, HitDieName } from '../schema';
import { averageHpRoll, type HitDie } from './hp';
import type { CharacterState, Sheet } from './sheet';

/** 2014 Basic Rules, Character Advancement (also SRD 5.1). */
const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000,
  195000, 225000, 265000, 305000, 355000,
] as const;

export function xpForLevel(level: number): number {
  return XP_THRESHOLDS[z.int().min(1).max(20).parse(level) - 1]!;
}

export function recordedLevel(build: Pick<CharacterBuild, 'classes'>): number {
  return build.classes.reduce((sum, entry) => sum + entry.level, 0);
}

export interface AdvancementClass {
  classId: string;
  name: string;
  level: number;
  hitDie: HitDieName;
  average: number;
  ambiguous: boolean;
}

export interface AdvancementDetails {
  recordedLevel: number;
  nextLevel?: number;
  atMaximum: boolean;
  canAdvance: boolean;
  classes: AdvancementClass[];
  xp?: { current?: number; threshold?: number; remaining?: number; ready: boolean };
}

/** Advancement follows recorded class levels; resource/stat overrides do not add class levels. */
export function advancementDetails(
  { campaign, build }: CharacterState,
  sheet: Sheet,
  registry: Registry,
): AdvancementDetails {
  const level = recordedLevel(build);
  const atMaximum = level >= 20;
  const classes = [...new Set(build.classes.map((entry) => entry.classId))].map((classId) => {
    const entries = build.classes.filter((entry) => entry.classId === classId);
    const def = registry.get('class', classId);
    return {
      classId,
      name: def.name,
      level: entries.reduce((sum, entry) => sum + entry.level, 0),
      hitDie: def.hitDie,
      average: averageHpRoll(Number(def.hitDie.slice(1)) as HitDie),
      ambiguous: entries.length !== 1,
    };
  });
  const current = build.xp;
  const threshold = atMaximum ? undefined : sheet.nextLevelXp;
  return {
    recordedLevel: level,
    ...(atMaximum ? {} : { nextLevel: level + 1 }),
    atMaximum,
    canAdvance: !atMaximum && classes.some((entry) => !entry.ambiguous),
    classes,
    ...(campaign.leveling === 'xp'
      ? {
          xp: {
            ...(current === undefined ? {} : { current }),
            ...(threshold === undefined ? {} : { threshold }),
            ...(current === undefined || threshold === undefined
              ? {}
              : { remaining: Math.max(0, threshold - current) }),
            ready:
              !atMaximum &&
              current !== undefined &&
              threshold !== undefined &&
              current >= threshold,
          },
        }
      : {}),
  };
}
