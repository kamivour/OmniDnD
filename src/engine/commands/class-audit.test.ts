import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { grantedSpells } from '../calc/granted-spells';
import { pendingChoices } from '../calc/pending-choices';
import { spellSelectionDetails } from '../calc/spell-selections';
import { startCombat, startTurn } from './combat';
import { chooseFeatSpells } from './feat-spells';
import { adjustFeatureUses, featureUseDetails, useFeature } from './features';
import { completeShortRest } from './rest';
import { resolveChoices } from './resolve-choices';
import { spellCastDetails } from './spell-options';
import { freshState, Session } from './test-utils';

function character(classId: string, level: number, subclassId?: string) {
  const state = structuredClone(freshState);
  state.campaign.sources = ['PHB', 'TCE', 'XGE', 'DMG'];
  state.campaign.optionalRules = { ...state.campaign.optionalRules, optionalClassFeatures: true };
  state.build.classes = [{ classId, level, subclassId }];
  const die = Number(registry.get('class', classId).hitDie.slice(1));
  state.build.hpEntries = Array.from({ length: level }, (_, index) => ({
    level: index + 1,
    classId,
    method: index === 0 ? 'max' : 'average',
    value: index === 0 ? die : die / 2 + 1,
  }));
  state.build.spells = [];
  state.build.featureIds = [];
  state.build.proficiencyPicks = {};
  return new Session(state);
}

