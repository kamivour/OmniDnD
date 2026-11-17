import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { computeSheet } from './sheet';
import { freshState, Session } from '../commands/test-utils';
import { addCompanion, damageCompanion, updateCompanion } from '../commands/companions';
import { advanceTime } from '../commands/time';
import { useCannon } from '../commands/cannons';
import { startCombat, startTurn } from '../commands/combat';
import { ExportFileSchema, type Companion, type CompanionProfile } from '../schema';
import { companionStats } from './companions';
import { profileError, resolveCompanion, SUMMON_PROFILES } from './companion-profiles';

function ownerAt(level = 5) {
  const state = structuredClone(freshState);
  state.build.classes = [
    { classId: 'class.artificer', level, subclassId: 'subclass.artificer.artillerist' },
  ];
  state.build.hpEntries = Array.from({ length: level }, (_, index) => ({
    level: index + 1,
    classId: 'class.artificer',
    method: index ? ('average' as const) : ('max' as const),
    value: index ? 5 : 8,
  }));
  state.build.spells = [];
  state.build.featureIds = [];
  state.build.proficiencyPicks = {};
  state.build.abilityScores.base.INT = 16;
  state.build.abilityScores.bonuses = [];
  return { state, build: state.build, sheet: computeSheet(state, registry) };
}

const base: Companion = {
  id: 'cannon',
  name: 'Companion',
  type: 'summon',
  ac: 10,
  maxHp: 1,
  speed: {},
  abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
  attacks: [],
  traits: [],
  uses: [],
};
const configured = (profile: CompanionProfile, owner = ownerAt()) =>
  resolveCompanion({ ...base, profile }, owner);
const cannon = (form: string, owner = ownerAt()) =>
  configured({ family: 'eldritch-cannon', form }, owner);

