import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { computeSheet, type CharacterState } from '../calc/sheet';
import { spellSelectionDetails } from '../calc/spell-selections';
import { spellSlots } from '../calc/slots';
import { levelUp } from './level';
import { freshState, Session } from './test-utils';
import { pendingChoices } from '../calc/pending-choices';
import { resolveChoices } from './resolve-choices';
import {
  COMMON_REPLICA_PREFIX,
  INFUSION_PREFIX,
  infusionLimit,
  infusionOptionIds,
  isReplicateInfusion,
} from '../calc/infusions';

function artificer(level: number, subclassId?: string): CharacterState {
  const state = structuredClone(freshState);
  state.campaign = { ...state.campaign, sources: ['PHB', 'TCE'], hpMethod: 'average' };
  state.build.classes = [
    { classId: 'class.artificer', level, ...(subclassId ? { subclassId } : {}) },
  ];
  state.build.hpEntries = Array.from({ length: level }, (_, index) => ({
    level: index + 1,
    classId: 'class.artificer',
    value: index === 0 ? 8 : 5,
    method: index === 0 ? ('max' as const) : ('average' as const),
    floor: 'none' as const,
  }));
  state.build.featureIds = [];
  state.build.abilityScores.bonuses = [];
  state.build.abilityScores.base = { STR: 10, DEX: 12, CON: 14, INT: 16, WIS: 10, CHA: 8 };
  return state;
}

