import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { freshState, withLive } from '../commands/test-utils';
import { CharacterBuildSchema } from '../schema';
import type { CharacterState } from './sheet';
import { computeSheet } from './sheet';
import { sheetBreakdowns } from './sheet-breakdowns';
import type { Stat } from './stat';

const explain = (state: CharacterState = freshState) =>
  sheetBreakdowns(state, computeSheet(state, registry), registry);
const total = (stat: Stat) => stat.parts.reduce((sum, part) => sum + part.value, 0);

function equipped(state: CharacterState, ...itemIds: string[]): CharacterState {
  return {
    ...state,
    build: {
      ...state.build,
      items: [
        ...state.build.items,
        ...itemIds.map((itemId) => ({ instanceId: `${itemId}-test`, itemId })),
      ],
    },
    live: {
      ...state.live,
      items: {
        ...state.live.items,
        ...Object.fromEntries(
          itemIds.map((itemId) => [`${itemId}-test`, { qty: 1, equipped: true, attuned: false }]),
        ),
      },
    },
  };
}

describe('sheetBreakdowns', () => {
  it('explains The Fool using the existing values and labelled sources without mutation', () => {
    const state = withLive(freshState, { hitDiceSpent: { d8: 1 } });
    const before = structuredClone(state);
    const result = explain(state);
    expect(result.level).toEqual({ value: 3, parts: [{ label: 'Bard', value: 3 }] });
    expect(result.proficiency).toEqual({
      value: 2,
      parts: [],
      notes: ['Character level 3: ceil(3 / 4) + 1 = +2.'],
    });
    expect(result.modifiers.CHA).toEqual({
      value: 5,
      parts: [],
      notes: ['Score 20: Base +18, Half-Elf +2.', 'floor((20 - 10) / 2) = +5.'],
    });
    expect(result.modifiers.STR.value).toBe(0);
    expect(result.darkvision).toEqual({ value: 60, parts: [{ label: 'Half-Elf', value: 60 }] });
    expect(result.carryingCapacity).toEqual({
      value: 165,
      parts: [],
      notes: ['STR 11 × 15 lb = 165 lb.'],
    });
    expect(result.hitDice).toEqual([
      {
        die: 'd8',
        max: { value: 3, parts: [{ label: 'Bard', value: 3 }] },
        remaining: {
          value: 2,
          parts: [
            { label: 'Bard', value: 3 },
            { label: 'Spent Hit Dice', value: -1 },
          ],
        },
      },
    ]);
    expect(result.attacks).toEqual([
      {
        instanceId: 'rapier-1',
        damageBonus: {
          value: 2,
          parts: [{ label: 'DEX', value: 2 }],
          notes: [
            'Damage dice: 1d8. Add DEX +2 to the rolled total.',
            'Finesse uses the higher of STR and DEX; DEX selected.',
          ],
        },
      },
      {
        instanceId: 'dagger-1',
        damageBonus: {
          value: 2,
          parts: [{ label: 'DEX', value: 2 }],
          notes: [
            'Damage dice: 1d4. Add DEX +2 to the rolled total.',
            'Finesse uses the higher of STR and DEX; DEX selected.',
          ],
        },
      },
    ]);
    expect(state).toEqual(before);
  });

  it('separates multiclass contributions within shared and distinct Hit Die pools', () => {
    const state: CharacterState = {
      ...freshState,
      build: {
        ...freshState.build,
        classes: [
          { classId: 'class.bard', level: 3 },
          { classId: 'class.rogue', level: 2 },
          { classId: 'class.fighter', level: 1 },
        ],
        hpEntries: [
          ...freshState.build.hpEntries,
          { level: 4, classId: 'class.rogue', value: 5, method: 'average' },
          { level: 5, classId: 'class.rogue', value: 5, method: 'average' },
          { level: 6, classId: 'class.fighter', value: 6, method: 'average' },
        ],
      },
    };
    expect(CharacterBuildSchema.safeParse(state.build).success).toBe(true);
    const result = explain(state);
    expect(result.level).toEqual({
      value: 6,
      parts: [
        { label: 'Bard', value: 3 },
        { label: 'Rogue', value: 2 },
        { label: 'Fighter', value: 1 },
      ],
    });
    expect(result.proficiency.value).toBe(3);
    expect(result.hitDice.map(({ die, max }) => ({ die, max }))).toEqual([
      {
        die: 'd8',
        max: {
          value: 5,
          parts: [
            { label: 'Bard', value: 3 },
            { label: 'Rogue', value: 2 },
          ],
        },
      },
      { die: 'd10', max: { value: 1, parts: [{ label: 'Fighter', value: 1 }] } },
    ]);
    for (const pool of result.hitDice) expect(total(pool.max)).toBe(pool.max.value);
    expect(computeSheet(state, registry).maxHp.notes).toContain(
      'Level 6 (Fighter): locked average 6 + current CON (+1) = 7; no per-level minimum.',
    );
  });

  it('retains overspent Hit Dice while explaining the displayed zero remaining', () => {
    const state = withLive(freshState, { hitDiceSpent: { d8: 5 } });
    const remaining = explain(state).hitDice[0]!.remaining;
    expect(remaining).toEqual({
      value: 0,
      parts: [
        { label: 'Bard', value: 3 },
        { label: 'Spent Hit Dice', value: -5 },
        { label: 'Minimum remaining 0', value: 2 },
      ],
    });
    expect(total(remaining)).toBe(remaining.value);
    expect(state.live.hitDiceSpent.d8).toBe(5);
  });

  it('explains flat minimum damage and negative variable-dice modifiers without inventing Net damage', () => {
    const weapons = equipped(
      freshState,
      'item.blowgun',
      'item.shortbow',
      'item.net',
      'item.longsword',
    );
    const state: CharacterState = {
      ...weapons,
      build: {
        ...weapons.build,
        abilityScores: { base: { ...weapons.build.abilityScores.base, DEX: 1 }, bonuses: [] },
      },
    };
    const result = explain(state);
    expect(
      result.attacks.find(({ instanceId }) => instanceId === 'item.blowgun-test')?.damageBonus,
    ).toEqual({
      value: 0,
      parts: [
        { label: 'Blowgun', value: 1 },
        { label: 'DEX', value: -5 },
        { label: 'Minimum flat damage 0', value: 4 },
      ],
      notes: ['Flat damage: max(0, 1 + (-5)) = 0.', 'Ranged weapon uses DEX.'],
    });
    expect(
      result.attacks.find(({ instanceId }) => instanceId === 'item.shortbow-test')?.damageBonus,
    ).toEqual({
      value: -5,
      parts: [{ label: 'DEX', value: -5 }],
      notes: ['Damage dice: 1d6. Add DEX -5 to the rolled total.', 'Ranged weapon uses DEX.'],
    });
    expect(result.attacks.find(({ instanceId }) => instanceId === 'item.net-test')).toEqual({
      instanceId: 'item.net-test',
    });
    expect(
      result.attacks.find(({ instanceId }) => instanceId === 'item.longsword-test')?.damageBonus
        ?.notes,
    ).toContain('Versatile damage dice: 1d10. The STR modifier is unchanged.');
    for (const attack of result.attacks)
      if (attack.damageBonus) expect(total(attack.damageBonus)).toBe(attack.damageBonus.value);
  });

  it('uses the complete selected subrace as the darkvision source and omits unsupported senses', () => {
    const subrace: CharacterState = {
      ...freshState,
      build: { ...freshState.build, raceId: 'race.elf', subraceId: 'race.high-elf' },
    };
    expect(explain(subrace).darkvision).toEqual({
      value: 60,
      parts: [{ label: 'High Elf', value: 60 }],
    });
    const human: CharacterState = {
      ...freshState,
      build: { ...freshState.build, raceId: 'race.human' },
    };
    expect(explain(human)).not.toHaveProperty('darkvision');
  });

  it('shows the 2014 next-level threshold only in XP mode before level 20', () => {
    expect(explain()).not.toHaveProperty('nextLevelXp');
    const xp: CharacterState = {
      ...freshState,
      campaign: { ...freshState.campaign, leveling: 'xp' },
    };
    expect(explain(xp).nextLevelXp).toEqual({
      value: 2700,
      parts: [],
      notes: ['2014 character advancement: level 4 requires 2700 XP.'],
    });
    expect(xp.build).not.toHaveProperty('xp');
    const level20: CharacterState = {
      ...xp,
      build: {
        ...xp.build,
        classes: [{ classId: 'class.bard', level: 20 }],
        hpEntries: [
          ...xp.build.hpEntries,
          ...Array.from({ length: 17 }, (_, index) => ({
            level: index + 4,
            classId: 'class.bard',
            value: 5,
            method: 'average' as const,
          })),
        ],
      },
    };
    expect(CharacterBuildSchema.safeParse(level20.build).success).toBe(true);
    expect(explain(level20)).not.toHaveProperty('nextLevelXp');
  });
});