describe('2014 companion forms', () => {
  it('separates cannon attacks, saving throws and protection', () => {
    const owner = ownerAt();
    const flame = cannon('Flamethrower', owner);
    expect(flame.kind).toBe('Small magical object');
    expect(flame.attacks).toEqual([]);
    expect(flame.actions![0]!.effect).toContain(
      `Dexterity save DC ${8 + owner.sheet.proficiency + owner.sheet.abilities.INT.mod}`,
    );
    expect(flame.actions![0]!.effect).toContain('2d8 fire');
    expect(cannon('Protector', owner).actions![0]!.effect).toContain('1d8+3 temporary HP');
    const ballista = companionStats(cannon('Force Ballista', owner), owner);
    expect(ballista).toMatchObject({
      ac: 18,
      maxHp: 25,
      attacks: [{ bonus: 6, damage: { dice: '2d8', type: 'force' }, range: '120 ft.' }],
    });
  });

  it('scales cannon damage at 9, leaves Protector at 1d8 and permits two at 15', () => {
    expect(cannon('Flamethrower', ownerAt(8)).actions![0]!.effect).toContain('2d8');
    expect(cannon('Flamethrower', ownerAt(9)).actions![0]!.effect).toContain('3d8');
    expect(companionStats(cannon('Force Ballista'), ownerAt(9)).attacks[0]!.damage!.dice).toBe(
      '3d8',
    );
    expect(cannon('Protector', ownerAt(15)).actions![0]!.effect).toContain('1d8+3');
    expect(cannon('Protector', ownerAt(14)).limit!.max).toBe(1);
    expect(cannon('Protector', ownerAt(15)).limit!.max).toBe(2);
    expect(
      configured({ family: 'eldritch-cannon', form: 'Protector', size: 'Tiny', legs: false }).speed,
    ).toEqual({});
    const low = ownerAt();
    low.sheet.abilities.INT.mod = -2;
    expect(cannon('Protector', low).actions![0]!.effect).toContain('1d8+1');
  });

  const cases: [CompanionProfile['family'], string, number, number, string, string][] = [
    ['beast', 'Air', 20, 13, 'Maul', 'piercing'],
    ['beast', 'Land', 30, 13, 'Maul', 'piercing'],
    ['beast', 'Water', 30, 13, 'Maul', 'piercing'],
    ['fey', 'Fuming', 30, 15, 'Shortsword', 'piercing'],
    ['fey', 'Mirthful', 30, 15, 'Shortsword', 'piercing'],
    ['fey', 'Tricksy', 30, 15, 'Shortsword', 'piercing'],
    ['shadowspawn', 'Fury', 35, 14, 'Chilling Hand', 'cold'],
    ['shadowspawn', 'Despair', 35, 14, 'Chilling Hand', 'cold'],
    ['shadowspawn', 'Fear', 35, 14, 'Chilling Hand', 'cold'],
    ['undead', 'Ghostly', 30, 14, 'Deathly Touch', 'necrotic'],
    ['undead', 'Putrid', 30, 14, 'Rotting Claw', 'slashing'],
    ['undead', 'Skeletal', 20, 14, 'Grave Bolt', 'necrotic'],
    ['aberration', 'Beholderkin', 40, 15, 'Eye Ray', 'psychic'],
    ['aberration', 'Slaad', 40, 15, 'Claws', 'slashing'],
    ['aberration', 'Star Spawn', 40, 15, 'Psychic Slam', 'psychic'],
    ['construct', 'Clay', 40, 17, 'Slam', 'bludgeoning'],
    ['construct', 'Metal', 40, 17, 'Slam', 'bludgeoning'],
    ['construct', 'Stone', 40, 17, 'Slam', 'bludgeoning'],
    ['elemental', 'Air', 50, 15, 'Slam', 'bludgeoning'],
    ['elemental', 'Earth', 50, 15, 'Slam', 'bludgeoning'],
    ['elemental', 'Fire', 50, 15, 'Slam', 'fire'],
    ['elemental', 'Water', 50, 15, 'Slam', 'bludgeoning'],
    ['celestial', 'Avenger', 40, 16, 'Radiant Bow', 'radiant'],
    ['celestial', 'Defender', 40, 18, 'Radiant Mace', 'radiant'],
    ['draconic-spirit', 'Chromatic', 50, 19, 'Rend', 'piercing'],
    ['draconic-spirit', 'Gem', 50, 19, 'Rend', 'piercing'],
    ['draconic-spirit', 'Metallic', 50, 19, 'Rend', 'piercing'],
    ['fiend', 'Demon', 50, 18, 'Bite', 'necrotic'],
    ['fiend', 'Devil', 40, 18, 'Hurl Flame', 'fire'],
    ['fiend', 'Yugoloth', 60, 18, 'Claws', 'slashing'],
  ];
  it.each(cases)('%s / %s has its own base stat block', (family, form, hp, ac, name, type) => {
    const spec = SUMMON_PROFILES.find((entry) => entry.family === family)!;
    const companion = configured({ family, form, spellLevel: spec.level });
    expect(companion).toMatchObject({ ac, maxHp: hp, attacks: [{ name, damage: { type } }] });
  });

  it.each(SUMMON_PROFILES)(
    'upcasts every $family form without asking for derived numbers',
    (spec) => {
      for (const form of spec.forms) {
        const first = configured({ family: spec.family, form: form.name, spellLevel: spec.level });
        const higher = configured({
          family: spec.family,
          form: form.name,
          spellLevel: spec.level + 2,
        });
        expect(higher.ac).toBe((first.ac as number) + 2);
        expect(higher.maxHp).toBe((first.maxHp as number) + 2 * spec.hpPerLevel);
        expect(higher.attacks[0]!.damage!.bonus).toBe(
          (first.attacks[0]!.damage!.bonus as number) + 2,
        );
        expect(higher.traits.join(' ')).toContain(`${Math.floor((spec.level + 2) / 2)} attacks`);
      }
    },
  );

  it('uses the chosen casting class instead of the best multiclass attack', () => {
    const owner = ownerAt();
    owner.state.build.classes.push({ classId: 'class.wizard', level: 3 });
    const bard = {
      ...owner.sheet.spellcasting[0]!,
      classId: 'class.bard',
      attack: { value: 12, parts: [] },
      saveDc: { value: 20, parts: [] },
    };
    owner.sheet.spellcasting.push(bard);
    const summon = configured(
      { family: 'beast', form: 'Land', spellLevel: 2, castingClassId: 'class.artificer' },
      owner,
    );
    expect(companionStats(summon, owner).attacks[0]!.bonus).toBe(6);
    expect(summon.traits.join(' ')).toContain('Spell save DC 14');
  });

  it('does not guess a form for legacy/custom definitions', () => {
    expect(resolveCompanion(base, ownerAt())).toBe(base);
    expect(profileError({ family: 'eldritch-cannon', form: '' })).toBeTruthy();
    expect(profileError({ family: 'fiend', form: 'Devil', spellLevel: 2 })).toBeTruthy();
  });
});

