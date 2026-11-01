import { averageHpRoll, type HitDie } from '../calc/hp';
import type { HpEntry } from '../schema';
import type { Command } from './runner';
import { block, faces, maxHpAfter, rangeCheck, warn, withNotes } from './shared';

export interface LevelUpPayload {
  classId: string;
  /** The new level's Hit Die roll. Absent: take the average (half the die + 1). */
  roll?: number;
}

/**
 * Minimal level-up (Phase 1): one more class level, one locked HP entry (D15) and so one more
 * Hit Die. Spent Hit Dice stay spent (D35). Feature and spell choices are the Phase 3 wizard.
 * Current HP rises by the max HP gained.
 */
export const levelUp: Command<LevelUpPayload> = {
  name: 'levelUp',
  check: ({ campaign, build, registry }, { classId, roll }) => {
    const entry = build.classes.find((row) => row.classId === classId);
    if (!entry) return [block('Multiclassing comes later: level up a class you have')];
    const total = build.classes.reduce((sum, row) => sum + row.level, 0);
    if (total >= 20) return [block('Already level 20')];
    const die = faces(registry.get('class', classId).hitDie);
    if (roll !== undefined) {
      const checks = rangeCheck('Hit Die roll', roll, 1, die);
      if (checks.length > 0) return checks;
      return campaign.hpMethod === 'average'
        ? [warn('Campaign uses average HP: using your roll')]
        : [];
    }
    return campaign.hpMethod === 'rolled'
      ? [warn('Campaign uses rolled HP: taking the average')]
      : [];
  },
  apply: (draft, { classId, roll }, ctx) => {
    const { build, live } = draft;
    const def = ctx.registry.get('class', classId);
    const entry = build.classes.find((row) => row.classId === classId);
    if (!entry) return 'No such class';
    entry.level += 1;
    const hpEntry: HpEntry = {
      level: build.hpEntries.length + 1,
      classId,
      value: roll ?? averageHpRoll(faces(def.hitDie) as HitDie),
      method: roll === undefined ? 'average' : 'rolled',
    };
    build.hpEntries.push(hpEntry);

    const before = ctx.sheet.maxHp.value;
    const after = maxHpAfter(ctx, {
      build: {
        ...ctx.build,
        classes: ctx.build.classes.map((row) =>
          row.classId === classId ? { ...row, level: row.level + 1 } : row,
        ),
        hpEntries: [...ctx.build.hpEntries, hpEntry],
      },
    });
    const notes: string[] = [];
    // A negative-CON level can lower max HP (D44); current HP follows but stays at least 1.
    if (live.hp > 0) {
      const hp = Math.min(after, Math.max(1, live.hp + after - before));
      if (hp !== live.hp) notes.push(`HP ${live.hp} → ${hp}`);
      live.hp = hp;
    }
    return withNotes(`Level up: ${def.name} ${entry.level} (max HP ${before} → ${after})`, notes);
  },
};
