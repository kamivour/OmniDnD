import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { freshState, Session } from '../commands/test-utils';
import { levelUp } from '../commands/level';
import { setValueOverride } from '../commands/value-overrides';
import type { CharacterBuild } from '../schema';
import { computeSheet, type CharacterState } from './sheet';
import { sheetBreakdowns } from './sheet-breakdowns';
import { overridePath } from './value-overrides';

const entry = (path: string, value: unknown, note = 'DM approved') => ({ path, value, note });
const withOverrides = (...overrides: CharacterBuild['overrides']): CharacterState => ({
  ...structuredClone(freshState),
  build: { ...structuredClone(freshState.build), overrides },
});

describe('Sheet override dependencies', () => {
  it('rejects an unsafe aggregate Hit Dice capacity while preserving imported records and unrelated overrides', () => {
    const state = withOverrides();
    state.build.classes = [
      { classId: 'class.bard', level: 2 },
      { classId: 'class.wizard', level: 1 },
    ];
    state.build.hpEntries[2]!.classId = 'class.wizard';
    const session = new Session(state);
    expect(
      session.try(setValueOverride, {
        path: '/hitDice/d8/max',
        value: Number.MAX_SAFE_INTEGER,
        note: 'Untrackable total',
      }).result,
    ).toBe('blocked');
    expect(session.events).toEqual([]);
    state.build.overrides = [
      entry('/hitDice/d8/max', Number.MAX_SAFE_INTEGER),
      entry('/hitDice/d6/max', Number.MAX_SAFE_INTEGER),
      entry('/ac', 17),
    ];
    const before = structuredClone(state);
    const sheet = computeSheet(state, registry);
    expect(sheet.hitDice).toEqual([
      { die: 'd8', max: 2 },
      { die: 'd6', max: 1 },
    ]);
    expect(sheet.ac.value).toBe(17);
    expect(state).toEqual(before);
  });
  it('preserves current HP when advancing under a fixed very large maximum', () => {
    const state = withOverrides(entry('/maxHp', Number.MAX_SAFE_INTEGER));
    state.live.hp = 10;
    const session = new Session(state);
    session.run(levelUp, { classId: 'class.bard', roll: 4 });
    expect(session.live.hp).toBe(10);
    expect(session.sheet.maxHp.value).toBe(Number.MAX_SAFE_INTEGER);
    expect(session.state.build.classes[0]?.level).toBe(4);
  });
  it('recalculates DEX-dependent defenses and weapon numbers without changing choices or live state', () => {
    const state = withOverrides(entry('/abilities/DEX/score', 18));
    const before = structuredClone(state);
    const sheet = computeSheet(state, registry);
    expect(sheet.abilities.DEX.mod).toBe(4);
    expect(sheet.saves.DEX.value).toBe(6);
    expect(sheet.initiative.value).toBe(5);
    expect(sheet.ac.value).toBe(15);
    expect(sheet.attacks.find((attack) => attack.name === 'Rapier')).toMatchObject({
      ability: 'DEX',
      toHit: { value: 6 },
      damage: { bonus: 4 },
    });
    expect(state).toEqual(before);
  });

  it('applies upstream modifiers and proficiency before terminal overrides and passive checks', () => {
    const state = withOverrides(
      entry('/abilities/CHA/score', 22),
      entry('/abilities/CHA/mod', 9),
      entry('/proficiency', 4),
      entry('/saves/CHA', 100),
      entry('/skills/deception', 50),
      entry('/skills/perception', 15),
      entry('/passives/perception', 30),
    );
    const sheet = computeSheet(state, registry);
    expect(sheet.spellcasting[0]?.saveDc.value).toBe(21);
    expect(sheet.spellcasting[0]?.attack.value).toBe(13);
    expect(
      sheet.features.find(({ def }) => def.id === 'feature.bard.bardic-inspiration')?.uses?.max,
    ).toBe(9);
    expect(sheet.saves.CHA.value).toBe(100);
    expect(sheet.skills.deception.value).toBe(50);
    expect(sheet.passives.perception.override?.calculated).toBe(25);
    expect(sheet.passives.perception.value).toBe(30);
    expect(sheet.passives.perception.parts.reduce((sum, part) => sum + part.value, 0)).toBe(30);
  });

  it('uses current CON for locked HP entries while preserving current HP and spent counters', () => {
    const state = withOverrides(entry('/abilities/CON/score', 18));
    state.live.hp = 7;
    state.live.hitDiceSpent = { d8: 2 };
    const sheet = computeSheet(state, registry);
    expect(sheet.maxHp.value).toBe(28);
    expect(state.live.hp).toBe(7);
    expect(state.live.hitDiceSpent).toEqual({ d8: 2 });
    expect(state.build.hpEntries).toEqual(freshState.build.hpEntries);
  });

  it.each([
    { effective: 5, proficiency: 3 },
    { effective: 20, proficiency: 6 },
  ])(
    'separates effective level $effective from recorded advancement, HP entries and class tables',
    ({ effective, proficiency }) => {
      const state = withOverrides(entry('/level', effective));
      state.campaign.leveling = 'xp';
      const sheet = computeSheet(state, registry);
      expect(sheet.level).toBe(effective);
      expect(sheet.proficiency).toBe(proficiency);
      expect(sheet.nextLevelXp).toBe(2700);
      expect(sheet.slots.max).toEqual(computeSheet(freshState, registry).slots.max);
      expect(
        sheet.features.find(({ def }) => def.id === 'feature.bard.bardic-inspiration')?.die,
      ).toBe('d6');
      expect(state.build.classes[0]?.level).toBe(3);
      expect(state.build.hpEntries).toHaveLength(3);
    },
  );

  it('explains overridden scalars with the calculated answer and a separate adjustment', () => {
    const state = withOverrides(
      entry('/abilities/CHA/mod', 7),
      entry('/proficiency', 4),
      entry('/carryingCapacity', 200),
      entry('/hitDice/d8/max', 5),
      entry('/nextLevelXp', 12345),
    );
    state.campaign.leveling = 'xp';
    state.live.hitDiceSpent = { d8: 2 };
    const sheet = computeSheet(state, registry);
    const breakdowns = sheetBreakdowns(state, sheet, registry);
    expect(breakdowns.modifiers.CHA.notes?.join(' ')).toContain('floor((20 - 10) / 2) = +5.');
    expect(breakdowns.modifiers.CHA.notes?.join(' ')).toContain('Calculated 5; using 7.');
    expect(breakdowns.modifiers.CHA.parts.reduce((sum, part) => sum + part.value, 0)).toBe(7);
    expect(breakdowns.proficiency.notes?.join(' ')).toContain('= +2.');
    expect(breakdowns.proficiency.value).toBe(4);
    expect(breakdowns.carryingCapacity.notes?.join(' ')).toContain('= 165 lb.');
    expect(breakdowns.carryingCapacity.value).toBe(200);
    expect(breakdowns.hitDice[0]?.max.value).toBe(5);
    expect(breakdowns.hitDice[0]?.remaining.value).toBe(3);
    expect(breakdowns.hitDice[0]?.remaining.parts.reduce((sum, part) => sum + part.value, 0)).toBe(
      3,
    );
    expect(breakdowns.nextLevelXp?.notes?.join(' ')).toContain('requires 2700 XP.');
    expect(breakdowns.nextLevelXp?.value).toBe(12345);
  });

  it('ignores unsafe legacy dependencies while retaining unrelated valid overrides and every saved record', () => {
    const state = withOverrides(
      entry('/abilities/STR/score', Number.MAX_SAFE_INTEGER),
      entry('/ac', 17),
      entry('/unknown-future-value', { custom: true }),
    );
    const before = structuredClone(state);
    const sheet = computeSheet(state, registry);
    expect(sheet.abilities.STR.score.value).toBe(11);
    expect(sheet.carryingCapacity).toBe(165);
    expect(sheet.ac.value).toBe(17);
    expect(sheetBreakdowns(state, sheet, registry).carryingCapacity.value).toBe(165);
    expect(state).toEqual(before);
  });

  it('allows escaped instance IDs without interpreting their path segments', () => {
    const state = withOverrides();
    const weapon = state.build.items.find((item) => item.itemId === 'item.rapier')!;
    const old = weapon.instanceId;
    weapon.instanceId = 'blade/~edge';
    state.live.items[weapon.instanceId] = state.live.items[old]!;
    delete state.live.items[old];
    state.build.overrides.push(entry(overridePath('attacks', weapon.instanceId, 'toHit'), 12));
    expect(
      computeSheet(state, registry).attacks.find(
        (attack) => attack.instanceId === weapon.instanceId,
      )?.toHit.value,
    ).toBe(12);
  });
});