describe('class audit', () => {
  it.each([
    ['paladin', 'blessed-warrior', 'CHA', ['spell.sacred-flame', 'spell.guidance']],
    ['ranger', 'druidic-warrior', 'WIS', ['spell.shillelagh', 'spell.guidance']],
  ] as const)(
    '%s style grants two class cantrips outside the normal limit',
    (className, style, ability, ids) => {
      const classId = 'class.' + className;
      const featureId = 'feature.tce.fighting-style-' + style;
      const session = character(classId, 2);
      session.state.campaign.optionalRules.optionalClassFeatures = false;
      expect(
        pendingChoices(session.state, registry).flatMap((row) => row.optionIds ?? []),
      ).not.toContain(featureId);
      session.state.campaign.optionalRules.optionalClassFeatures = true;
      expect(
        pendingChoices(session.state, registry).flatMap((row) => row.optionIds ?? []),
      ).toContain(featureId);
      session.run(resolveChoices, { classId, choices: { features: [featureId] } });
      expect(
        session.preview(chooseFeatSpells, { featureId, spellIds: [ids[0], 'spell.fire-bolt'] })
          .result,
      ).toBe('blocked');
      session.run(chooseFeatSpells, { featureId, spellIds: [...ids] });
      const ctx = { ...session.state, registry, sheet: session.sheet };
      expect(spellSelectionDetails(ctx, classId).cantrips.count).toBe(0);
      expect(spellCastDetails(ctx, { spellId: ids[0], classId })).toMatchObject({
        selected: true,
        casting: { ability },
      });
      session.undo();
      expect(grantedSpells(registry, session.state.build)).toEqual([]);
    },
  );

  const oaths = [...registry.entries.values()].filter(
    (entry) => entry.kind === 'subclass' && entry.classId === 'class.paladin',
  );
  it.each(oaths)('$name grants two Channel Divinity uses of one shared pool', ({ id }) => {
    const session = character('class.paladin', 3, id);
    const pool = 'feature.paladin.channel-divinity';
    const choices = session.sheet.features.filter(({ def }) => def.usesFrom === pool);
    expect(choices).toHaveLength(2);
    session.run(useFeature, { featureId: choices[0]!.def.id });
    expect(session.live.featureUsesSpent[pool]).toBe(1);
    expect(session.preview(useFeature, { featureId: choices[1]!.def.id }).result).toBe('blocked');
    session.undo();
    expect(session.live.featureUsesSpent[pool]).toBeUndefined();
  });

  it.each([
    ['paladin', 'glory', 'glory-inspiring-smite', false, true],
    ['paladin', 'conquest', 'conquest-guided-strike', false, false],
    ['cleric', 'twilight', 'twilight-twilight-sanctuary', true, false],
  ] as const)(
    '%s %s spends the right economy and Channel Divinity',
    (className, sub, feature, action, bonus) => {
      const session = character('class.' + className, 3, 'subclass.' + className + '.' + sub);
      session.run(startCombat, null);
      session.run(startTurn, null);
      session.run(useFeature, { featureId: 'feature.' + className + '.' + feature });
      expect(session.live.combat?.economy).toMatchObject({
        actionUsed: action,
        bonusUsed: bonus,
        reactionUsed: false,
      });
      expect(session.live.featureUsesSpent['feature.' + className + '.channel-divinity']).toBe(1);
    },
  );

  it('offers a second distinct style for Champion only at Fighter 10', () => {
    const session = character('class.fighter', 9, 'subclass.fighter.champion');
    session.run(resolveChoices, {
      classId: 'class.fighter',
      choices: { features: ['feature.fighter.fighting-style-defense'] },
    });
    const style = () =>
      pendingChoices(session.state, registry).find(({ label }) =>
        label.startsWith('Fighting Style:'),
      );
    expect(style()).toBeUndefined();
    session.state.build = {
      ...session.state.build,
      classes: [{ classId: 'class.fighter', level: 10, subclassId: 'subclass.fighter.champion' }],
    };
    expect(style()).toMatchObject({ count: 1 });
  });

  it('shares Cleric 6 and Paladin 3 Channel Divinity uses, including saved per-class spending', () => {
    const session = character('class.cleric', 6, 'subclass.cleric.life');
    session.state.build.classes.push({
      classId: 'class.paladin',
      level: 3,
      subclassId: 'subclass.paladin.devotion',
    });
    for (let level = 7; level <= 9; level++)
      session.state.build.hpEntries.push({
        level,
        classId: 'class.paladin',
        value: 6,
        method: 'average',
      });
    const cleric = 'feature.cleric.channel-divinity';
    const paladin = 'feature.paladin.channel-divinity';
    session.live.featureUsesSpent = { [cleric]: 1, [paladin]: 1 };
    const uses = () => featureUseDetails(session, paladin).uses;
    const divinity = { featureId: 'feature.paladin.channel-divinity-sacred-weapon' };
    expect(uses()).toMatchObject({ max: 2, remaining: 0 });
    expect(session.preview(useFeature, divinity).result).toBe('blocked');
    session.run(adjustFeatureUses, { featureId: cleric, spent: 1 });
    session.run(useFeature, divinity);
    expect(uses()).toMatchObject({ max: 2, remaining: 0 });
    session.undo();
    expect(uses()).toMatchObject({ remaining: 1 });
    session.run(completeShortRest, { hitDice: [] });
    expect(uses()).toMatchObject({ remaining: 2 });
    session.undo();
    session.undo();
    expect(session.live.featureUsesSpent).toEqual({ [cleric]: 1, [paladin]: 1 });
  });

  it.each([
    ['subclass.warlock.fiend', 'spell.burning-hands'],
    ['subclass.warlock.archfey', 'spell.faerie-fire'],
    ['subclass.warlock.great-old-one', 'spell.dissonant-whispers'],
    ['subclass.warlock.celestial', 'spell.guiding-bolt'],
    ['subclass.warlock.hexblade', 'spell.shield'],
    ['subclass.warlock.fathomless', 'spell.thunderwave'],
    ['subclass.warlock.genie', 'spell.detect-evil-and-good'],
  ])('%s adds patron spells to choices without learning them', (subclass, spellId) => {
    const session = character('class.warlock', 1, subclass);
    const details = spellSelectionDetails(
      { ...session.state, registry, sheet: session.sheet },
      'class.warlock',
    );
    expect(details.candidates.known).toContain(spellId);
    expect(details.granted.map(({ id }) => id)).not.toContain(spellId);
  });

  it('offers all eight Land terrains and grants spells at druid level, not character level', () => {
    const session = character('class.druid', 3, 'subclass.druid.land');
    const terrain = pendingChoices(session.state, registry).find(({ label }) =>
      label.startsWith('Circle Spells terrain'),
    );
    expect(terrain?.optionIds).toHaveLength(8);
    session.run(resolveChoices, {
      classId: 'class.druid',
      choices: { features: ['feature.druid.circle-of-the-land-coast'] },
    });
    expect(grantedSpells(registry, session.state.build).map(({ spellId }) => spellId)).toEqual([
      'spell.mirror-image',
      'spell.misty-step',
    ]);
    const multiclass = structuredClone(session.state.build);
    multiclass.classes.push({ classId: 'class.fighter', level: 6 });
    expect(grantedSpells(registry, multiclass)).toHaveLength(2);
    multiclass.classes[0]!.level = 5;
    expect(grantedSpells(registry, multiclass)).toHaveLength(4);
    multiclass.classes[0]!.subclassId = 'subclass.druid.moon';
    expect(grantedSpells(registry, multiclass)).toEqual([]);
  });

  it('offers Divine Soul spells from both lists and counts them normally', () => {
    const session = character('class.sorcerer', 1, 'subclass.sorcerer.divine-soul');
    const details = spellSelectionDetails(
      { ...session.state, registry, sheet: session.sheet },
      'class.sorcerer',
    );
    expect(details.candidates.known).toEqual(
      expect.arrayContaining(['spell.bless', 'spell.shield']),
    );
    expect(details.granted).toEqual([]);
  });

  it('gives Arcane Trickster Mage Hand and two other cantrip choices at level 3', () => {
    const session = character('class.rogue', 3, 'subclass.rogue.arcane-trickster');
    const ctx = { ...session.state, registry, sheet: session.sheet };
    const details = spellSelectionDetails(ctx, 'class.rogue');
    expect(details.cantrips.limit).toBe(2);
    expect(details.candidates.cantrips).not.toContain('spell.mage-hand');
    expect(
      spellCastDetails(ctx, { spellId: 'spell.mage-hand', classId: 'class.rogue' }),
    ).toMatchObject({ selected: true, casting: { ability: 'INT' } });
  });

  it('restricts Swords Bard to Dueling and Two-Weapon Fighting', () => {
    const session = character('class.bard', 3, 'subclass.bard.swords');
    const style = pendingChoices(session.state, registry).find(({ label }) =>
      label.startsWith('Fighting Style:'),
    );
    expect(style?.optionIds).toEqual([
      'feature.bard.swords-fighting-style-dueling',
      'feature.bard.swords-fighting-style-two-weapon-fighting',
    ]);
    session.run(resolveChoices, {
      classId: 'class.bard',
      choices: { features: [style!.optionIds![0]!] },
    });
    expect(
      pendingChoices(session.state, registry).some(({ label }) =>
        label.startsWith('Fighting Style:'),
      ),
    ).toBe(false);
    session.undo();
    expect(session.state.build.featureIds).toEqual([]);
  });

  it('applies Archery to a ranged weapon but not to a thrown melee weapon', () => {
    const session = character('class.fighter', 1);
    session.state.build.items = [
      { instanceId: 'bow', itemId: 'item.longbow' },
      { instanceId: 'axe', itemId: 'item.handaxe' },
    ];
    session.state.live.items = {
      bow: { qty: 1, equipped: true, attuned: false },
      axe: { qty: 1, equipped: true, attuned: false },
    };
    const attack = (id: string) =>
      session.sheet.attacks.find(({ instanceId }) => instanceId === id)!.toHit.value;
    const bow = attack('bow');
    const axe = attack('axe');
    session.run(resolveChoices, {
      classId: 'class.fighter',
      choices: { features: ['feature.fighter.fighting-style-archery'] },
    });
    expect(attack('bow')).toBe(bow + 2);
    expect(attack('axe')).toBe(axe);
  });
});
