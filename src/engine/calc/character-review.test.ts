import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { freshState } from '../commands/test-utils';
import { verifyCharacter } from './character-review';
import { computeSheet } from './sheet';

describe('Verify character', () => {
  it('accepts the legacy Bard sheet, including Expertise and Jack of All Trades', () => {
    const state = structuredClone(freshState);
    state.build.proficiencies = computeSheet(state, registry).proficiencies;
    delete state.build.proficiencyPicks;
    expect(verifyCharacter(state, registry)).toEqual([]);
  });

  it('finds the five extra skills and language without treating Jack of All Trades as proficiency', () => {
    const state = structuredClone(freshState);
    state.build.proficiencies = computeSheet(state, registry).proficiencies;
    state.build.proficiencyPicks = {
      'feature.extra-language': { languages: ['Dwarvish'] },
      'feature.skill-versatility': { skills: ['athletics', 'history'] },
      'feature.bard.bonus-proficiencies': { skills: ['animal-handling', 'arcana', 'survival'] },
    };
    const before = structuredClone(state);
    const findings = verifyCharacter(state, registry);
    expect(findings.map(({ status, title }) => [status, title])).toEqual([
      ['excess', '15 skill proficiencies recorded · up to 10 from the build'],
      ['excess', '4 languages recorded · up to 3 from the build'],
    ]);
    expect(findings[0]?.detail).toContain('Athletics, History, Animal Handling, Arcana, Survival');
    expect(findings[1]?.detail).toContain('Saved features add Dwarvish');
    expect(computeSheet(state, registry).skills.medicine).toMatchObject({
      value: 2,
      proficiency: 'none',
    });
    expect(state).toEqual(before);

    state.build.proficiencies.skills = [
      'acrobatics',
      'perception',
      'persuasion',
      'deception',
      'sleight-of-hand',
    ];
    state.build.proficiencies.languages = ['Common', 'Elvish'];
    expect(verifyCharacter(state, registry)).toEqual([]);
  });

  it('finds missing choices and identifies an out-of-list spell and excess spent slots', () => {
    const state = structuredClone(freshState);
    state.build.proficiencies.skills = ['deception'];
    state.build.spells[0]!.known = ['spell.vicious-mockery', 'spell.fireball'];
    state.live.slotsUsed[1] = 6;
    expect(verifyCharacter(state, registry)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'proficiency-skills', status: 'missing' }),
        expect.objectContaining({ id: 'expertise-sleight-of-hand', status: 'review' }),
        expect.objectContaining({ id: 'Spells:pending:cantrips:class.bard', status: 'missing' }),
        expect.objectContaining({
          id: 'Spells:pending:spells-known:class.bard',
          status: 'missing',
        }),
        expect.objectContaining({ title: 'Fireball is not on the Bard spell list.' }),
        expect.objectContaining({ title: "Fireball exceeds Bard's level 2 spell limit." }),
        expect.objectContaining({ id: 'Spells:slots:1', status: 'excess' }),
      ]),
    );
  });

  it('keeps always-prepared Artillerist spells outside the preparation limit', () => {
    const state = structuredClone(freshState);
    state.build.classes = [
      { classId: 'class.artificer', subclassId: 'subclass.artificer.artillerist', level: 3 },
    ];
    state.build.hpEntries.forEach((entry) => {
      entry.classId = 'class.artificer';
    });
    state.build.spells = [
      {
        classId: 'class.artificer',
        known: ['spell.mending', 'spell.fire-bolt'],
        prepared: ['spell.shield', 'spell.thunderwave', 'spell.cure-wounds', 'spell.grease'],
      },
    ];
    const spellFindings = () =>
      verifyCharacter(state, registry).filter((row) => row.group === 'Spells');
    expect(spellFindings()).toEqual([]);
    state.build.spells[0]!.prepared = [];
    expect(spellFindings()).toEqual([]);
    state.build.spells[0]!.prepared = ['spell.cure-wounds', 'spell.grease', 'spell.detect-magic'];
    expect(spellFindings()).toEqual([
      expect.objectContaining({
        id: 'Spells:spell-count:class.artificer:prepared',
        status: 'excess',
      }),
    ]);
  });

  it('keeps copied Wizard spells and checks Pact Magic independently from ordinary slots', () => {
    const state = structuredClone(freshState);
    state.build.classes = [
      { classId: 'class.wizard', subclassId: 'subclass.wizard.evocation', level: 3 },
      { classId: 'class.warlock', subclassId: 'subclass.warlock.fiend', level: 2 },
    ];
    state.build.hpEntries.forEach((entry) => {
      entry.classId = 'class.wizard';
    });
    state.build.hpEntries[0]!.value = 6;
    state.build.hpEntries.push(
      { level: 4, classId: 'class.warlock', value: 4, method: 'rolled' },
      { level: 5, classId: 'class.warlock', value: 4, method: 'rolled' },
    );
    state.build.spells = [
      {
        classId: 'class.wizard',
        known: [
          'spell.fire-bolt',
          'spell.light',
          'spell.mage-hand',
          'spell.magic-missile',
          'spell.shield',
          'spell.sleep',
          'spell.detect-magic',
          'spell.mage-armor',
          'spell.find-familiar',
          'spell.thunderwave',
          'spell.identify',
          'spell.fog-cloud',
          'spell.invisibility',
          'spell.misty-step',
        ],
      },
      {
        classId: 'class.warlock',
        known: [
          'spell.eldritch-blast',
          'spell.minor-illusion',
          'spell.hex',
          'spell.armor-of-agathys',
          'spell.hunger-of-hadar',
        ],
      },
    ];
    state.live.slotsUsed[1] = 4;
    state.live.pactSlotsUsed = 3;
    const spellFindings = verifyCharacter(state, registry).filter((row) => row.group === 'Spells');
    expect(spellFindings).toEqual([
      expect.objectContaining({ title: expect.stringContaining('Hunger of Hadar exceeds') }),
      expect.objectContaining({ id: 'Spells:pact-slots', status: 'excess' }),
    ]);
  });

  it('checks saved HP, ASIs, resource counts and inventory relationships', () => {
    const state = structuredClone(freshState);
    state.build.hpEntries[1]!.value = 9;
    state.build.abilityScores.bonuses.push({ source: 'ASI: Bard 4', ability: 'CHA', value: 3 });
    state.live.hp = 99;
    state.live.hitDiceSpent.d8 = 4;
    state.live.featureUsesSpent['feature.bard.bardic-inspiration'] = 10;
    state.build.items[0]!.container = 'rapier-1';
    state.build.items.push({ itemId: 'item.wand-of-magic-missiles', instanceId: 'charged' });
    state.live.items.charged = { qty: 1, equipped: false, attuned: false, charges: 9 };
    expect(verifyCharacter(state, registry).map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        'Build & stats:hp-entry:2',
        'Build & stats:asi:ASI: Bard 4',
        'Build & stats:hp-over-max',
        'Build & stats:hit-dice:d8',
        'Features & resources:feature-uses:feature.bard.bardic-inspiration',
        'Inventory:container:rapier-1',
        'Inventory:charges:charged',
      ]),
    );
  });

  it('reports structurally missing records and unresolved references without throwing', () => {
    const state = structuredClone(freshState);
    delete state.live.items['rapier-1'];
    expect(verifyCharacter(state, registry)).toEqual([
      expect.objectContaining({ title: 'Invalid save field · live.items' }),
    ]);
    state.live.items['rapier-1'] = freshState.live.items['rapier-1']!;
    state.build.items[0]!.itemId = 'item.missing-test-reference';
    expect(verifyCharacter(state, registry)).toEqual([
      expect.objectContaining({
        title: 'Missing catalogue reference · item.missing-test-reference',
      }),
    ]);
  });

  it('counts a Samurai choice as one skill or one language', () => {
    const state = structuredClone(freshState);
    state.build.classes = [
      { classId: 'class.fighter', subclassId: 'subclass.fighter.samurai', level: 3 },
    ];
    state.build.hpEntries.forEach((entry) => {
      entry.classId = 'class.fighter';
    });
    state.build.hpEntries[0]!.value = 10;
    state.build.proficiencies.skills = ['deception', 'sleight-of-hand', 'acrobatics', 'perception'];
    state.build.proficiencies.expertise = [];
    delete state.build.proficiencyPicks!['feature.bard.bonus-proficiencies'];
    state.build.proficiencyPicks!['feature.fighter.samurai-bonus-proficiency'] = {
      languages: ['Dwarvish'],
    };
    const proficiencyFindings = () =>
      verifyCharacter(state, registry).filter(({ group }) => group === 'Proficiencies');
    expect(proficiencyFindings()).toEqual([]);
    state.build.proficiencies.skills.push('history');
    expect(proficiencyFindings()).toEqual([
      expect.objectContaining({ id: 'proficiency-shared', status: 'excess' }),
    ]);
  });

  it('checks scaled companion HP, expiry and shared active limits', () => {
    const state = structuredClone(freshState);
    state.build.companions = ['first', 'second'].map((id) => ({
      id,
      name: 'Companion',
      type: 'summon',
      ac: 12,
      maxHp: { ownerLevel: 2 },
      speed: { walk: 30 },
      abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      attacks: [],
      traits: [],
      uses: [],
      limit: { key: 'test-summon', max: 1 },
    }));
    state.live.companions = {
      first: {
        status: 'active',
        hp: 7,
        tempHp: 0,
        conditions: [],
        usesSpent: {},
        endsAt: state.live.clock.seconds,
      },
      second: { status: 'active', hp: 6, tempHp: 2, conditions: [], usesSpent: {} },
    };
    expect(verifyCharacter(state, registry).filter(({ group }) => group === 'Companions')).toEqual([
      expect.objectContaining({ id: 'Companions:companion-hp:first', title: 'Companion HP · 7/6' }),
      expect.objectContaining({ id: 'Companions:companion-active:first' }),
      expect.objectContaining({ id: 'Companions:companion-limit:test-summon' }),
    ]);
  });
});