describe('configured companions through commands', () => {
  it('blocks missing forms and changing creation choices without recreating', () => {
    const owner = ownerAt();
    const session = new Session(owner.state);
    expect(
      session.preview(addCompanion, {
        companion: { ...base, profile: { family: 'eldritch-cannon', form: '' } },
      }).result,
    ).toBe('blocked');
    session.run(addCompanion, { companion: cannon('Protector', owner) });
    const current = session.state.build.companions![0]!;
    expect(
      session.preview(updateCompanion, {
        companion: { ...current, profile: { ...current.profile!, form: 'Force Ballista' } },
      }).result,
    ).toBe('blocked');
    expect(
      session.preview(updateCompanion, {
        companion: { ...current, profile: { ...current.profile!, legs: false } },
      }).result,
    ).toBe('blocked');
    expect(session.preview(useCannon, { ids: ['cannon'], mode: 'detonate' }).result).toBe(
      'blocked',
    );
    expect(session.preview(useCannon, { ids: ['cannon', 'cannon'], mode: 'activate' }).result).toBe(
      'blocked',
    );
    session.run(damageCompanion, { id: 'cannon', amount: 25 });
    expect(session.preview(useCannon, { ids: ['cannon'], mode: 'activate' }).result).toBe(
      'blocked',
    );
  });

  it('preserves choices through export, expiry and Undo', () => {
    const owner = ownerAt();
    const session = new Session(owner.state);
    session.run(addCompanion, { companion: cannon('Protector', owner) });
    const exported = ExportFileSchema.parse({
      app: 'omnidnd',
      schemaVersion: 1,
      exportedAt: '2026-11-18T00:00:00Z',
      campaign: session.state.campaign,
      build: session.state.build,
      live: session.live,
      events: session.events,
    });
    expect(exported.build.companions![0]!.profile!.form).toBe('Protector');
    session.run(advanceTime, { seconds: 3600 });
    expect(session.live.companions!.cannon!.status).toBe('dismissed');
    session.undo();
    expect(session.live.companions!.cannon!.status).toBe('active');
  });

  it('converting a legacy record preserves current HP and expiry; Undo restores its definition', () => {
    const owner = ownerAt();
    const session = new Session(owner.state);
    const legacy = cannon('Force Ballista', owner);
    delete legacy.profile;
    session.run(addCompanion, { companion: legacy });
    session.run(damageCompanion, { id: legacy.id, amount: 7 });
    const expiry = session.live.companions!.cannon!.endsAt;
    session.run(updateCompanion, {
      companion: { ...legacy, profile: { family: 'eldritch-cannon', form: 'Flamethrower' } },
    });
    expect(session.live.companions!.cannon).toMatchObject({ hp: 18, endsAt: expiry });
    session.undo();
    expect(session.state.build.companions![0]!.profile).toBeUndefined();
  });

  it('shares one bonus action between two cannons and restores both on Undo after detonation', () => {
    const owner = ownerAt(15);
    const session = new Session(owner.state);
    session.run(addCompanion, { companion: cannon('Flamethrower', owner) });
    session.run(addCompanion, { companion: { ...cannon('Protector', owner), id: 'second' } });
    session.run(startCombat, null);
    session.run(startTurn, null);
    const text = session.run(useCannon, { ids: ['cannon', 'second'], mode: 'activate' });
    expect(text).toContain('Flamethrower');
    expect(text).toContain('Protector');
    expect(session.live.combat!.economy.bonusUsed).toBe(true);
    session.undo();
    expect(session.live.combat!.economy.bonusUsed).toBe(false);
    session.run(useCannon, { ids: ['cannon'], mode: 'detonate' });
    expect(session.live.companions!.cannon).toMatchObject({ status: 'destroyed', hp: 0 });
    session.undo();
    expect(session.live.companions!.cannon).toMatchObject({ status: 'active', hp: 75 });
    expect(session.live.combat!.economy.actionUsed).toBe(false);
  });
});
