import { z } from 'zod';
import forms from '../../../data/content/companion-forms.json';
import {
  CompanionProfileSchema,
  CompanionSchema,
  DamageTypeSchema,
  type Companion,
  type CompanionProfile,
} from '../schema';
import type { CompanionOwner } from './companions';

const AttackSpec = z.object({
  name: z.string(),
  dice: z.string(),
  flat: z.number(),
  type: DamageTypeSchema,
  range: z.string().optional(),
  note: z.string().optional(),
});
const SpellSpec = z.object({
  ruleset: z.literal('5e-2014'),
  source: z.enum(['TCE', 'FTD']),
  family: CompanionProfileSchema.shape.family,
  name: z.string(),
  kind: z.string(),
  level: z.number(),
  ac: z.number(),
  hp: z.number(),
  hpPerLevel: z.number(),
  abilities: z.array(z.number()).length(6),
  attack: AttackSpec,
  traits: z.array(z.string()),
  uses: CompanionSchema.shape.uses.optional(),
  forms: z.array(
    z.object({
      name: z.string(),
      hp: z.number().optional(),
      acBonus: z.number().optional(),
      speed: CompanionSchema.shape.speed,
      attack: AttackSpec.optional(),
      traits: z.array(z.string()),
    }),
  ),
});

/** Own-words 2014 summaries; deliberately separate from the reference spell registry. */
export const SUMMON_PROFILES = z.array(SpellSpec).parse(forms);
export const CANNON_FORMS = ['Flamethrower', 'Force Ballista', 'Protector'] as const;
const CANNON_SOURCE = 'feature.artificer.artillerist-eldritch-cannon';
export const classLevel = (owner: CompanionOwner, classId: string) =>
  owner.build.classes.find((entry) => entry.classId === classId)?.level ?? 0;
export const cannonSaveDc = (owner: CompanionOwner) =>
  owner.sheet.spellcasting.find((entry) => entry.classId === 'class.artificer')?.saveDc.value ??
  8 + owner.sheet.proficiency + owner.sheet.abilities.INT.mod;

export function profileForSource(sourceId?: string): CompanionProfile['family'] | undefined {
  if (sourceId === CANNON_SOURCE) return 'eldritch-cannon';
  return SUMMON_PROFILES.find((spec) => `spell.summon-${spec.family}` === sourceId)?.family;
}

export function profileForms(family: CompanionProfile['family']): readonly string[] {
  return family === 'eldritch-cannon'
    ? CANNON_FORMS
    : (SUMMON_PROFILES.find((spec) => spec.family === family)?.forms.map((form) => form.name) ??
        []);
}

export function profileMinimumLevel(family: CompanionProfile['family']): number | undefined {
  return SUMMON_PROFILES.find((spec) => spec.family === family)?.level;
}

export function profileError(profile: CompanionProfile): string | undefined {
  if (!profileForms(profile.family).includes(profile.form)) return 'Choose a companion form.';
  const min = profileMinimumLevel(profile.family);
  if (min !== undefined && (profile.spellLevel === undefined || profile.spellLevel < min))
    return `Choose a spell slot level from ${min} to 9.`;
}

function spellStats(owner: CompanionOwner, classId?: string) {
  const choices = owner.sheet.spellcasting.filter((entry) => !classId || entry.classId === classId);
  return choices.reduce<{ attack: number; dc: number }>(
    (best, entry) =>
      entry.attack.value > best.attack
        ? { attack: entry.attack.value, dc: entry.saveDc.value }
        : best,
    { attack: -Infinity, dc: 8 },
  );
}

