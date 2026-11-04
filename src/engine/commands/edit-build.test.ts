import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { computeSheet, type CharacterState } from '../calc/sheet';
import { createCharacter } from '../creation';
import { buildRegistry, type Registry } from '../registry';
import { CharacterBuildSchema, type RefEntry } from '../schema';
import {
  editBuild,
  previewBuildEdit,
  type EditBuildChanges,
  type EditBuildPayload,
} from './edit-build';
import { runCommand, undo } from './runner';
import { seedState } from './test-utils';

const options = { eventId: 'edit-build', realTime: '2026-11-04T15:00:00.000Z' };
const input = (changes: EditBuildChanges, state = seedState): EditBuildPayload => ({
  changes,
  expected: state.build,
  ...(changes.abilityBases === undefined
    ? {}
    : { expectedAbilityMethod: state.campaign.abilityMethod }),
});

describe('editBuild: ability bases', () => {
  const revised = { STR: 13, DEX: 16, CON: 14, INT: 15, WIS: 10, CHA: 16 };
  const standard = { STR: 8, DEX: 15, CON: 14, INT: 10, WIS: 12, CHA: 13 };
  const purchase = { STR: 15, DEX: 15, CON: 15, INT: 8, WIS: 8, CHA: 8 };

  it('recomputes modifiers, saves, casting, feature uses and CON HP while preserving every live value and grant', () => {
    const state = structuredClone(seedState);
    state.live.concentration = {
      spellId: 'spell.faerie-fire',
      slotLevel: 1,
      endsAt: state.live.clock.seconds + 60,
    };
    state.build.choices.future = { retained: true };
    state.build.overrides.push({ path: '/future/value', value: { custom: 1 }, note: 'Keep this' });
    state.build.abilityScores.bonuses.push({ source: 'DM medal', ability: 'STR', value: 1 });
    const before = structuredClone(state);
    const result = success(input({ abilityBases: revised }, state), state);
    const sheet = computeSheet(result.next, registry);
    expect(result.next.build).toEqual({
      ...before.build,
      abilityScores: { ...before.build.abilityScores, base: revised },
    });
    expect(result.next.live).toEqual(before.live);
    expect(sheet.abilities.DEX.mod).toBe(3);
    expect(sheet.saves.DEX.value).toBe(5);
    expect(sheet.initiative.value).toBe(4);
    expect(sheet.spellcasting[0]?.saveDc.value).toBe(14);
    expect(sheet.spellcasting[0]?.attack.value).toBe(6);
    expect(
      sheet.features.find(({ def }) => def.id === 'feature.bard.bardic-inspiration')?.uses?.max,
    ).toBe(4);
    expect(sheet.maxHp.value).toBe(22);
    expect(result.event.text).toContain('ability scores');
    expect(result.event.text).not.toContain('racial bonuses');
    const undone = undo(result.next, [result.event], { ...options, eventId: 'undo-bases' });
    expect(undone.result).toBe('ok');
    if (undone.result !== 'ok') throw new Error('Undo failed');
    expect(undone.next).toEqual(before);
    expect(state).toEqual(before);
  });

  it('saves combined race and base choices atomically, using the new race grants exactly once', () => {
    const state = structuredClone(seedState);
    const before = structuredClone(state);
    const bases = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
    const payload = input({ raceId: 'race.human', abilityBases: bases }, state);
    const preview = previewBuildEdit(
      { ...state, registry, sheet: computeSheet(state, registry) },
      payload,
    );
    expect(preview.checks.some(({ level }) => level === 'block')).toBe(false);
    expect(preview.build?.abilityScores).toEqual({
      base: bases,
      bonuses: registry
        .get('race', 'race.human')
        .abilityBonuses.map((bonus) => ({ source: 'race.human', ...bonus })),
    });
    expect(state).toEqual(before);
    const result = success(payload, state);
    expect(result.next.build).toEqual(preview.build);
    expect(computeSheet(result.next, registry).abilities.CHA.score.value).toBe(11);
    expect(result.next.live).toEqual(before.live);
    const undone = undo(result.next, [result.event], {
      ...options,
      eventId: 'undo-combined-bases',
    });
    expect(undone.result).toBe('ok');
    if (undone.result !== 'ok') throw new Error('Undo failed');
    expect(undone.next).toEqual(before);
  });

  it('accepts standard assignments before racial bonuses and keeps legacy scores until explicitly edited', () => {
    const state: CharacterState = {
      ...seedState,
      campaign: { ...seedState.campaign, abilityMethod: 'standard-array' },
    };
    expect(
      success(input({ name: 'Retained rolled character' }, state), state).next.build.abilityScores,
    ).toEqual(state.build.abilityScores);
    const result = success(input({ abilityBases: standard }, state), state);
    expect(result.next.build.abilityScores.base).toEqual(standard);
    expect(result.next.build.abilityScores.bonuses).toEqual(state.build.abilityScores.bonuses);
    expect(computeSheet(result.next, registry).abilities.CHA.score.value).toBe(15);
    expect(run(input({ abilityBases: { ...standard, STR: 13 } }, state), state)).toMatchObject({
      result: 'blocked',
      reasons: ['Assign each standard-array score once: 15, 14, 13, 12, 10, 8'],
    });
  });

  it('checks the full point-buy budget, including nonlinear costs, without repricing recorded bonuses', () => {
    const state: CharacterState = {
      ...seedState,
      campaign: { ...seedState.campaign, abilityMethod: 'point-buy' },
    };
    expect(
      success(input({ abilityBases: purchase }, state), state).next.build.abilityScores.base,
    ).toEqual(purchase);
    const unspent = { ...purchase, STR: 14 };
    expect(
      success(input({ abilityBases: unspent }, state), state).next.build.abilityScores.base,
    ).toEqual(unspent);
    for (const bases of [
      { ...purchase, INT: 9 },
      { ...purchase, STR: 16 },
      { ...purchase, STR: 7 },
    ])
      expect(run(input({ abilityBases: bases }, state), state).result).toBe('blocked');
    expect(
      success(input({ name: 'Keep old scores' }, state), state).next.build.abilityScores,
    ).toEqual(state.build.abilityScores);
  });

  it('requires the reviewed method and refuses a stale full base-score assignment', () => {
    const state = structuredClone(seedState);
    const payload = input({ abilityBases: revised }, state);
    const baseline = structuredClone(payload);
    delete payload.expectedAbilityMethod;
    expect(run(payload, state).result).toBe('blocked');
    expect(run({ ...baseline, expectedAbilityMethod: 'point-buy' }, state).result).toBe('blocked');
    const changedMethod = {
      ...state,
      campaign: { ...state.campaign, abilityMethod: 'standard-array' as const },
    };
    expect(run({ ...baseline, changes: { abilityBases: standard } }, changedMethod)).toMatchObject({
      result: 'blocked',
      reasons: expect.arrayContaining([expect.stringMatching('campaign ability method changed')]),
    });
    state.build.abilityScores.base.DEX += 1;
    expect(run(baseline, state)).toMatchObject({
      result: 'blocked',
      reasons: expect.arrayContaining([expect.stringMatching('Base ability scores changed')]),
    });
  });

  it('preserves newer unrelated build, bonus, override and live changes rather than applying the form snapshot', () => {
    const state = structuredClone(seedState);
    const payload = structuredClone(input({ abilityBases: revised }, state));
    state.build.name = 'A newer name';
    state.build.abilityScores.bonuses.push({ source: 'New boon', ability: 'STR', value: 1 });
    state.build.overrides.push({ path: '/abilities/CHA/score', value: 30, note: 'A newer ruling' });
    state.live.hp = 7;
    state.live.hitDiceSpent = { d8: 2 };
    const result = success(payload, state);
    expect(result.next.build.name).toBe('A newer name');
    expect(result.next.build.abilityScores.base).toEqual(revised);
    expect(result.next.build.abilityScores.bonuses).toEqual(state.build.abilityScores.bonuses);
    expect(result.next.build.overrides).toEqual(state.build.overrides);
    expect(computeSheet(result.next, registry).abilities.CHA.score.value).toBe(30);
    expect(result.next.live).toEqual(state.live);
  });

  it('retains current HP above a new CON-based maximum and reports the need for review', () => {
    const state = structuredClone(seedState);
    state.live.hp = 19;
    const result = success(
      input({ abilityBases: { ...state.build.abilityScores.base, CON: 3 } }, state),
      state,
    );
    expect(computeSheet(result.next, registry).maxHp.value).toBe(7);
    expect(result.reasons.join(' ')).toContain('Current HP exceeds the new maximum');
    expect(result.next.live).toEqual(state.live);
    expect(result.next.build.hpEntries).toEqual(state.build.hpEntries);
  });

  it('blocks a valid base entry that would overflow dependent arithmetic', () => {
    const state = structuredClone(seedState);
    state.build.abilityScores.base.STR = 3;
    state.build.abilityScores.bonuses.push({
      source: 'Large retained boon',
      ability: 'STR',
      value: Math.floor(Number.MAX_SAFE_INTEGER / 15) - 3,
    });
    expect(Number.isSafeInteger(computeSheet(state, registry).carryingCapacity)).toBe(true);
    expect(
      run(input({ abilityBases: { ...state.build.abilityScores.base, STR: 4 } }, state), state),
    ).toMatchObject({
      result: 'blocked',
      reasons: ['These choices produce an unsafe calculated value'],
    });
  });

  it.each([2, 19, 10.5, NaN, Infinity, '12', null])(
    'blocks malformed base %s even in forced Manual mode',
    (value) => {
      const before = structuredClone(seedState);
      const payload = {
        ...input({}),
        changes: { abilityBases: { ...seedState.build.abilityScores.base, STR: value } },
        expectedAbilityMethod: 'rolled',
      };
      for (const automation of ['assisted', 'manual'] as const)
        expect(
          runCommand(editBuild, seedState, payload as EditBuildPayload, registry, {
            ...options,
            automation,
            force: true,
          }).result,
        ).toBe('blocked');
      expect(seedState).toEqual(before);
    },
  );

  it('blocks partial, unknown-key and no-op base assignments without changing state', () => {
    const partial: Partial<typeof seedState.build.abilityScores.base> = {
      ...seedState.build.abilityScores.base,
    };
    delete partial.CHA;
    for (const bases of [
      partial,
      { ...seedState.build.abilityScores.base, LUCK: 12 },
      seedState.build.abilityScores.base,
    ]) {
      const payload = {
        ...input({}),
        changes: { abilityBases: bases },
        expectedAbilityMethod: 'rolled',
      } as EditBuildPayload;
      expect(run(payload).result).toBe('blocked');
    }
  });
});