describe('max HP explanations', () => {
  const weak: CharacterState = {
    ...freshState,
    build: {
      ...freshState.build,
      abilityScores: { base: { ...freshState.build.abilityScores.base, CON: 1 }, bonuses: [] },
      hpEntries: freshState.build.hpEntries.map((entry) => ({
        ...entry,
        value: entry.level === 1 ? 8 : 1,
      })),
    },
  };

  it.each([0, 4])(
    'includes the final minimum-1 adjustment and exhaustion %s without changing max HP',
    (exhaustion) => {
      const hp = computeSheet(withLive(weak, { exhaustion }), registry).maxHp;
      expect(hp.value).toBe(1);
      expect(hp.parts).toEqual([
        { label: 'Level 1', value: 3 },
        { label: 'Level 2', value: -4 },
        { label: 'Level 3', value: -4 },
        { label: 'Minimum max HP 1', value: 6 },
      ]);
      expect(total(hp)).toBe(hp.value);
      expect(hp.notes).toContain('Minimum maximum HP: max(1, -5) = 1.');
      if (exhaustion === 4) expect(hp.notes).toContain('Exhaustion 4: max(1, floor(1 / 2)) = 1.');
    },
  );

  it('explains locked rolls and current CON while preserving per-entry floors and exhaustion rounding', () => {
    const state: CharacterState = {
      ...weak,
      campaign: { ...weak.campaign, hpLevelFloor: 'one' },
      build: {
        ...weak.build,
        hpEntries: weak.build.hpEntries.map((entry) => ({
          ...entry,
          floor: entry.level === 2 ? 'none' : 'one',
        })),
      },
    };
    const hp = computeSheet(state, registry).maxHp;
    expect(hp.notes).toEqual([
      'Level 1 (Bard): locked maximum 8 + current CON (-5) = 3; minimum 1 per level → 3.',
      'Level 2 (Bard): locked roll 1 + current CON (-5) = -4; no per-level minimum.',
      'Level 3 (Bard): locked roll 1 + current CON (-5) = -4; minimum 1 per level → 1.',
      'Minimum maximum HP: max(1, 0) = 1.',
    ]);
    const ordinary = computeSheet(withLive(freshState, { exhaustion: 4 }), registry).maxHp;
    expect(ordinary.value).toBe(9);
    expect(total(ordinary)).toBe(9);
    expect(ordinary.parts.at(-1)).toEqual({ label: 'Exhaustion (halved)', value: -10 });
    expect(ordinary.notes?.at(-1)).toBe('Exhaustion 4: max(1, floor(19 / 2)) = 9.');
  });
});