/** Rebuild only explicitly configured companions. Legacy/custom definitions stay untouched. */
export function resolveCompanion(companion: Companion, owner: CompanionOwner): Companion {
  const profile = companion.profile;
  if (!profile || profileError(profile)) return companion;
  const { form } = profile;
  if (profile.family === 'eldritch-cannon') {
    const level = classLevel(owner, 'class.artificer');
    const intelligence = owner.sheet.abilities.INT.mod;
    const dc = cannonSaveDc(owner);
    const dice = level >= 9 ? '3d8' : '2d8';
    const effect =
      form === 'Flamethrower'
        ? `15-ft cone; Dexterity save DC ${dc}: ${dice} fire, half on success. Unattended flammable objects ignite.`
        : form === 'Protector'
          ? `Itself and chosen creatures within 10 ft gain 1d8+${Math.max(1, intelligence)} temporary HP. Roll once; record recipients manually.`
          : `Ranged spell attack within 120 ft for ${dice} force. On a hit, push a creature up to 5 ft away; the player records the outcome.`;
    return {
      ...companion,
      kind: `${profile.size ?? 'Small'} magical object`,
      ac: 18,
      maxHp: { ownerLevel: 5, classId: 'class.artificer' },
      speed: profile.legs === false ? {} : { walk: 15, climb: 15 },
      abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      attacks:
        form === 'Force Ballista'
          ? [
              {
                name: 'Force Ballista',
                bonus: { ownerSpellAttack: true, classId: 'class.artificer' },
                damage: { dice, type: 'force' },
                range: '120 ft.',
                note: 'On a hit, a creature can be pushed up to 5 ft away.',
              },
            ]
          : [],
      actions: [{ name: form, cost: 'bonus', effect }],
      traits: [
        'Immune to poison and psychic damage. Mending restores 2d6 HP; record the roll manually.',
        'Activate within 60 ft as your bonus action; the same activation can move it up to 15 ft if it has legs.',
        ...(level >= 9
          ? [
              `Detonate (action, within 60 ft): destroys this cannon; creatures within 20 ft make Dexterity saves DC ${dc}, taking 3d8 force or half on success.`,
            ]
          : []),
        ...(level >= 15
          ? [
              'You and allies within 10 ft have half cover. Both cannons can activate with one bonus action.',
            ]
          : []),
      ],
      uses: [],
      limit: { key: 'eldritch-cannon', max: level >= 15 ? 2 : 1 },
      durationSeconds: 3600,
      sourceId: CANNON_SOURCE,
    };
  }
  const spec = SUMMON_PROFILES.find((entry) => entry.family === profile.family)!;
  const choice = spec.forms.find((entry) => entry.name === form)!;
  const level = profile.spellLevel!;
  const attack = choice.attack ?? spec.attack;
  const caster = spellStats(owner, profile.castingClassId);
  const abilities = Object.fromEntries(
    ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map((ability, index) => [
      ability,
      spec.abilities[index],
    ]),
  ) as Companion['abilities'];
  const spellId = `spell.summon-${spec.family}`;
  return {
    ...companion,
    type: 'summon',
    kind: spec.kind,
    ac: spec.ac + level + (choice.acBonus ?? 0),
    maxHp: (choice.hp ?? spec.hp) + spec.hpPerLevel * (level - spec.level),
    speed: choice.speed,
    abilities,
    attacks: [
      {
        name: attack.name,
        bonus: {
          ownerSpellAttack: true,
          ...(profile.castingClassId && { classId: profile.castingClassId }),
        },
        damage: { dice: attack.dice, bonus: attack.flat + level, type: attack.type },
        range: attack.range ?? '5 ft.',
        ...(attack.note && { note: attack.note }),
      },
    ],
    actions: [],
    traits: [
      ...(spec.source === 'FTD'
        ? ["Source: Fizban's Treasury of Dragons (2014 rules); check your campaign allows it."]
        : []),
      ...spec.traits,
      ...choice.traits,
      `Spell save DC ${caster.dc}; ${Math.floor(level / 2)} attacks per Attack action${profile.family === 'draconic-spirit' ? ', plus its breath' : ''}.`,
      'Verbal commands cost none of your actions; it acts immediately after your turn. Concentration is required.',
    ],
    uses: spec.uses ?? [],
    limit: { key: spellId, max: 1 },
    sourceId: spellId,
    durationSeconds: 3600,
  };
}
