import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { grantedSpells } from '../calc/granted-spells';
import { pendingChoices } from '../calc/pending-choices';
import { featSpellCandidates } from '../calc/feat-spells';
import { spellSelectionDetails } from '../calc/spell-selections';
import { startCombat, startTurn } from './combat';
import { takeCombatAction } from './actions';
import { chooseFeatSpells } from './feat-spells';
import { adjustFeatureUses, featureUseDetails, useFeature } from './features';
import { equipItem } from './items';
import { levelUp } from './level';
import { chooseProficiencies } from './proficiency-picks';
import { completeLongRest, completeShortRest } from './rest';
import { resolveChoices } from './resolve-choices';
import { spellCastDetails } from './spell-options';
import { castSpell } from './spells';
import { advanceTime } from './time';
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
  it('lets Lore Bard 6 learn two bonus secrets from any class and cast them as Bard spells', () => {
    const classId = 'class.bard';
    const session = character(classId, 5, 'subclass.bard.lore');
    session.state.campaign.hpMethod = 'average';
    const featureId = 'feature.bard.additional-magical-secrets';
    const spellIds = ['spell.counterspell', 'spell.revivify'];
    session.state.build.spells = [{ classId, known: ['spell.counterspell'] }];
    const ctx = () => ({ ...session.state, registry, sheet: session.sheet });
    expect(session.preview(chooseFeatSpells, { featureId, spellIds }).result).toBe('blocked');
    session.run(levelUp, { classId });
    expect(pendingChoices(session.state, registry)).toContainEqual(
      expect.objectContaining({ featureId, count: 2 }),
    );
    expect(
      session.preview(chooseFeatSpells, {
        featureId,
        spellIds: ['spell.counterspell', 'spell.banishment'],
      }).result,
    ).toBe('blocked');
    session.run(chooseFeatSpells, { featureId, spellIds });
    const details = spellSelectionDetails(ctx(), classId);
    expect(details.known).toMatchObject({ count: 0, limit: 9 });
    expect(session.state.build.spells[0]?.known).toEqual([]);
    expect(details.granted.map(({ id }) => id)).toEqual(spellIds);
    expect(spellCastDetails(ctx(), { spellId: 'spell.counterspell', classId })).toMatchObject({
      selected: true,
      casting: { ability: 'CHA' },
    });
    session.run(levelUp, {
      classId,
      spells: { swap: { remove: 'spell.counterspell', add: 'spell.greater-invisibility' } },
    });
    expect(spellSelectionDetails(ctx(), classId).granted.map(({ id }) => id)).toEqual([
      'spell.greater-invisibility',
      'spell.revivify',
    ]);
    session.undo();
    expect(spellSelectionDetails(ctx(), classId).granted.map(({ id }) => id)).toEqual(spellIds);
    session.undo();
    expect(spellSelectionDetails(ctx(), classId).granted).toEqual([]);
  });

  it.each([
    [10, 12],
    [14, 14],
    [18, 16],
  ])(
    'reserves regular Magical Secrets within the %s Bard known-spell cap',
    (level, ordinaryLimit) => {
      const classId = 'class.bard';
      const session = character(classId, level, 'subclass.bard.valor');
      const ctx = () => ({ ...session.state, registry, sheet: session.sheet });
      const featureId =
        level === 10 ? 'feature.bard.magical-secrets' : `feature.bard.magical-secrets-${level}`;
      expect(spellSelectionDetails(ctx(), classId).known.limit).toBe(ordinaryLimit);
      session.run(chooseFeatSpells, {
        featureId,
        spellIds: ['spell.guidance', 'spell.counterspell'],
      });
      const details = spellSelectionDetails(ctx(), classId);
      expect(details.granted.map(({ id }) => id)).toEqual(['spell.guidance', 'spell.counterspell']);
      expect(details.known.limit).toBe(ordinaryLimit);
      expect(details.cantrips.count).toBe(0);
    },
  );

  it('casts Arcanum spells once per tier and restores them only on a long rest', () => {
    const session = character('class.warlock', 17, 'subclass.warlock.genie');
    const sixth = {
      featureId: 'feature.warlock.mystic-arcanum',
      spellId: 'spell.circle-of-death',
      free: true,
    };
    const ninth = {
      featureId: 'feature.warlock.mystic-arcanum-9',
      spellId: 'spell.wish',
      free: true,
    };
    for (const { featureId, spellId } of [sixth, ninth]) {
      session.run(chooseFeatSpells, { featureId, spellIds: [spellId] });
    }
    session.run(castSpell, sixth, true);
    expect(session.preview(castSpell, sixth).result).toBe('blocked');
    expect(session.live.pactSlotsUsed ?? 0).toBe(0);
    session.run(castSpell, ninth, true);
    session.run(completeShortRest, {});
    expect(session.preview(castSpell, ninth).result).toBe('blocked');
    session.run(completeLongRest, null);
    expect(session.preview(castSpell, ninth).result).not.toBe('blocked');
    session.undo();
    expect(session.preview(castSpell, sixth).result).toBe('blocked');
  });

  it('keeps legacy Arcanum spending until the next long rest', () => {
    const session = character('class.warlock', 11, 'subclass.warlock.fiend');
    const featureId = 'feature.warlock.mystic-arcanum';
    const spellId = 'spell.circle-of-death';
    session.state.live.featureUsesSpent[featureId] = 1;
    session.run(chooseFeatSpells, { featureId, spellIds: [spellId] });
    const payload = { featureId, spellId, free: true };
    expect(session.preview(castSpell, payload).result).toBe('blocked');
    session.run(completeLongRest, null);
    expect(session.preview(castSpell, payload).result).not.toBe('blocked');
    session.undo();
    expect(session.preview(castSpell, payload).result).toBe('blocked');
  });

  it('changes only the Wizard cantrip selected with Cantrip Formulas at a long rest', () => {
    const classId = 'class.wizard';
    const session = character(classId, 3, 'subclass.wizard.evocation');
    session.state.build.spells = [
      { classId, known: ['spell.light', 'spell.fire-bolt'] },
      { classId: 'class.bard', known: ['spell.light'] },
    ];
    const payload = { cantripSwap: { remove: 'spell.light', add: 'spell.ray-of-frost' } };
    session.state.campaign.optionalRules.optionalClassFeatures = false;
    expect(session.preview(completeLongRest, payload).result).toBe('blocked');
    session.state.campaign.optionalRules.optionalClassFeatures = true;
    expect(
      session.preview(completeLongRest, {
        cantripSwap: { ...payload.cantripSwap, add: 'spell.fire-bolt' },
      }).result,
    ).toBe('blocked');
    expect(session.run(completeLongRest, payload)).toContain('Cantrip Formulas');
    expect(session.state.build.spells.map(({ known }) => known)).toEqual([
      ['spell.ray-of-frost', 'spell.fire-bolt'],
      ['spell.light'],
    ]);
    session.undo();
    expect(session.state.build.spells[0]?.known).toEqual(['spell.light', 'spell.fire-bolt']);
  });

  it('requires prepared spellbook picks for Spell Mastery and keeps Signature Spells always prepared', () => {
    const classId = 'class.wizard';
    const session = character(classId, 20, 'subclass.wizard.evocation');
    const mastery = 'feature.wizard.spell-mastery';
    const signature = 'feature.wizard.signature-spell';
    const known = [
      'spell.magic-missile',
      'spell.shield',
      'spell.misty-step',
      'spell.fireball',
      'spell.counterspell',
    ];
    session.state.build.spells = [{ classId, known, prepared: ['spell.magic-missile'] }];
    expect(
      session.preview(chooseFeatSpells, {
        featureId: mastery,
        spellIds: ['spell.mage-armor', 'spell.misty-step'],
      }).result,
    ).toBe('blocked');
    session.run(chooseFeatSpells, {
      featureId: mastery,
      spellIds: ['spell.magic-missile', 'spell.misty-step'],
    });
    expect(
      session.preview(castSpell, { featureId: mastery, spellId: 'spell.misty-step', free: true })
        .result,
    ).toBe('blocked');
    session.run(
      castSpell,
      { featureId: mastery, spellId: 'spell.magic-missile', free: true },
      true,
    );
    expect(session.live.slotsUsed[1]).toBe(0);
    const clock = session.live.clock.seconds;
    session.run(chooseFeatSpells, {
      featureId: mastery,
      spellIds: ['spell.shield', 'spell.misty-step'],
    });
    expect(session.live.clock.seconds).toBe(clock + 8 * 3600);
    session.undo();
    expect(session.live.clock.seconds).toBe(clock);
    session.run(chooseFeatSpells, {
      featureId: signature,
      spellIds: ['spell.fireball', 'spell.counterspell'],
    });
    const details = spellSelectionDetails(
      { ...session.state, registry, sheet: session.sheet },
      classId,
    );
    expect(details.known.count).toBe(5);
    expect(details.prepared.count).toBe(1);
    expect(details.granted.map(({ id }) => id)).toEqual(['spell.fireball', 'spell.counterspell']);
    const fireball = { featureId: signature, spellId: 'spell.fireball', free: true };
    const counterspell = { ...fireball, spellId: 'spell.counterspell' };
    session.run(castSpell, fireball, true);
    expect(session.preview(castSpell, fireball).result).toBe('blocked');
    session.run(castSpell, counterspell, true);
    session.run(completeShortRest, {});
    expect(session.preview(castSpell, fireball).result).not.toBe('blocked');
    session.undo();
    expect(session.preview(castSpell, counterspell).result).toBe('blocked');
  });

  it('spends the existing Star Map pool for free Guiding Bolt and preserves Druid slot casts', () => {
    const classId = 'class.druid';
    const session = character(classId, 2, 'subclass.druid.stars');
    const featureId = 'feature.druid.stars-star-map';
    const spellId = 'spell.guiding-bolt';
    session.live.featureUsesSpent[featureId] = 1;
    expect(session.preview(castSpell, { spellId, classId, free: true }).result).toBe('blocked');
    const payload = { featureId, spellId, free: true };
    session.run(castSpell, payload, true);
    expect(session.live.featureUsesSpent[featureId]).toBe(2);
    expect(session.live.slotsUsed[1]).toBe(0);
    expect(session.preview(castSpell, payload).result).toBe('blocked');
    session.run(castSpell, { classId, spellId, slotLevel: 1 }, true);
    expect(session.live.slotsUsed[1]).toBe(1);
    session.run(completeLongRest, null);
    expect(session.preview(castSpell, payload).result).not.toBe('blocked');
    session.undo();
    expect(session.preview(castSpell, payload).result).toBe('blocked');
  });

  it('uses Arcane Recovery during a short rest, based on Wizard level and the game clock', () => {
    const session = character('class.wizard', 5, 'subclass.wizard.evocation');
    const id = 'feature.wizard.arcane-recovery';
    session.state.live.slotsUsed = session.live.slotsUsed.map(
      (_, level) => [0, 2, 1, 1][level] ?? 0,
    );
    expect(session.preview(completeShortRest, { arcaneRecovery: [2, 2] }).result).toBe('blocked');
    expect(session.preview(completeShortRest, { arcaneRecovery: [3, 1] }).result).toBe('blocked');
    expect(session.preview(completeShortRest, { arcaneRecovery: [6] }).result).toBe('blocked');
    session.run(completeShortRest, { arcaneRecovery: [2, 1] });
    expect(session.state.live.slotsUsed.slice(1, 4)).toEqual([1, 0, 1]);
    expect(session.live.featureUsesSpent[id]).toBe(1);
    expect(session.preview(completeShortRest, { arcaneRecovery: [1] }).result).toBe('blocked');
    session.undo();
    expect(session.state.live.slotsUsed.slice(1, 4)).toEqual([2, 1, 1]);
    expect(session.live.featureUsesSpent[id]).toBeUndefined();
    session.state.live = {
      ...session.live,
      clock: { seconds: 5 * 3600 + 30 * 60 },
      featureUsesSpent: { [id]: 1 },
    };
    session.run(completeShortRest, { arcaneRecovery: [3] });
    expect(session.state.live.slotsUsed[3]).toBe(0);
    expect(session.live.featureUsesSpent[id]).toBe(1);
  });

  const subclasses = [...registry.entries.values()].filter((entry) => entry.kind === 'subclass');

  it.each(subclasses)('$name grants its recorded features at their class levels', (subclass) => {
    const firstLevel = registry.get('class', subclass.classId).subclassLevel;
    const levels = new Set([firstLevel, 20, ...subclass.features.map(({ level }) => level)]);
    for (const level of levels) {
      const session = character(subclass.classId, level, subclass.id);
      session.state.campaign.optionalRules.optionalClassFeatures = false;
      const owned = new Set(session.sheet.features.map(({ def }) => def.id));
      for (const row of subclass.features)
        expect(owned.has(row.featureId)).toBe(
          subclass.features.some(
            (step) => step.featureId === row.featureId && step.level <= level,
          ) ||
            registry
              .get('class', subclass.classId)
              .features.some((step) => step.featureId === row.featureId && step.level <= level),
        );
    }
  });

  it.each([
    ['bard', 'mirror-image'],
    ['cleric', 'sunbeam'],
    ['druid', 'divination'],
    ['paladin', 'warding-bond'],
    ['ranger', 'summon-elemental'],
    ['sorcerer', 'grease'],
    ['warlock', 'mislead'],
    ['wizard', 'speak-with-dead'],
  ])('%s adds %s only with the Tasha class options', (className, spellName) => {
    const id = `class.${className}`;
    const spell = `spell.${spellName}`;
    const session = character(id, 20);
    const details = () =>
      spellSelectionDetails({ ...session.state, registry, sheet: session.sheet }, id);
    const allowed = () => [...details().candidates.known, ...details().candidates.prepared];
    expect(allowed()).toContain(spell);
    session.state.campaign.sourceParts = { TCE: ['spells'] };
    expect(allowed()).not.toContain(spell);
    session.state.campaign.sourceParts = undefined;
    session.state.campaign.optionalRules.optionalClassFeatures = false;
    expect(allowed()).not.toContain(spell);
  });

  it('keeps normal class lists and subclass spell grants distinct', () => {
    const session = character('class.cleric', 17, 'subclass.cleric.tempest');
    session.state.campaign.optionalRules.optionalClassFeatures = false;
    const ctx = { ...session.state, registry, sheet: session.sheet };
    const cleric = spellSelectionDetails(ctx, 'class.cleric');
    expect(cleric.candidates.prepared).toContain('spell.divination');
    expect(cleric.candidates.prepared).not.toContain('spell.arcane-eye');
    expect(cleric.granted).toContainEqual({ id: 'spell.destructive-wave', from: 'Tempest Domain' });
  });

  it('lets a Bard swap a cantrip at an ASI and a leveled spell independently', () => {
    const session = character('class.bard', 3, 'subclass.bard.lore');
    const before = ['spell.vicious-mockery', 'spell.minor-illusion', 'spell.healing-word'];
    session.state.campaign.hpMethod = 'average';
    session.state.build.spells = [{ classId: 'class.bard', known: before }];
    const payload = {
      classId: 'class.bard',
      spells: {
        cantripSwap: { remove: before[0]!, add: 'spell.mage-hand' },
        swap: { remove: before[2]!, add: 'spell.cure-wounds' },
      },
    };
    session.state.campaign.optionalRules.optionalClassFeatures = false;
    expect(session.preview(levelUp, payload).result).toBe('blocked');
    session.state.campaign.optionalRules.optionalClassFeatures = true;
    session.run(levelUp, payload);
    expect(session.state.build.spells[0]?.known).toEqual(
      expect.arrayContaining(['spell.mage-hand', 'spell.cure-wounds', 'spell.minor-illusion']),
    );
    expect(
      session.preview(levelUp, {
        classId: 'class.bard',
        spells: { cantripSwap: { remove: 'spell.mage-hand', add: 'spell.vicious-mockery' } },
      }).result,
    ).toBe('blocked');
    session.undo();
    expect(session.state.build.spells[0]?.known).toEqual(before);
  });

  it('offers a Divine Soul affinity spell outside ordinary known picks and restricts its replacement to Cleric spells', () => {
    const classId = 'class.sorcerer';
    const session = character(classId, 1, 'subclass.sorcerer.divine-soul');
    session.state.campaign.sources.push('SCC');
    session.state.campaign.hpMethod = 'average';
    const featureId = 'feature.sorcerer.divine-affinity-law';
    const pending = pendingChoices(session.state, registry).find(({ optionIds }) =>
      optionIds?.includes(featureId),
    );
    expect(pending?.optionIds).toHaveLength(5);
    session.run(resolveChoices, { classId, choices: { features: [featureId] } });
    const details = () =>
      spellSelectionDetails({ ...session.state, registry, sheet: session.sheet }, classId);
    expect(details().granted.map(({ id }) => id)).toEqual(['spell.bless']);
    expect(details().known.count).toBe(0);
    const payload = {
      classId,
      spells: { swap: { remove: 'spell.bless', add: 'spell.magic-missile' } },
    };
    expect(session.preview(levelUp, payload).result).toBe('blocked');
    session.run(levelUp, {
      classId,
      spells: { swap: { remove: 'spell.bless', add: 'spell.healing-word' } },
    });
    expect(details().granted.map(({ id }) => id)).toEqual(['spell.healing-word']);
    session.undo();
    expect(details().granted.map(({ id }) => id)).toEqual(['spell.bless']);
  });

  it.each([
    ['class.fighter', 'subclass.fighter.eldritch-knight', ['spell.shield', 'spell.magic-missile']],
    [
      'class.rogue',
      'subclass.rogue.arcane-trickster',
      ['spell.charm-person', 'spell.disguise-self'],
    ],
  ])('respects third-caster school allowances for %s', (classId, subclassId, onSchool) => {
    const session = character(classId, 2);
    session.state.campaign.hpMethod = 'average';
    const payload = {
      classId,
      choices: { subclassId },
      spells: { add: [onSchool[0]!, 'spell.grease', 'spell.feather-fall'] },
    };
    expect(session.preview(levelUp, payload).result).toBe('blocked');
    session.run(levelUp, { ...payload, spells: { add: [...onSchool, 'spell.grease'] } });
    expect(
      spellSelectionDetails({ ...session.state, registry, sheet: session.sheet }, classId)
        .schoolLimits,
    ).toMatchObject({ used: 1, unrestricted: 1 });
  });

  it.each([
    ['fighter', 'psi-warrior', 'protective-field'],
    ['rogue', 'soulknife', 'psi-bolstered-knack'],
  ])(
    'spends and recovers a psionic die for %s without refilling the whole pool on short rest',
    (className, subclassName, ability) => {
      const session = character(`class.${className}`, 5, `subclass.${className}.${subclassName}`);
      const base = `feature.${className}.${subclassName}-`;
      const pool = base + 'psionic-power';
      const recovery = { featureId: base + 'psionic-recovery' };
      expect(session.preview(useFeature, recovery).result).toBe('blocked');
      session.run(useFeature, { featureId: base + ability });
      expect(session.live.featureUsesSpent[pool]).toBe(1);
      session.run(useFeature, recovery);
      expect(session.live.featureUsesSpent[pool]).toBeUndefined();
      session.run(useFeature, { featureId: base + ability });
      expect(session.preview(useFeature, recovery).result).toBe('blocked');
      session.run(completeShortRest, {});
      expect(session.live.featureUsesSpent[pool]).toBe(1);
      session.run(useFeature, recovery);
      session.undo();
      expect(session.live.featureUsesSpent[pool]).toBe(1);
    },
  );

  it('offers six runes with the right level gates and reads Master of Runes at Fighter 15', () => {
    const classId = 'class.fighter';
    const subclassId = 'subclass.fighter.rune-knight';
    const session = character(classId, 3, subclassId);
    const options = () =>
      pendingChoices(session.state, registry).find(({ label }) => label.startsWith('Runes:'));
    const rune = (name: string) => `feature.fighter.rune-knight-inscribed-${name}`;
    expect(options()).toMatchObject({
      count: 2,
      optionIds: ['cloud', 'fire', 'frost', 'stone'].map(rune),
    });
    expect(
      session.preview(resolveChoices, {
        classId,
        choices: { features: [rune('hill')] },
      }).result,
    ).toBe('blocked');
    session.run(resolveChoices, { classId, choices: { features: [rune('cloud'), rune('frost')] } });
    session.state.build = {
      ...session.state.build,
      classes: [
        { classId, subclassId, level: 14 },
        { classId: 'class.bard', level: 1 },
      ],
    };
    expect(featureUseDetails(session, rune('cloud')).uses).toMatchObject({ max: 1 });
    session.state.build.classes = [{ classId, subclassId, level: 15 }];
    expect(options()?.optionIds).toHaveLength(6);
    expect(featureUseDetails(session, rune('cloud')).uses).toMatchObject({ max: 2 });
  });

  it('offers all Arcane Shots and two lore cantrips, with a single shot pool', () => {
    const classId = 'class.fighter';
    const session = character(classId, 3, 'subclass.fighter.arcane-archer');
    const shot = pendingChoices(session.state, registry).find(({ label }) =>
      label.startsWith('Arcane Shots:'),
    );
    expect(shot?.count).toBe(2);
    expect(shot?.optionIds).toHaveLength(8);
    const ids = shot!.optionIds!.slice(0, 2);
    session.run(resolveChoices, { classId, choices: { features: ids } });
    session.run(useFeature, { featureId: ids[0]! });
    expect(featureUseDetails(session, ids[1]!).uses?.remaining).toBe(1);
    session.undo();
    expect(featureUseDetails(session, ids[1]!).uses?.remaining).toBe(2);
    const def = registry.get('feature', 'feature.fighter.arcane-archer-arcane-archer-lore');
    const pick = def.spells!.picks![0]!;
    expect(
      featSpellCandidates(registry, session.state.campaign, pick, undefined).map(({ id }) => id),
    ).toEqual(['spell.druidcraft', 'spell.prestidigitation']);
  });

  it('gives Primal Awareness spells separate free uses without learning ordinary Ranger spells', () => {
    const session = character('class.ranger', 5, 'subclass.ranger.hunter');
    const payload = {
      spellId: 'spell.beast-sense',
      featureId: 'feature.tce.ranger-primal-awareness-beast-sense',
      free: true,
    };
    const ctx = () => ({ ...session.state, registry, sheet: session.sheet });
    expect(spellSelectionDetails(ctx(), 'class.ranger').known.count).toBe(0);
    expect(spellCastDetails(ctx(), payload).feat).toMatchObject({ freeLeft: 1 });
    session.run(castSpell, payload, true);
    expect(spellCastDetails(ctx(), payload).feat).toMatchObject({ freeLeft: 0 });
    session.run(completeLongRest, null);
    expect(spellCastDetails(ctx(), payload).feat).toMatchObject({ freeLeft: 1 });
    session.undo();
    expect(spellCastDetails(ctx(), payload).feat).toMatchObject({ freeLeft: 0 });
  });

  it('keeps Pact Tome cantrips and Pact Chain Find Familiar outside normal known picks', () => {
    const classId = 'class.warlock';
    const session = character(classId, 3, 'subclass.warlock.fiend');
    const tome = 'feature.warlock.pact-of-the-tome';
    const chain = 'feature.warlock.pact-of-the-chain';
    const tomeSpells = ['spell.guidance', 'spell.fire-bolt', 'spell.vicious-mockery'];
    const ctx = () => ({ ...session.state, registry, sheet: session.sheet });
    session.run(resolveChoices, { classId, choices: { features: [tome] } });
    session.run(chooseFeatSpells, { featureId: tome, spellIds: tomeSpells });
    expect(spellSelectionDetails(ctx(), classId).cantrips.count).toBe(0);
    for (const spellId of tomeSpells)
      expect(spellCastDetails(ctx(), { spellId, classId })).toMatchObject({
        selected: true,
        casting: { ability: 'CHA' },
      });
    session.undo();
    session.undo();
    session.run(resolveChoices, { classId, choices: { features: [chain] } });
    expect(
      spellCastDetails(ctx(), { spellId: 'spell.find-familiar', featureId: chain }),
    ).toMatchObject({
      ritualEligible: true,
      feat: { source: { grant: { slots: true } } },
    });
  });

  it('grants Shadow Magic Darkness and restores four spent points to a level 20 Sorcerer', () => {
    const classId = 'class.sorcerer';
    const session = character(classId, 20, 'subclass.sorcerer.shadow-magic');
    expect(grantedSpells(registry, session.state.build)).toContainEqual({
      spellId: 'spell.darkness',
      classId,
      from: 'Shadow Magic',
    });
    const pool = 'feature.sorcerer.font-of-magic';
    session.run(useFeature, { featureId: 'feature.sorcerer.shadow-magic-umbral-form' });
    expect(session.live.featureUsesSpent[pool]).toBe(6);
    session.run(completeShortRest, {});
    expect(session.live.featureUsesSpent[pool]).toBe(2);
    session.undo();
    expect(session.live.featureUsesSpent[pool]).toBe(6);
  });

  it('adds Primal Champion to Strength and Constitution and derives the extra HP', () => {
    const session = character('class.barbarian', 19, 'subclass.barbarian.berserker');
    session.state.campaign.hpMethod = 'average';
    const { maxHp, abilities } = session.sheet;
    session.run(levelUp, { classId: 'class.barbarian' });
    for (const ability of ['STR', 'CON'] as const)
      expect(session.sheet.abilities[ability].score.value).toBe(abilities[ability].score.value + 4);
    expect(session.sheet.maxHp.value).toBe(maxHp.value + 7 + abilities.CON.mod + 40);
    session.undo();
    expect(session.sheet.maxHp.value).toBe(maxHp.value);
  });

  it('lets a Bladesinger choose a one-handed melee weapon and gains Extra Attack at Wizard 6', () => {
    const session = character('class.wizard', 6, 'subclass.wizard.bladesinging');
    const featureId = 'feature.wizard.bladesinging-training';
    session.state.build.proficiencies.weapons = [];
    expect(session.sheet.proficiencies.armor).toContain('light');
    expect(session.sheet.proficiencies.skills).toContain('performance');
    expect(
      session.preview(chooseProficiencies, { featureId, weapons: ['item.longbow'] }).result,
    ).toBe('blocked');
    session.run(chooseProficiencies, { featureId, weapons: ['item.rapier'] });
    expect(session.sheet.proficiencies.weapons).toContain('item.rapier');
    expect(
      session.sheet.features.find(
        ({ def }) => def.id === 'feature.wizard.bladesinging-extra-attack',
      )?.attacks,
    ).toBe(2);
    session.undo();
    expect(session.sheet.proficiencies.weapons).not.toContain('item.rapier');
  });

  it('applies Bladesong and Song of Victory and ends them on shield, weapon grip or time', () => {
    const session = character('class.wizard', 14, 'subclass.wizard.bladesinging');
    const featureId = 'feature.wizard.bladesinging-bladesong';
    session.state.build.abilityScores.base.INT = 18;
    session.state.build.abilityScores.bonuses = [];
    session.state.build.items = [
      { itemId: 'item.longsword', instanceId: 'sword' },
      { itemId: 'item.shield', instanceId: 'shield' },
    ];
    session.state.live.items = {
      sword: { qty: 1, equipped: true, attuned: false },
      shield: { qty: 1, equipped: false, attuned: false },
    };
    const before = session.sheet;
    session.run(useFeature, { featureId });
    expect(session.sheet.bladesong).toEqual({ concentrationBonus: 4 });
    expect(session.sheet.ac.value).toBe(before.ac.value + 4);
    expect(session.sheet.speed.value).toBe(before.speed.value + 10);
    expect(session.sheet.saves.CON.value).toBe(before.saves.CON.value);
    expect(session.sheet.attacks[0]?.damage?.bonus).toBe(before.attacks[0]!.damage!.bonus + 4);
    expect(session.live.featureUsesSpent[featureId]).toBe(1);
    expect(session.run(advanceTime, { seconds: 60 })).toContain('Bladesong');
    expect(session.sheet.bladesong).toBeUndefined();
    session.undo();
    expect(session.run(equipItem, { instanceId: 'shield', equipped: true }, true)).toContain(
      'Bladesong ended',
    );
    expect(session.sheet.bladesong).toBeUndefined();
    expect(session.preview(useFeature, { featureId }).result).toBe('blocked');
    session.undo();
    expect(session.sheet.bladesong?.concentrationBonus).toBe(4);
    session.run(startCombat, null);
    session.run(startTurn, null);
    expect(
      session.run(takeCombatAction, {
        action: 'weapon-attack',
        instanceId: 'sword',
        twoHanded: true,
      }),
    ).toContain('two-handed weapon attack');
    expect(session.sheet.bladesong).toBeUndefined();
    session.undo();
    expect(session.sheet.bladesong?.concentrationBonus).toBe(4);
  });

  it('derives Champion critical thresholds from Fighter levels', () => {
    const classId = 'class.fighter';
    const champion = 'subclass.fighter.champion';
    expect(character(classId, 3, champion).sheet.weaponCriticalAt).toBe(19);
    expect(character(classId, 14, champion).sheet.weaponCriticalAt).toBe(19);
    expect(character(classId, 15, champion).sheet.weaponCriticalAt).toBe(18);
    expect(
      character(classId, 20, 'subclass.fighter.battle-master').sheet.weaponCriticalAt,
    ).toBeUndefined();
  });

  it('dedicates one proficient weapon at rest and derives its Martial Arts attack', () => {
    const session = character('class.monk', 17, 'subclass.monk.open-hand');
    session.state.build.abilityScores.base.DEX = 18;
    session.state.build.abilityScores.base.STR = 10;
    session.state.build.abilityScores.bonuses = [];
    session.state.build.proficiencies.weapons.push('item.longsword', 'item.greatsword');
    session.state.build.items = [
      { instanceId: 'sword', itemId: 'item.longsword' },
      { instanceId: 'heavy', itemId: 'item.greatsword' },
    ];
    session.state.live.items = {
      sword: { qty: 1, equipped: true, attuned: false },
      heavy: { qty: 1, equipped: false, attuned: false },
    };
    expect(session.sheet.attacks[0]).toMatchObject({ ability: 'STR', damage: { dice: '1d8' } });
    expect(session.preview(completeLongRest, { dedicatedWeaponId: 'heavy' }).result).toBe(
      'blocked',
    );
    expect(session.run(completeShortRest, { dedicatedWeaponId: 'sword' })).toContain(
      'Dedicated Weapon',
    );
    expect(session.sheet.attacks[0]).toMatchObject({
      ability: 'DEX',
      damage: { dice: '1d10', bonus: 4 },
    });
    session.run(completeLongRest, null);
    expect(session.live.dedicatedWeaponId).toBe('sword');
    session.undo();
    session.undo();
    expect(session.live.dedicatedWeaponId).toBeUndefined();
    expect(session.sheet.attacks[0]?.ability).toBe('STR');
  });

  it('adds Remarkable Athlete to initiative and physical checks without stacking Jack of All Trades', () => {
    const session = character('class.fighter', 7, 'subclass.fighter.champion');
    session.state.build.classes.push({ classId: 'class.bard', level: 2 });
    session.state.build.proficiencies.skills = ['acrobatics'];
    session.state.build.proficiencies.expertise = [];
    const { initiative, skills } = session.sheet;
    expect(initiative.parts).toContainEqual({ label: 'Remarkable Athlete', value: 2 });
    expect(initiative.parts.map(({ label }) => label)).not.toContain('Jack of All Trades');
    expect(skills.athletics.parts).toContainEqual({ label: 'Remarkable Athlete', value: 2 });
    expect(skills.acrobatics.parts.map(({ label }) => label)).not.toContain('Remarkable Athlete');
    expect(skills.arcana.parts).toContainEqual({ label: 'Jack of All Trades', value: 2 });
  });

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
