import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { computeSheet, type CharacterState } from '../calc/sheet';
import { CharacterBuildSchema, type ActiveEffect } from '../schema';
import { asiLevels, levelChoiceNeeds } from '../calc/level-choices';
import { levelUp, type LevelUpPayload } from './level';
import { runCommand, undo } from './runner';
import { freshState, seedState, Session, withLive } from './test-utils';

const averageCampaign = {
  ...freshState,
  campaign: { ...freshState.campaign, hpMethod: 'average' as const },
};

const metadata = { eventId: 'reviewed-level-up', realTime: '2026-11-05T00:00:00.000Z' };
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

describe('levelUp validation and reviewed commands', () => {
  it('adds a real nineteenth-to-twentieth level and then blocks the actual cap despite an effective level override', () => {
    const state = atLevel(19);
    state.build.overrides.push({ path: '/level', value: 20, note: 'Effective level' });
    const session = new Session(state);
    session.run(levelUp, { classId: 'class.bard', roll: 5, expected: structuredClone(state) });
    expect(session.state.build.classes[0]?.level).toBe(20);
    expect(session.state.build.hpEntries).toHaveLength(20);
    session.state = {
      ...session.state,
      build: {
        ...session.state.build,
        overrides: [{ path: '/level', value: 1, note: 'Effective level' }],
      },
    };
    expect(session.try(levelUp, { classId: 'class.bard', roll: 5 }, true)).toMatchObject({
      result: 'blocked',
      reasons: ['Already level 20'],
    });
  });

  it('rejects an ambiguous duplicate class rather than changing one row while previewing several', () => {
    const state = atLevel(3);
    state.build.classes = [
      { classId: 'class.bard', level: 2 },
      { classId: 'class.bard', level: 1 },
    ];
    const before = structuredClone(state);
    expect(
      runCommand(levelUp, state, { classId: 'class.bard', roll: 5 }, registry, metadata),
    ).toMatchObject({
      result: 'blocked',
      reasons: [expect.stringContaining('multiple saved records')],
    });
    expect(state).toEqual(before);
  });

  it.each([
    null,
    undefined,
    {},
    { classId: 'class.bard', extra: true },
    { classId: 'class.bard', roll: '5' },
    { classId: 'class.bard', roll: null },
    { classId: 'class.bard', roll: NaN },
    { classId: 'class.bard', roll: Infinity },
    { classId: 'class.bard', expected: {} },
  ])('blocks malformed payload %j without throwing even when forced in Manual mode', (payload) => {
    const before = structuredClone(seedState);
    expect(
      runCommand(levelUp, seedState, payload as LevelUpPayload, registry, {
        ...metadata,
        force: true,
        automation: 'manual',
      }).result,
    ).toBe('blocked');
    expect(seedState).toEqual(before);
  });

  it.each([0, 9, 1.5])('blocks out-of-die or fractional roll %s', (roll) => {
    expect(
      runCommand(levelUp, seedState, { classId: 'class.bard', roll }, registry, metadata),
    ).toMatchObject({
      result: 'blocked',
      reasons: ['Hit Die roll must be a whole number from 1 to 8'],
    });
  });

  it('rechecks a reviewed snapshot and cannot apply the same level twice', () => {
    const state = structuredClone(seedState);
    const payload = { classId: 'class.bard', roll: 5, expected: structuredClone(state) };
    const first = runCommand(levelUp, state, payload, registry, metadata);
    expect(first.result).toBe('ok');
    if (first.result !== 'ok') throw new Error('First level failed');
    const second = runCommand(levelUp, first.next, payload, registry, {
      ...metadata,
      eventId: 'second-level',
      force: true,
      automation: 'manual',
    });
    expect(second).toMatchObject({
      result: 'blocked',
      reasons: [expect.stringContaining('changed after this level-up was reviewed')],
    });
    const undone = undo(first.next, [first.event], { ...metadata, eventId: 'undo-reviewed-level' });
    expect(undone.result).toBe('ok');
    if (undone.result !== 'ok') throw new Error('Undo failed');
    expect(undone.next).toEqual(state);
  });

  it.each([
    'class',
    'entry',
    'method',
    'floor',
    'leveling',
    'xp',
    'CON',
    'override',
    'HP',
    'exhaustion',
    'counter',
    'clock',
  ] as const)('blocks stale reviewed %s context without overwriting current values', (change) => {
    const state = structuredClone(seedState);
    const expected = structuredClone(state);
    if (change === 'class') {
      state.build.classes[0]!.level += 1;
      state.build.hpEntries.push({ level: 4, classId: 'class.bard', value: 5, method: 'rolled' });
    }
    if (change === 'entry') state.build.hpEntries[1]!.value += 1;
    if (change === 'method') state.campaign.hpMethod = 'average';
    if (change === 'floor') state.campaign.hpLevelFloor = 'one';
    if (change === 'leveling') state.campaign.leveling = 'xp';
    if (change === 'xp') state.build.xp = 2700;
    if (change === 'CON') state.build.abilityScores.base.CON += 1;
    if (change === 'override')
      state.build.overrides.push({ path: '/maxHp', value: 30, note: 'New ruling' });
    if (change === 'HP') state.live.hp = 10;
    if (change === 'exhaustion') state.live.exhaustion = 4;
    if (change === 'counter') state.live.hitDiceSpent = { d8: 2 };
    if (change === 'clock') state.live.clock.seconds += 1;
    const before = structuredClone(state);
    expect(
      runCommand(levelUp, state, { classId: 'class.bard', roll: 5, expected }, registry, {
        ...metadata,
        force: true,
        automation: 'manual',
      }),
    ).toMatchObject({
      result: 'blocked',
      reasons: [expect.stringContaining('changed after this level-up was reviewed')],
    });
    expect(state).toEqual(before);
  });

  it('advances only the selected owned class and Hit Die pool while preserving every spent count', () => {
    const state = atLevel(4);
    state.build.classes = [
      { classId: 'class.bard', level: 2 },
      { classId: 'class.wizard', level: 1 },
      { classId: 'class.fighter', level: 1 },
    ];
    state.build.hpEntries[2]!.classId = 'class.wizard';
    state.build.hpEntries[2]!.value = 4;
    state.build.hpEntries[3]!.classId = 'class.fighter';
    state.build.hpEntries[3]!.value = 6;
    state.live.hitDiceSpent = { d8: 1, d6: 1, d10: 1 };
    const before = structuredClone(state);
    const session = new Session(state);
    session.run(levelUp, { classId: 'class.wizard', roll: 4, expected: structuredClone(state) });
    expect(session.state.build.classes).toEqual([
      { classId: 'class.bard', level: 2 },
      { classId: 'class.wizard', level: 2 },
      { classId: 'class.fighter', level: 1 },
    ]);
    expect(session.sheet.hitDice).toEqual([
      { die: 'd8', max: 2 },
      { die: 'd6', max: 2 },
      { die: 'd10', max: 1 },
    ]);
    expect(session.live.hitDiceSpent).toEqual(before.live.hitDiceSpent);
    expect(session.state.build.hpEntries.slice(0, 4)).toEqual(before.build.hpEntries);
    expect(session.state.build.hpEntries[4]).toMatchObject({
      level: 5,
      classId: 'class.wizard',
      value: 4,
      method: 'rolled',
      floor: 'none',
    });
  });

  it.each([1, 3])('does not revive a character at 0 HP with %s failed death saves', (fail) => {
    const state = withLive(seedState, {
      hp: 0,
      conditions: ['unconscious'],
      deathSaves: { success: 0, fail },
    });
    const session = new Session(state);
    session.run(levelUp, { classId: 'class.bard', roll: 5, expected: structuredClone(state) });
    expect(session.live).toEqual(state.live);
    expect(session.sheet.maxHp.value).toBe(25);
  });

  it('does not rest, advance time or reset combat, concentration, effects, XP or spent resources', () => {
    const state = structuredClone(seedState);
    state.build.xp = 2700;
    state.live.tempHp = 7;
    state.live.hitDiceSpent = { d8: 2 };
    state.live.concentration = {
      spellId: 'spell.faerie-fire',
      slotLevel: 1,
      endsAt: state.live.clock.seconds + 60,
      pendingSaves: [{ id: 'pending-check', dc: 10 }],
    };
    const effect: ActiveEffect = {
      id: 'ward',
      name: 'Timed Ward',
      concentration: false,
      conditions: [],
      modifiers: [],
      endsAt: state.live.clock.seconds + 30,
    };
    state.live.effects = [effect];
    state.live.combat = {
      round: 7,
      turnActive: false,
      economy: {
        actionUsed: true,
        bonusUsed: true,
        reactionUsed: true,
        movementUsed: 15,
        objectInteractionUsed: true,
        dashCount: 1,
        bonusActionSpellCast: true,
        otherSpellCast: false,
      },
    };
    const before = structuredClone(state);
    const session = new Session(state);
    session.run(levelUp, { classId: 'class.bard', roll: 5, expected: structuredClone(state) });
    expect(session.live).toEqual({ ...before.live, hp: 17 });
    expect(session.state.build.xp).toBe(2700);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('preserves explicit fixed HP and Hit Dice maxima while adding the recorded class level and HP entry', () => {
    const state = structuredClone(seedState);
    state.build.overrides = [
      { path: '/maxHp', value: 30, note: 'Fixed HP' },
      { path: '/hitDice/d8/max', value: 7, note: 'Fixed pool' },
      { path: '/future/value', value: { keep: true }, note: 'Retained' },
    ];
    state.live.hitDiceSpent = { d8: 2 };
    const session = new Session(state);
    session.run(levelUp, { classId: 'class.bard', roll: 5, expected: structuredClone(state) });
    expect(session.sheet.maxHp.value).toBe(30);
    expect(session.sheet.hitDice).toEqual([{ die: 'd8', max: 7 }]);
    expect(session.live).toEqual(state.live);
    expect(session.state.build.overrides).toEqual(state.build.overrides);
    expect(session.state.build.hpEntries).toHaveLength(4);
  });

  it('blocks a level whose additional CON contribution would overflow calculated HP', () => {
    const state = structuredClone(seedState);
    const modifier = Math.floor((Number.MAX_SAFE_INTEGER - 16) / 3);
    state.build.abilityScores.bonuses.push({
      source: 'Large retained boon',
      ability: 'CON',
      value: modifier * 2 + 10 - 13,
    });
    expect(computeSheet(state, registry).maxHp.value).toBe(Number.MAX_SAFE_INTEGER);
    expect(
      runCommand(levelUp, state, { classId: 'class.bard', roll: 5 }, registry, metadata),
    ).toMatchObject({
      result: 'blocked',
      reasons: ['This level produces an unsafe calculated value'],
    });
  });

  it('preserves established HP-method warnings and their explicit force or Manual exceptions', () => {
    const payload = { classId: 'class.bard', expected: structuredClone(seedState) };
    expect(runCommand(levelUp, seedState, payload, registry, metadata)).toMatchObject({
      result: 'warn',
      reasons: ['Campaign uses rolled HP: taking the average'],
    });
    const forced = runCommand(levelUp, seedState, payload, registry, { ...metadata, force: true });
    expect(forced.result).toBe('ok');
    if (forced.result !== 'ok') throw new Error('Forced average failed');
    expect(forced.event.override).toBe(true);
    expect(forced.next.build.hpEntries[3]?.value).toBe(5);
    const manual = runCommand(levelUp, seedState, payload, registry, {
      ...metadata,
      automation: 'manual',
    });
    expect(manual.result).toBe('ok');
    if (manual.result !== 'ok') throw new Error('Manual average failed');
    expect(manual.event.override).toBeUndefined();
  });
});

describe('levelUp', () => {
  it('level 4 rolled 5: max HP 25, Hit Dice 4d8, old entries unchanged (TEST_CHARACTER §4)', () => {
    const session = new Session(seedState);
    expect(session.run(levelUp, { classId: 'class.bard', roll: 5 })).toBe(
      'Level up: Bard 4 (max HP 19 → 25); HP 11 → 17',
    );
    expect(session.sheet.maxHp.value).toBe(25);
    expect(session.sheet.hitDice).toEqual([{ die: 'd8', max: 4 }]);
    expect(session.state.build.classes).toMatchObject([{ classId: 'class.bard', level: 4 }]);
    expect(session.state.build.hpEntries.slice(0, 3)).toEqual(seedState.build.hpEntries);
    expect(session.state.build.hpEntries[3]).toEqual({
      level: 4,
      classId: 'class.bard',
      value: 5,
      method: 'rolled',
      floor: 'none',
    });
  });

  it('spent Hit Dice stay spent (D35)', () => {
    const session = new Session(withLive(freshState, { hitDiceSpent: { d8: 2 } }));
    session.run(levelUp, { classId: 'class.bard', roll: 5 });
    expect(session.live.hitDiceSpent).toEqual({ d8: 2 });
  });

  it('average: half the die + 1, and the warning when the campaign rolls', () => {
    const session = new Session(averageCampaign);
    session.run(levelUp, { classId: 'class.bard' });
    expect(session.state.build.hpEntries[3]).toMatchObject({
      value: 5,
      method: 'average',
      floor: 'none',
    });
    expect(session.sheet.maxHp.value).toBe(25);
    expect(new Session().preview(levelUp, { classId: 'class.bard' })).toEqual({
      result: 'warn',
      reasons: ['Campaign uses rolled HP: taking the average'],
    });
    expect(
      new Session(averageCampaign).preview(levelUp, { classId: 'class.bard', roll: 3 }),
    ).toEqual({ result: 'warn', reasons: ['Campaign uses average HP: using your roll'] });
  });

  it('a low roll with negative CON lowers max HP; current HP stays at least 1 (D44)', () => {
    const weak = {
      ...freshState,
      build: {
        ...freshState.build,
        // CON 5 + 1 (half-elf) = 6: modifier -2.
        abilityScores: {
          ...freshState.build.abilityScores,
          base: { ...freshState.build.abilityScores.base, CON: 5 },
        },
      },
    };
    const session = new Session(withLive(weak, { hp: 1 }));
    expect(session.sheet.maxHp.value).toBe(10);
    expect(session.run(levelUp, { classId: 'class.bard', roll: 1 })).toBe(
      'Level up: Bard 4 (max HP 10 → 9)',
    );
    expect(session.live.hp).toBe(1);
  });

  it('is undoable', () => {
    const session = new Session(seedState);
    session.run(levelUp, { classId: 'class.bard', roll: 5 });
    session.undo();
    expect(session.state).toEqual(seedState);
  });

  it('preserves legacy floor-less entries and the campaign calculation when loading them', () => {
    const legacy = CharacterBuildSchema.parse(freshState.build);
    expect(legacy).toEqual(freshState.build);
    expect(legacy.hpEntries.every((entry) => entry.floor === undefined)).toBe(true);
    const weak: CharacterState = {
      ...freshState,
      build: {
        ...legacy,
        abilityScores: {
          ...legacy.abilityScores,
          base: { ...legacy.abilityScores.base, CON: 5 },
        },
        hpEntries: legacy.hpEntries.map((entry) => ({
          ...entry,
          value: entry.level === 1 ? 8 : 1,
        })),
      },
    };
    expect(computeSheet(weak, registry).maxHp).toEqual({
      value: 4,
      parts: [
        { label: 'Level 1', value: 6 },
        { label: 'Level 2', value: -1 },
        { label: 'Level 3', value: -1 },
      ],
      notes: [
        'Level 1 (Bard): locked maximum 8 + current CON (-2) = 6; no per-level minimum.',
        'Level 2 (Bard): locked roll 1 + current CON (-2) = -1; no per-level minimum.',
        'Level 3 (Bard): locked roll 1 + current CON (-2) = -1; no per-level minimum.',
      ],
    });
    expect(
      computeSheet({ ...weak, campaign: { ...weak.campaign, hpLevelFloor: 'one' } }, registry).maxHp
        .value,
    ).toBe(8);
  });

  it('uses the current floor only for the new level and undo preserves mixed saved floors', () => {
    const frozen: CharacterState = {
      ...freshState,
      campaign: { ...freshState.campaign, hpLevelFloor: 'one' },
      build: {
        ...freshState.build,
        abilityScores: {
          ...freshState.build.abilityScores,
          base: { ...freshState.build.abilityScores.base, CON: 5 },
        },
        hpEntries: freshState.build.hpEntries.map((entry) => ({
          ...entry,
          value: entry.level === 1 ? 8 : 1,
          floor: entry.level === 2 ? 'one' : 'none',
        })),
      },
      live: { ...freshState.live, hp: 6 },
    };
    const session = new Session(frozen);
    expect(session.sheet.maxHp).toEqual({
      value: 6,
      parts: [
        { label: 'Level 1', value: 6 },
        { label: 'Level 2', value: 1 },
        { label: 'Level 3', value: -1 },
      ],
      notes: [
        'Level 1 (Bard): locked maximum 8 + current CON (-2) = 6; no per-level minimum.',
        'Level 2 (Bard): locked roll 1 + current CON (-2) = -1; minimum 1 per level → 1.',
        'Level 3 (Bard): locked roll 1 + current CON (-2) = -1; no per-level minimum.',
      ],
    });
    expect(
      computeSheet({ ...frozen, campaign: { ...frozen.campaign, hpLevelFloor: 'none' } }, registry)
        .maxHp,
    ).toEqual(session.sheet.maxHp);
    expect(session.run(levelUp, { classId: 'class.bard', roll: 1 })).toBe(
      'Level up: Bard 4 (max HP 6 → 7); HP 6 → 7',
    );
    expect(session.state.build.hpEntries.slice(0, 3)).toEqual(frozen.build.hpEntries);
    expect(session.state.build.hpEntries[3]).toEqual({
      level: 4,
      classId: 'class.bard',
      value: 1,
      method: 'rolled',
      floor: 'one',
    });
    expect(
      computeSheet(
        {
          ...session.state,
          campaign: { ...session.state.campaign, hpLevelFloor: 'none' },
          build: {
            ...session.state.build,
            abilityScores: {
              ...session.state.build.abilityScores,
              base: { ...session.state.build.abilityScores.base, CON: 9 },
            },
          },
        },
        registry,
      ).maxHp.value,
    ).toBe(11);
    session.undo();
    expect(session.state).toEqual(frozen);
  });

  it('blocks a new class while multiclassing is off, and bad rolls', () => {
    const session = new Session();
    expect(session.preview(levelUp, { classId: 'class.wizard', roll: 3 }).reasons).toEqual([
      'Multiclassing is off in this campaign',
    ]);
    expect(session.preview(levelUp, { classId: 'class.bard', roll: 9 }).reasons).toEqual([
      'Hit Die roll must be a whole number from 1 to 8',
    ]);
  });
});

describe('levelUp multiclassing', () => {
  const multiclass = (): CharacterState => {
    const state = structuredClone(freshState);
    state.campaign.optionalRules = { ...state.campaign.optionalRules, multiclassing: true };
    return state;
  };

  it('adds a new class at level 1 with its proficiencies, and undo restores everything', () => {
    const state = multiclass();
    const session = new Session(state);
    const before = structuredClone(session.state);
    session.run(levelUp, { classId: 'class.fighter', roll: 5 });
    expect(session.state.build.classes).toContainEqual({ classId: 'class.fighter', level: 1 });
    expect(session.state.build.hpEntries.at(-1)).toMatchObject({
      classId: 'class.fighter',
      value: 5,
    });
    expect(session.state.build.proficiencies.armor).toEqual(
      expect.arrayContaining(['light', 'medium', 'shield']),
    );
    expect(session.state.build.proficiencies.weapons).toEqual(
      expect.arrayContaining(['simple', 'martial']),
    );
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('needs the 13+ minimums for the current and the new class', () => {
    const session = new Session(multiclass());
    expect(session.preview(levelUp, { classId: 'class.wizard', roll: 3 }).reasons).toEqual([
      'The new class Wizard needs INT 13',
    ]);
    const weak = multiclass();
    weak.build.abilityScores.base.CHA = 8;
    weak.build.abilityScores.bonuses = [];
    expect(
      new Session(weak).preview(levelUp, { classId: 'class.fighter', roll: 3 }).reasons,
    ).toEqual(['The current class Bard needs CHA 13']);
  });

  it('asks for the picks a new class grants and rejects the wrong ones', () => {
    const session = new Session(multiclass());
    expect(session.preview(levelUp, { classId: 'class.rogue', roll: 4 }).reasons).toEqual([
      'Pick a skill for Rogue',
    ]);
    expect(
      session.preview(levelUp, { classId: 'class.rogue', roll: 4, skill: 'arcana' }).reasons,
    ).toEqual(['Rogue does not offer that skill']);
    session.run(levelUp, { classId: 'class.rogue', roll: 4, skill: 'athletics' });
    expect(session.state.build.proficiencies.skills).toContain('athletics');
    expect(session.state.build.proficiencies.tools).toContain('item.thieves-tools');
  });
});

describe('levelUp choices', () => {
  const asBard = (level: number) => {
    const state = atLevel(level);
    state.build.abilityScores.base = { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 16 };
    state.build.abilityScores.bonuses = [];
    state.build.proficiencies.expertise = [];
    state.build.proficiencies.skills = ['stealth', 'arcana'];
    state.build.featureIds = [];
    return state;
  };
  const asFighter = (level: number) => {
    const state = structuredClone(freshState);
    state.build.classes = [{ classId: 'class.fighter', level }];
    state.build.hpEntries = Array.from({ length: level }, (_, index) => ({
      level: index + 1,
      classId: 'class.fighter',
      value: index === 0 ? 10 : 6,
      method: index === 0 ? ('max' as const) : ('average' as const),
      floor: 'none' as const,
    }));
    state.build.featureIds = [];
    return state;
  };

  it('raises scores at an ASI level, in one step of 2 or two steps of 1, and Undo restores them', () => {
    const session = new Session(asBard(3));
    const before = structuredClone(session.state);
    session.run(levelUp, {
      classId: 'class.bard',
      roll: 5,
      choices: { asi: { kind: 'abilities', increases: [{ ability: 'CHA', value: 2 }] } },
    });
    expect(session.state.build.abilityScores.bonuses).toEqual([
      { source: 'ASI: Bard 4', ability: 'CHA', value: 2 },
    ]);
    session.undo();
    expect(session.state).toEqual(before);
    const split = new Session(asBard(3));
    split.run(levelUp, {
      classId: 'class.bard',
      roll: 5,
      choices: {
        asi: {
          kind: 'abilities',
          increases: [
            { ability: 'DEX', value: 1 },
            { ability: 'CON', value: 1 },
          ],
        },
      },
    });
    expect(split.state.build.abilityScores.bonuses).toHaveLength(2);
  });

  it('blocks a wrong-sized ASI, a score above 20, and an ASI at the wrong level', () => {
    const session = new Session(asBard(3));
    const asi = (increases: { ability: 'CHA' | 'DEX'; value: 1 | 2 }[]) => ({
      classId: 'class.bard',
      roll: 5,
      choices: { asi: { kind: 'abilities' as const, increases } },
    });
    expect(session.preview(levelUp, asi([{ ability: 'CHA', value: 1 }])).reasons).toEqual([
      'Raise one ability by 2, or two different abilities by 1 each',
    ]);
    expect(
      session.preview(
        levelUp,
        asi([
          { ability: 'CHA', value: 1 },
          { ability: 'CHA', value: 1 },
        ]),
      ).reasons,
    ).toEqual(['Raise one ability by 2, or two different abilities by 1 each']);
    const capped = asBard(3);
    capped.build.abilityScores.base.CHA = 19;
    expect(
      new Session(capped).preview(levelUp, asi([{ ability: 'CHA', value: 2 }])).reasons,
    ).toEqual(['CHA cannot go above 20']);
    expect(
      new Session(asBard(4)).preview(levelUp, asi([{ ability: 'CHA', value: 2 }])).reasons,
    ).toEqual(['Bard 5 has no ability score improvement']);
  });

  it('gives Fighter and Rogue their extra ASI levels', () => {
    expect(asiLevels('class.fighter')).toEqual([4, 6, 8, 12, 14, 16, 19]);
    expect(asiLevels('class.rogue')).toEqual([4, 8, 10, 12, 16, 19]);
    expect(asiLevels('class.bard')).toEqual([4, 8, 12, 16, 19]);
  });

  it('blocks feats while feats are off or the feat is unknown', () => {
    const feat = { asi: { kind: 'feat' as const, featId: 'feature.feat.nope' } };
    expect(
      new Session(asBard(3)).preview(levelUp, { classId: 'class.bard', roll: 5, choices: feat })
        .reasons,
    ).toEqual(['Feats are off in this campaign']);
    const on = asBard(3);
    on.campaign.optionalRules = { ...on.campaign.optionalRules, feats: true };
    expect(
      new Session(on).preview(levelUp, { classId: 'class.bard', roll: 5, choices: feat }).reasons,
    ).toEqual(['The selected feat is unavailable']);
  });

  it('sets a subclass once, at or after the subclass level', () => {
    const session = new Session(asFighter(2));
    expect(levelChoiceNeeds(registry, 'class.fighter', session.state.build)).toEqual({
      subclass: true,
      asi: false,
    });
    expect(
      session.preview(levelUp, {
        classId: 'class.fighter',
        roll: 6,
        choices: { subclassId: 'subclass.fighter.champion' },
      }).reasons,
    ).toEqual([]);
    const early = new Session(asFighter(1));
    expect(
      early.preview(levelUp, {
        classId: 'class.fighter',
        roll: 6,
        choices: { subclassId: 'subclass.fighter.champion' },
      }).reasons,
    ).toEqual(['Fighter chooses a subclass at level 3']);
    const atThree = new Session(asFighter(2));
    atThree.run(levelUp, {
      classId: 'class.fighter',
      roll: 6,
      choices: { subclassId: 'subclass.fighter.champion' },
    });
    expect(atThree.state.build.classes[0]?.subclassId).toBe('subclass.fighter.champion');
    expect(
      atThree.preview(levelUp, {
        classId: 'class.fighter',
        roll: 6,
        choices: { subclassId: 'subclass.fighter.champion' },
      }).reasons,
    ).toEqual(['Fighter already has a subclass']);
    expect(
      new Session(asBard(3)).preview(levelUp, {
        classId: 'class.bard',
        roll: 5,
        choices: { subclassId: 'subclass.fighter.champion' },
      }).reasons,
    ).toEqual(['The selected subclass does not belong to this class']);
  });

  it('adds expertise only to proficient skills and picked option features once', () => {
    const session = new Session(asBard(2));
    session.run(levelUp, {
      classId: 'class.bard',
      roll: 5,
      choices: { expertise: ['stealth', 'arcana'] },
    });
    expect(session.state.build.proficiencies.expertise).toEqual(['stealth', 'arcana']);
    expect(
      new Session(asBard(2)).preview(levelUp, {
        classId: 'class.bard',
        roll: 5,
        choices: { expertise: ['history'] },
      }).reasons,
    ).toEqual(['Expertise needs a proficiency first: history']);
    const fighter = new Session(asFighter(1));
    fighter.run(levelUp, {
      classId: 'class.fighter',
      roll: 6,
      choices: { features: ['feature.fighter.fighting-style-dueling'] },
    });
    expect(fighter.state.build.featureIds).toEqual(['feature.fighter.fighting-style-dueling']);
    expect(
      fighter.preview(levelUp, {
        classId: 'class.fighter',
        roll: 6,
        choices: { features: ['feature.fighter.fighting-style-dueling'] },
      }).reasons,
    ).toEqual(['You already have Fighting Style: Dueling']);
  });
});

describe('levelUp spells', () => {
  const spellIds = (classId: string, level: number) =>
    [...registry.entries.values()]
      .filter((e) => e.kind === 'spell' && e.level === level && e.classes.includes(classId))
      .map((e) => e.id);
  const bard = (level: number, cantrips: number, spells: number) => {
    const state = atLevel(level);
    state.build.spells = [
      {
        classId: 'class.bard',
        known: [
          ...spellIds('class.bard', 0).slice(0, cantrips),
          ...spellIds('class.bard', 1).slice(0, spells),
        ],
      },
    ];
    return state;
  };

  it('adds the new cantrip and spell a known caster gains, and Undo restores them', () => {
    const session = new Session(bard(3, 2, 6));
    const before = structuredClone(session.state);
    const cantrip = spellIds('class.bard', 0)[2]!;
    const spell = spellIds('class.bard', 1)[6]!;
    session.run(levelUp, { classId: 'class.bard', roll: 5, spells: { add: [cantrip, spell] } });
    expect(session.state.build.spells[0]!.known).toEqual(expect.arrayContaining([cantrip, spell]));
    expect(session.state.build.spells[0]!.known).toHaveLength(10);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('blocks more picks than the class table allows, duplicates and unknown spells', () => {
    const session = new Session(bard(3, 2, 6));
    const [c1, c2] = spellIds('class.bard', 0).slice(2, 4) as [string, string];
    const [s1, s2] = spellIds('class.bard', 1).slice(6, 8) as [string, string];
    const reasons = (spells: object) =>
      session.preview(levelUp, { classId: 'class.bard', roll: 5, spells }).reasons;
    expect(reasons({ add: [c1, c2] })).toEqual(['Bard learns 1 more cantrip(s) at this level']);
    expect(reasons({ add: [s1, s2] })).toEqual(['Bard learns 1 more spell(s) at this level']);
    expect(reasons({ add: [s1, s1] })).toEqual(['The same spell is picked twice']);
    expect(reasons({ add: [spellIds('class.bard', 1)[0]!] })).toEqual([
      `${registry.entries.get(spellIds('class.bard', 1)[0]!)!.name} is already known`,
    ]);
    expect(
      reasons({
        add: [spellIds('class.wizard', 1).find((id) => !spellIds('class.bard', 1).includes(id))!],
      })[0],
    ).toMatch(/is not available to Bard/);
  });

  it('lets a known caster swap one leveled spell, not a cantrip', () => {
    const session = new Session(bard(3, 2, 6));
    const [out, , , , , , replacement] = spellIds('class.bard', 1) as string[];
    session.run(levelUp, {
      classId: 'class.bard',
      roll: 5,
      spells: { swap: { remove: out!, add: replacement! } },
    });
    const known = session.state.build.spells[0]!.known;
    expect(known).toContain(replacement);
    expect(known).not.toContain(out);
    const cantrip = spellIds('class.bard', 0)[0]!;
    expect(
      new Session(bard(3, 2, 6)).preview(levelUp, {
        classId: 'class.bard',
        roll: 5,
        spells: { swap: { remove: cantrip, add: replacement! } },
      }).reasons,
    ).toEqual(['Swap out a leveled spell you know']);
  });

  it('gives a new Wizard a six-spell spellbook, no more', () => {
    const state = structuredClone(freshState);
    state.campaign.optionalRules = { ...state.campaign.optionalRules, multiclassing: true };
    state.build.abilityScores.base.INT = 14;
    const session = new Session(state);
    const six = spellIds('class.wizard', 1).slice(0, 6);
    const cantrips = spellIds('class.wizard', 0).slice(0, 3);
    const seven = spellIds('class.wizard', 1).slice(0, 7);
    expect(
      session.preview(levelUp, { classId: 'class.wizard', roll: 4, spells: { add: seven } })
        .reasons,
    ).toEqual(['Wizard learns 6 more spell(s) at this level']);
    session.run(levelUp, {
      classId: 'class.wizard',
      roll: 4,
      spells: { add: [...cantrips, ...six] },
    });
    const row = session.state.build.spells.find((r) => r.classId === 'class.wizard');
    expect(row!.known).toHaveLength(9);
  });

  it('adds two spellbook spells per Wizard level', () => {
    const state = structuredClone(freshState);
    state.build.classes = [{ classId: 'class.wizard', level: 1 }];
    state.build.hpEntries = [
      { level: 1, classId: 'class.wizard', value: 6, method: 'max', floor: 'none' },
    ];
    state.build.abilityScores.base.INT = 16;
    state.build.abilityScores.bonuses = [];
    state.build.spells = [
      { classId: 'class.wizard', known: spellIds('class.wizard', 1).slice(0, 6) },
    ];
    const session = new Session(state);
    const more = spellIds('class.wizard', 1).slice(6, 9);
    expect(
      session.preview(levelUp, { classId: 'class.wizard', roll: 4, spells: { add: more } }).reasons,
    ).toEqual(['Wizard learns 2 more spell(s) at this level']);
    session.run(levelUp, { classId: 'class.wizard', roll: 4, spells: { add: more.slice(0, 2) } });
    expect(session.state.build.spells[0]!.known).toHaveLength(8);
  });
});