function run(payload: EditBuildPayload, state = seedState, refs: Registry = registry) {
  return runCommand(editBuild, state, payload, refs, options);
}

function success(payload: EditBuildPayload, state = seedState, refs: Registry = registry) {
  const result = run(payload, state, refs);
  if (result.result !== 'ok') throw new Error(result.reasons.join('; '));
  return result;
}

function withReferences(...entries: RefEntry[]) {
  return buildRegistry(
    [
      [...registry.entries.values()].filter((entry) => !entries.some(({ id }) => entry.id === id)),
      entries,
    ],
    [],
    [],
  );
}

describe('editBuild', () => {
  it('saves selected build choices atomically, logs changed fields and exactly undoes without touching play state', () => {
    const before = structuredClone(seedState);
    const proficiencies = {
      ...seedState.build.proficiencies,
      saves: ['STR', 'DEX', 'CHA'] as const,
      languages: ['Common', 'Elvish', 'Celestial', 'Draconic'],
    };
    const result = success(
      input({
        name: ' Veyne ',
        alignment: null,
        portrait: null,
        subclasses: [{ classId: 'class.bard', subclassId: null }],
        proficiencies: { ...proficiencies, saves: [...proficiencies.saves] },
      }),
    );
    expect(result.next.live).toEqual(before.live);
    expect(result.next.build).toEqual({
      ...before.build,
      name: 'Veyne',
      alignment: undefined,
      portrait: undefined,
      classes: [{ classId: 'class.bard', level: 3 }],
      proficiencies,
    });
    expect(result.next.build).not.toHaveProperty('portrait');
    expect(result.next.build).not.toHaveProperty('alignment');
    expect(result.next.build.hpEntries).toEqual(before.build.hpEntries);
    expect(result.next.build.abilityScores).toEqual(before.build.abilityScores);
    expect(result.next.build.spells).toEqual(before.build.spells);
    expect(result.event.text).toContain('Edit character: Veyne');
    expect(result.event.patches.every(({ path }) => path[0] === 'build' && path.length > 1)).toBe(
      true,
    );
    const restored = undo(result.next, [result.event], { ...options, eventId: 'undo-edit' });
    expect(restored.result).toBe('ok');
    if (restored.result !== 'ok') throw new Error('Undo failed');
    expect(restored.next).toEqual(before);
    expect(seedState).toEqual(before);
  });

  it('computes complete subrace bonuses and retains unrelated grants, base scores and locked HP entries', () => {
    const state = structuredClone(seedState);
    state.build.abilityScores.bonuses.push({ source: 'DM reward', ability: 'CON', value: 2 });
    const before = structuredClone(state);
    const result = success(
      input(
        { raceId: 'race.elf', subraceId: 'race.high-elf', backgroundId: 'background.acolyte' },
        state,
      ),
      state,
    );
    expect(result.next.build.abilityScores).toEqual({
      base: before.build.abilityScores.base,
      bonuses: [
        { source: 'DM reward', ability: 'CON', value: 2 },
        { source: 'race.high-elf', ability: 'DEX', value: 2 },
        { source: 'race.high-elf', ability: 'INT', value: 1 },
      ],
    });
    expect(result.next.build.proficiencies).toEqual(before.build.proficiencies);
    expect(result.next.build.hpEntries).toEqual(before.build.hpEntries);
    expect(result.next.live).toEqual(before.live);
    const sheet = computeSheet(result.next, registry);
    expect(sheet.abilities.DEX.score.value).toBe(16);
    expect(sheet.abilities.INT.score.value).toBe(13);
    expect(sheet.abilities.CHA.score.value).toBe(18);
    expect(sheet.features.some(({ def }) => def.id === 'feature.false-identity')).toBe(false);
    expect(result.reasons.join(' ')).toContain('Review proficiencies');
    expect(state).toEqual(before);
  });

  it('takes racial bonus abilities as choices, computes their amounts and preserves ambiguous legacy rows', () => {
    const state = structuredClone(seedState);
    state.build.abilityScores.bonuses.push({ source: 'race.half-elf', ability: 'STR', value: 99 });
    const result = success({ ...input({}, state), racialChoices: ['INT', 'WIS'] }, state);
    expect(result.next.build.abilityScores.bonuses).toEqual([
      { source: 'race.half-elf', ability: 'STR', value: 99 },
      { source: 'race.half-elf', ability: 'CHA', value: 2 },
      { source: 'race.half-elf', ability: 'INT', value: 1 },
      { source: 'race.half-elf', ability: 'WIS', value: 1 },
    ]);
    expect(result.reasons.join(' ')).toContain('Unrecognized racial bonus entries were retained');
  });

  it('keeps legacy bonuses, opaque choices and unknown overrides unchanged for an identity edit', () => {
    const state = structuredClone(seedState);
    state.build.abilityScores.bonuses = [
      { source: 'Legacy character sheet', ability: 'CHA', value: 2 },
      { source: 'Legacy character sheet', ability: 'CON', value: 1 },
    ];
    state.build.choices = { futureChoice: { nested: ['retained'] } };
    state.build.overrides = [{ path: 'future-path', value: { custom: true }, note: 'Keep this' }];
    const result = success(input({ name: 'Legacy name' }, state), state);
    expect(result.next.build).toEqual({ ...state.build, name: 'Legacy name' });
    expect(result.next.live).toEqual(state.live);
  });

  it('blocks an affected stale field but keeps unrelated changes made after opening Edit', () => {
    const baseline = structuredClone(seedState);
    const latest = structuredClone(seedState);
    latest.build.name = 'Latest name';
    latest.build.choices.futureChoice = { retained: true };
    const rejected = run(input({ name: 'Stale replacement' }, baseline), latest);
    expect(rejected.result).toBe('blocked');
    expect(rejected.reasons.join(' ')).toContain('changed since editing began');
    const saved = success(input({ alignment: 'Lawful Good' }, baseline), latest);
    expect(saved.next.build.name).toBe('Latest name');
    expect(saved.next.build.choices).toEqual(latest.build.choices);
    expect(saved.next.build.alignment).toBe('Lawful Good');
  });

  it('blocks stale racial bonus and class edits without discarding their newer choices', () => {
    const latest = structuredClone(seedState);
    latest.build.abilityScores.bonuses.push({ source: 'New reward', ability: 'STR', value: 1 });
    expect(run({ ...input({}), racialChoices: ['INT', 'WIS'] }, latest).result).toBe('blocked');
    latest.build.classes[0]!.level = 4;
    latest.build.hpEntries.push({ level: 4, classId: 'class.bard', value: 5, method: 'average' });
    expect(
      run(input({ subclasses: [{ classId: 'class.bard', subclassId: null }] }), latest).result,
    ).toBe('blocked');
  });

  it('validates changed references and source availability while retaining existing disabled-source choices', () => {
    const bardSubclass = registry.get('subclass', 'subclass.bard.lore');
    const restricted = withReferences({ ...bardSubclass, source: 'XGE' });
    const state: CharacterState = {
      ...seedState,
      campaign: { ...seedState.campaign, sources: ['PHB'] },
    };
    expect(
      success(input({ name: 'Retained Lore' }, state), state, restricted).next.build.classes,
    ).toEqual(state.build.classes);
    const withoutSubclass = structuredClone(state);
    delete withoutSubclass.build.classes[0]!.subclassId;
    expect(
      run(
        input(
          { subclasses: [{ classId: 'class.bard', subclassId: bardSubclass.id }] },
          withoutSubclass,
        ),
        withoutSubclass,
        restricted,
      ).result,
    ).toBe('blocked');
    expect(run(input({ raceId: 'race.missing' })).result).toBe('blocked');
  });

  it.each([
    { raceId: 'race.dwarf', subraceId: 'race.high-elf' },
    { subclasses: [{ classId: 'class.bard', subclassId: 'subclass.fighter.champion' }] },
    { subclasses: [{ classId: 'class.fighter', subclassId: 'subclass.fighter.champion' }] },
  ] satisfies EditBuildChanges[])('blocks incompatible race or class choice %j', (changes) => {
    expect(run(input(changes)).result).toBe('blocked');
  });

  it.each(
    ([[], ['CHA', 'STR'], ['STR', 'STR'], ['STR', 'INT', 'WIS']] as const).map((choices) => ({
      choices,
    })),
  )('blocks invalid racial selections $choices', ({ choices }) => {
    expect(run({ ...input({}), racialChoices: [...choices] }).result).toBe('blocked');
  });

  it('requires explicit Expertise cleanup when removing its proficiency and rejects wrong item kinds', () => {
    const proficiencies = structuredClone(seedState.build.proficiencies);
    proficiencies.skills = proficiencies.skills.filter((skill) => skill !== 'deception');
    expect(run(input({ proficiencies })).result).toBe('blocked');
    proficiencies.expertise = proficiencies.expertise.filter((skill) => skill !== 'deception');
    expect(success(input({ proficiencies })).next.build.proficiencies).toEqual(proficiencies);
    expect(
      run(input({ proficiencies: { ...seedState.build.proficiencies, tools: ['item.rapier'] } }))
        .result,
    ).toBe('blocked');
    expect(
      run(
        input({ proficiencies: { ...seedState.build.proficiencies, expertise: ['item.rapier'] } }),
      ).result,
    ).toBe('blocked');
  });

  it('leaves legacy duplicate proficiencies unchanged when editing a different proficiency field', () => {
    const state = structuredClone(seedState);
    state.build.proficiencies.tools.push(state.build.proficiencies.tools[0]!);
    const proficiencies = { ...state.build.proficiencies, languages: ['Common'] };
    const result = success(input({ proficiencies }, state), state);
    expect(result.next.build.proficiencies.tools).toEqual(state.build.proficiencies.tools);
  });

  it('edits XP only for XP campaigns and permits clearing an optional tracked value', () => {
    expect(run(input({ xp: 2700 })).result).toBe('blocked');
    const state: CharacterState = {
      ...seedState,
      campaign: { ...seedState.campaign, leveling: 'xp' },
      build: { ...seedState.build, xp: 900 },
    };
    expect(success(input({ xp: 2700 }, state), state).next.build.xp).toBe(2700);
    expect(success(input({ xp: null }, state), state).next.build).not.toHaveProperty('xp');
    expect(state.build.xp).toBe(900);
  });

  it('supports a non-Fool class and lets the table explicitly override early subclass timing', () => {
    const fighter = createCharacter(
      {
        id: 'friend-fighter',
        name: 'Friend',
        campaign: seedState.campaign,
        raceId: 'race.human',
        classId: 'class.fighter',
        backgroundId: 'background.acolyte',
        level: 1,
        abilityBases: { STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 },
        hpRolls: [],
      },
      registry,
    );
    const state: CharacterState = { campaign: seedState.campaign, ...fighter };
    const payload = input(
      {
        name: 'Aster',
        subclasses: [{ classId: 'class.fighter', subclassId: 'subclass.fighter.champion' }],
      },
      state,
    );
    expect(run(payload, state)).toMatchObject({
      result: 'warn',
      reasons: ['Fighter normally chooses a subclass at level 3'],
    });
    const result = runCommand(editBuild, state, payload, registry, { ...options, force: true });
    expect(result.result).toBe('ok');
    if (result.result !== 'ok') throw new Error('Override failed');
    expect(result.event.override).toBe(true);
    expect(result.next.build.classes).toEqual([
      { classId: 'class.fighter', subclassId: 'subclass.fighter.champion', level: 1 },
    ]);
    expect(result.next.live).toEqual(state.live);
    expect(state.build.classes).toEqual([{ classId: 'class.fighter', level: 1 }]);
    expect(
      runCommand(editBuild, state, payload, registry, { ...options, automation: 'manual' }).result,
    ).toBe('ok');
  });

  it('blocks unsafe computed values introduced by a selected reference', () => {
    const human = registry.get('race', 'race.human');
    const refs = withReferences({
      ...human,
      abilityBonuses: [{ ability: 'STR', value: Number.MAX_SAFE_INTEGER }],
    });
    expect(run(input({ raceId: human.id }), seedState, refs)).toMatchObject({
      result: 'blocked',
      reasons: ['These choices produce an unsafe calculated value'],
    });
  });

  it('reports current HP above the new computed maximum without changing it or spent resources', () => {
    const state = structuredClone(seedState);
    state.live.hp = 19;
    const result = success({ ...input({}, state), racialChoices: ['STR', 'INT'] }, state);
    // Half-Elf CON 12 stays +1 here; force a lower-CON build to make loss cross a modifier boundary.
    const lowCon = structuredClone(state);
    lowCon.build.abilityScores.base.CON = 11;
    const lowered = success({ ...input({}, lowCon), racialChoices: ['STR', 'INT'] }, lowCon);
    expect(lowered.reasons.join(' ')).toContain('Current HP exceeds the new maximum');
    expect(lowered.next.live).toEqual(lowCon.live);
    expect(result.next.live).toEqual(state.live);
  });

  it.each([
    { changes: {}, expected: seedState.build },
    { changes: { name: ' ' }, expected: seedState.build },
    { changes: { classes: [] }, expected: seedState.build },
    { changes: { name: 'Other' }, expected: { ...seedState.build, id: 'another-character' } },
  ])(
    'blocks empty, invalid, structural or wrong-character edits without changing state (%j)',
    (payload) => {
      const before = structuredClone(seedState);
      for (const automation of ['assisted', 'manual'] as const) {
        const result = runCommand(editBuild, seedState, payload as EditBuildPayload, registry, {
          ...options,
          automation,
          force: true,
        });
        expect(result.result).toBe('blocked');
      }
      expect(CharacterBuildSchema.parse(seedState.build)).toEqual(before.build);
      expect(seedState).toEqual(before);
    },
  );
});
