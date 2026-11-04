import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedState } from '../commands/test-utils';
import { advancementDetails, recordedLevel } from './advancement';
import { computeSheet, type CharacterState } from './sheet';

const details = (state: CharacterState) =>
  advancementDetails(state, computeSheet(state, registry), registry);

function atLevel(level: number): CharacterState {
  const state = structuredClone(seedState);
  state.build.classes = [{ classId: 'class.bard', level }];
  state.build.hpEntries = Array.from({ length: level }, (_, index) => ({
    level: index + 1,
    classId: 'class.bard',
    value: index === 0 ? 8 : 5,
    method: index === 0 ? 'max' : 'average',
    floor: 'none',
  }));
  return state;
}

describe('advancement details', () => {
  it('offers the recorded next level and derived class die/average without exposing XP in milestone mode', () => {
    const state = structuredClone(seedState);
    state.build.xp = 9000;
    const before = structuredClone(state);
    expect(details(state)).toEqual({
      recordedLevel: 3,
      nextLevel: 4,
      atMaximum: false,
      canAdvance: true,
      classes: [
        {
          classId: 'class.bard',
          name: 'Bard',
          level: 3,
          hitDie: 'd8',
          average: 5,
          ambiguous: false,
        },
      ],
    });
    expect(state).toEqual(before);
  });

  it.each([
    { xp: 2699, ready: false, remaining: 1 },
    { xp: 2700, ready: true, remaining: 0 },
    { xp: 2701, ready: true, remaining: 0 },
  ])(
    'tracks the XP threshold at $xp without spending XP or advancing automatically',
    ({ xp, ready, remaining }) => {
      const state = structuredClone(seedState);
      state.campaign.leveling = 'xp';
      state.build.xp = xp;
      expect(details(state).xp).toEqual({ current: xp, threshold: 2700, remaining, ready });
      expect(recordedLevel(state.build)).toBe(3);
      expect(state.build.xp).toBe(xp);
    },
  );

  it('keeps missing XP untracked rather than inventing an earned total', () => {
    const state = structuredClone(seedState);
    state.campaign.leveling = 'xp';
    delete state.build.xp;
    expect(details(state).xp).toEqual({ threshold: 2700, ready: false });
    expect(details(state).canAdvance).toBe(true);
    state.build.xp = 0;
    expect(details(state).xp).toEqual({
      current: 0,
      threshold: 2700,
      remaining: 2700,
      ready: false,
    });
  });

  it('honors a noted next-XP override while an effective level override does not add owned class levels', () => {
    const state = structuredClone(seedState);
    state.campaign.leveling = 'xp';
    state.build.xp = 1000;
    state.build.overrides = [
      { path: '/level', value: 20, note: 'Effective level only' },
      { path: '/nextLevelXp', value: 1000, note: 'DM threshold' },
    ];
    expect(computeSheet(state, registry).level).toBe(20);
    expect(details(state)).toMatchObject({
      recordedLevel: 3,
      nextLevel: 4,
      atMaximum: false,
      canAdvance: true,
      xp: { current: 1000, threshold: 1000, remaining: 0, ready: true },
    });
  });

  it('reports actual level 20 as the cap even when an effective level or XP total says otherwise', () => {
    const state = atLevel(20);
    state.campaign.leveling = 'xp';
    state.build.xp = 999999;
    state.build.overrides.push({ path: '/level', value: 1, note: 'Effective level only' });
    expect(details(state)).toMatchObject({
      recordedLevel: 20,
      atMaximum: true,
      canAdvance: false,
      xp: { current: 999999, ready: false },
    });
    expect(details(state)).not.toHaveProperty('nextLevel');
    expect(details(state).xp).not.toHaveProperty('threshold');
    expect(details(state).xp).not.toHaveProperty('remaining');
  });

  it('flags duplicate owned class records without silently selecting one to advance', () => {
    const state = atLevel(3);
    state.build.classes = [
      { classId: 'class.bard', level: 2 },
      { classId: 'class.bard', level: 1 },
    ];
    expect(details(state)).toMatchObject({
      recordedLevel: 3,
      canAdvance: false,
      classes: [{ classId: 'class.bard', level: 3, ambiguous: true }],
    });
    state.build.classes = [
      { classId: 'class.bard', level: 1 },
      { classId: 'class.bard', level: 1 },
      { classId: 'class.wizard', level: 1 },
    ];
    state.build.hpEntries[2]!.classId = 'class.wizard';
    const next = details(state);
    expect(next.classes).toHaveLength(2);
    expect(next.classes[0]?.ambiguous).toBe(true);
    expect(next.classes[1]).toMatchObject({
      classId: 'class.wizard',
      hitDie: 'd6',
      average: 4,
      ambiguous: false,
    });
    expect(next.canAdvance).toBe(true);
  });

  it('derives each existing multiclass choice from that class instead of the first class die', () => {
    const state = atLevel(3);
    state.build.classes = [
      { classId: 'class.bard', level: 1 },
      { classId: 'class.wizard', level: 1 },
      { classId: 'class.fighter', level: 1 },
    ];
    state.build.hpEntries[1]!.classId = 'class.wizard';
    state.build.hpEntries[2]!.classId = 'class.fighter';
    expect(
      details(state).classes.map(({ classId, hitDie, average }) => ({ classId, hitDie, average })),
    ).toEqual([
      { classId: 'class.bard', hitDie: 'd8', average: 5 },
      { classId: 'class.wizard', hitDie: 'd6', average: 4 },
      { classId: 'class.fighter', hitDie: 'd10', average: 6 },
    ]);
  });
});