describe('Artificer', () => {
  it('offers only level-eligible infusions and keeps the known limit separate from active items', () => {
    const state = artificer(2);
    const row = pendingChoices(state, registry).find(
      (item) => item.prefix === 'feature.artificer.infusion-',
    )!;
    expect(row.count).toBe(4);
    expect(row.optionIds).toContain('feature.artificer.infusion-enhanced-weapon');
    expect(row.optionIds).not.toContain('feature.artificer.infusion-radiant-weapon');
    expect(row.optionIds).not.toContain('feature.artificer.infusion-arcane-propulsion-armor');
    const session = new Session(state);
    expect(
      session.try(
        resolveChoices,
        {
          classId: 'class.artificer',
          choices: { features: ['feature.artificer.infusion-radiant-weapon'] },
        },
        true,
      ).result,
    ).toBe('blocked');
  });
  it('blocks too many known infusions through level-up as well as To do', () => {
    const session = new Session(artificer(2));
    const choices = {
      features: [
        'enhanced-weapon',
        'enhanced-defense',
        'enhanced-arcane-focus',
        'mind-sharpener',
        'returning-weapon',
      ].map((name) => `feature.artificer.infusion-${name}`),
    };
    expect(session.try(levelUp, { classId: 'class.artificer', choices }, true).result).toBe(
      'blocked',
    );
  });
  it.each([
    [1, 0],
    [2, 4],
    [6, 6],
    [10, 8],
    [14, 10],
    [18, 12],
  ])('offers the correct known count at Artificer %s', (level, count) => {
    const row = pendingChoices(artificer(level!), registry).find(
      (item) => item.prefix === 'feature.artificer.infusion-',
    );
    expect(row?.count ?? 0).toBe(count);
  });

  it('offers all standard Tasha infusions by Artificer level', () => {
    const state = artificer(2);
    const standardNames = [
      [
        'armor-of-magical-strength',
        'enhanced-arcane-focus',
        'enhanced-defense',
        'enhanced-weapon',
        'homunculus-servant',
        'mind-sharpener',
        'repeating-shot',
        'returning-weapon',
      ],
      [
        'boots-of-the-winding-path',
        'radiant-weapon',
        'repulsion-shield',
        'resistant-armor',
        'spell-refueling-ring',
      ],
      ['helm-of-awareness'],
      ['arcane-propulsion-armor'],
    ];
    for (const [index, level] of [2, 6, 10, 14].entries()) {
      const choices = infusionOptionIds(registry, state.campaign, level);
      expect(choices.filter((id) => !isReplicateInfusion(id)).sort()).toEqual(
        standardNames
          .slice(0, index + 1)
          .flat()
          .map((suffix) => INFUSION_PREFIX + suffix)
          .sort(),
      );
    }
    expect([1, 2, 6, 10, 14, 18].map((level) => infusionLimit(artificer(level).build))).toEqual([
      0, 2, 3, 4, 5, 6,
    ]);
  });

  it('offers enabled common catalog recipes at level 2, excluding potions, scrolls and uncommon items', () => {
    const { campaign } = artificer(2);
    const clockwork = COMMON_REPLICA_PREFIX + 'clockwork-amulet';
    const tattoo = COMMON_REPLICA_PREFIX + 'spellwrought-tattoo-level-1';
    const current = infusionOptionIds(registry, campaign, 2);
    expect(current).toContain(tattoo);
    expect(current).not.toContain(clockwork);
    expect(
      infusionOptionIds(registry, { ...campaign, sources: ['PHB', 'TCE', 'XGE'] }, 2),
    ).toContain(clockwork);
    expect(
      infusionOptionIds(registry, { ...campaign, sourceParts: { TCE: ['options'] } }, 2),
    ).not.toContain(tattoo);
    for (const suffix of [
      'potion-of-healing-common',
      'spell-scroll-cantrip',
      'spellwrought-tattoo-level-2',
    ])
      expect(registry.entries.has(COMMON_REPLICA_PREFIX + suffix)).toBe(false);
  });

  it('fills remaining shared picks from either list and cannot learn a duplicate', () => {
    const state = artificer(2);
    state.build.featureIds = [
      'enhanced-weapon',
      'enhanced-defense',
      'replicate-magic-item-bag-of-holding',
    ].map((name) => INFUSION_PREFIX + name);
    const session = new Session(state);
    const learn = (...names: string[]) => ({
      classId: 'class.artificer',
      choices: { features: names.map((name) => INFUSION_PREFIX + name) },
    });
    const row = pendingChoices(state, registry).find(({ prefix }) => prefix === INFUSION_PREFIX);
    expect(row?.count).toBe(1);
    expect(session.preview(resolveChoices, learn('enhanced-weapon')).result).toBe('blocked');
    expect(
      session.preview(
        resolveChoices,
        learn('returning-weapon', 'replicate-magic-item-sending-stones'),
      ).result,
    ).toBe('blocked');
    session.run(resolveChoices, learn('replicate-magic-item-sending-stones'));
    expect(session.state.build.featureIds).toHaveLength(4);
  });

  it('replaces one known infusion at an Artificer level and ends its application with Undo', () => {
    const state = artificer(5, 'subclass.artificer.artillerist');
    const remove = INFUSION_PREFIX + 'repeating-shot';
    const add = INFUSION_PREFIX + 'replicate-magic-item-boots-of-elvenkind';
    state.build.featureIds = [
      remove,
      ...['enhanced-weapon', 'mind-sharpener', 'returning-weapon'].map(
        (name) => INFUSION_PREFIX + name,
      ),
    ];
    state.build.items = [{ instanceId: 'bow', itemId: 'item.crossbow-light' }];
    state.live.items = { bow: { qty: 1, equipped: true, attuned: true } };
    state.live.infusions = [{ instanceId: 'bow', featureId: remove }];
    const session = new Session(state);
    const before = structuredClone(state);
    const classId = 'class.artificer';
    const infusionSwap = { remove, add };
    expect(
      session.preview(levelUp, {
        classId,
        infusionSwap: { remove, add: INFUSION_PREFIX + 'helm-of-awareness' },
      }).result,
    ).toBe('blocked');
    expect(
      session.preview(levelUp, {
        classId,
        infusionSwap: { remove, add: INFUSION_PREFIX + 'enhanced-weapon' },
      }).result,
    ).toBe('blocked');
    expect(
      session.preview(levelUp, {
        classId,
        infusionSwap: { remove, add: 'feature.artificer.infuse-item' },
      }).result,
    ).toBe('blocked');
    expect(
      session.preview(resolveChoices, { classId, choices: { infusionSwap } } as never).result,
    ).toBe('blocked');
    const log = session.run(levelUp, {
      classId,
      infusionSwap,
      choices: {
        features: [INFUSION_PREFIX + 'radiant-weapon', INFUSION_PREFIX + 'spell-refueling-ring'],
      },
    });
    expect(log).toContain('Replace Infusion: Repeating Shot');
    expect(session.state.build.featureIds).toHaveLength(6);
    expect(session.state.build.featureIds).toContain(add);
    expect(session.state.build.featureIds).not.toContain(remove);
    expect(session.state.live.infusions).toEqual([]);
    expect(session.state.live.items.bow?.attuned).toBe(false);
    session.undo();
    expect(session.state).toEqual(before);
  });
  it('uses Artificer levels for eligibility rather than the multiclass total', () => {
    const state = artificer(2);
    state.build.classes.push({ classId: 'class.wizard', level: 4 });
    state.build.hpEntries.push(
      ...Array.from({ length: 4 }, (_, i) => ({
        level: i + 3,
        classId: 'class.wizard',
        method: 'average' as const,
        value: 4,
        floor: 'none' as const,
      })),
    );
    const row = pendingChoices(state, registry).find(
      (item) => item.prefix === 'feature.artificer.infusion-',
    )!;
    expect(row.count).toBe(4);
    expect(row.optionIds).not.toContain('feature.artificer.infusion-radiant-weapon');
  });
  it('uses the current class level when settling an earlier improvement and infusion together', () => {
    const session = new Session(artificer(6));
    expect(
      session.try(resolveChoices, {
        classId: 'class.artificer',
        choices: {
          asi: { kind: 'abilities', increases: [{ ability: 'STR', value: 2 }] },
          features: ['feature.artificer.infusion-radiant-weapon'],
        },
      }).result,
    ).toBe('ok');
  });
  it('rounds half-caster slots up and casts from level 1', () => {
    expect(spellSlots([{ progression: 'artificer', level: 1 }]).max.slice(1, 3)).toEqual([2, 0]);
    expect(spellSlots([{ progression: 'artificer', level: 5 }]).max.slice(1, 4)).toEqual([4, 2, 0]);
    // Multiclass table also rounds up: Artificer 3 + Wizard 2 = caster level 4.
    expect(
      spellSlots([
        { progression: 'artificer', level: 3 },
        { progression: 'full', level: 2 },
      ]).max.slice(1, 3),
    ).toEqual([4, 3]);
  });

  it('prepares INT mod + half level, with the artificer spell list', () => {
    const state = artificer(5);
    const sheet = computeSheet(state, registry);
    const stats = sheet.spellcasting.find((entry) => entry.classId === 'class.artificer');
    expect(stats?.preparedLimit).toBe(5); // INT +3, half of 5 rounded down is 2
    expect(stats?.cantripsKnown).toBe(2);
    const details = spellSelectionDetails({ ...state, sheet, registry }, 'class.artificer');
    expect(details.mode).toBe('prepared');
    expect(details.candidates.prepared).toContain('spell.cure-wounds');
    expect(details.candidates.prepared).not.toContain('spell.fireball');
    expect(details.candidates.cantrips).toContain('spell.guidance');
  });

  it('grants class and subclass features by level', () => {
    const names = (state: CharacterState) =>
      computeSheet(state, registry).features.map(({ def }) => def.name);
    expect(names(artificer(2))).toEqual(
      expect.arrayContaining(['Magical Tinkering', 'Spellcasting', 'Infuse Item']),
    );
    expect(names(artificer(2))).not.toContain('Flash of Genius');
    const smith = names(artificer(9, 'subclass.artificer.battle-smith'));
    expect(smith).toEqual(
      expect.arrayContaining(['Flash of Genius', 'Steel Defender', 'Arcane Jolt', 'Extra Attack']),
    );
  });

  it('offers Artificer subclasses and infusions through the level-up choices', () => {
    const session = new Session(artificer(2));
    session.run(levelUp, {
      classId: 'class.artificer',
      choices: {
        subclassId: 'subclass.artificer.artillerist',
        features: ['feature.artificer.infusion-enhanced-weapon'],
      },
    });
    expect(session.state.build.classes[0]?.subclassId).toBe('subclass.artificer.artillerist');
    expect(session.state.build.featureIds).toContain('feature.artificer.infusion-enhanced-weapon');
  });
});
