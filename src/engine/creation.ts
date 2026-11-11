import { z } from 'zod';
import { AbilityBasesSchema, abilityBaseIssues } from './calc/ability-methods';
export { STANDARD_ARRAY, POINT_BUY_COSTS } from './calc/ability-methods';
import { averageHpRoll, type HitDie } from './calc/hp';
import { xpForLevel } from './calc/advancement';
import { CLASS_START, slotChoices } from './calc/class-start';
import { applyLevelChoices, LevelChoicesSchema } from './calc/level-choices';
import { applyLevelSpells, LevelSpellsSchema, levelSpellGains } from './calc/level-spells';
export { xpForLevel } from './calc/advancement';
import { toolGroupOptions, toolSlots } from './calc/background-choices';
import { computeSheet } from './calc/sheet';
import type { Registry } from './registry';
import { SECONDS_PER_HOUR } from './rules2014';
import {
  AbilitySchema,
  CampaignSchema,
  CharacterBuildSchema,
  LiveStateSchema,
  SCHEMA_VERSION,
  refId,
  SkillSchema,
  type BackgroundDef,
  type Campaign,
  type CharacterBuild,
  type ItemDef,
  type LiveState,
  type LogEvent,
  type RefKind,
} from './schema';

const LevelSchema = z.int().min(1).max(20);

/** Choices a guided build adds to the blank ones: class skills, starting kit and spells. */
export const GuidedChoicesSchema = z.strictObject({
  /** Class skills; the count and list come from the class. */
  skills: z.array(SkillSchema),
  /** Musical instruments (Bard). */
  instruments: z.array(refId('item')).optional(),
  /** One entry per class equipment step: the option picked and the items filling its open slots. */
  equipment: z.array(
    z.strictObject({ option: z.int().min(0), slots: z.array(refId('item')).optional() }),
  ),
  /** Cantrips and spells for the class, as when levelling. */
  spells: LevelSpellsSchema.optional(),
});
export type GuidedChoices = z.infer<typeof GuidedChoicesSchema>;

/** What the player picked from the background's open choices. */
export const BackgroundChoicesSchema = z.strictObject({
  skills: z.array(SkillSchema).optional(),
  languages: z.array(z.string().trim().min(1)).optional(),
  tools: z.array(refId('item')).optional(),
});
export type BackgroundChoices = z.infer<typeof BackgroundChoicesSchema>;

export const CreateCharacterInputSchema = z
  .strictObject({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    campaign: CampaignSchema,
    raceId: refId('race'),
    classId: refId('class'),
    backgroundId: refId('background'),
    alignment: z.string().trim().optional(),
    level: LevelSchema,
    abilityBases: AbilityBasesSchema,
    /** Pick the abilities only; the race supplies their bonus amounts. */
    racialChoices: z.array(AbilitySchema).optional(),
    /** Open choices of the background: extra skills, languages and tools. */
    backgroundChoices: BackgroundChoicesSchema.optional(),
    /** Entries are for levels 2 through N. Level 1 always uses the die maximum. */
    hpRolls: z.array(z.int().positive()).optional(),
    /** Subclass, ability score improvement or feat, expertise and option features picked for levels 1 through N. */
    levelChoices: z
      .array(z.strictObject({ level: LevelSchema, choices: LevelChoicesSchema }))
      .optional(),
    /** Present for a guided build; absent for a blank one. */
    guided: GuidedChoicesSchema.optional(),
  })
  .superRefine(({ campaign, abilityBases }, ctx) => {
    for (const message of abilityBaseIssues(campaign.abilityMethod, abilityBases)) {
      ctx.addIssue({
        code: 'custom',
        path: ['abilityBases'],
        message,
      });
    }
  });

export type CreateCharacterInput = z.input<typeof CreateCharacterInputSchema>;
export interface CreatedCharacter {
  build: CharacterBuild;
  live: LiveState;
  events: LogEvent[];
}

/**
 * Creates a character from choices, with full derived resources. Throws ZodError for
 * invalid input or references. Without `guided`, class skills, spells and equipment stay
 * empty (blank create); with it, the class start table adds proficiencies, skills, kit
 * and spells. Wizard spellbooks above level 1 are filled in steps of two, as when levelling.
 */
export function createCharacter(input: CreateCharacterInput, registry: Registry): CreatedCharacter {
  // Parsing clones nested inputs; no saved record shares mutable choices with the form.
  const choices = CreateCharacterInputSchema.parse(input);
  const { campaign, raceId, classId, backgroundId, level } = choices;
  const race = enabledReference('race', raceId, campaign, registry, ['raceId']);
  const classDef = enabledReference('class', classId, campaign, registry, ['classId']);
  const background = enabledReference('background', backgroundId, campaign, registry, [
    'backgroundId',
  ]);

  const racialChoices = choices.racialChoices ?? [];
  const racialRule = race.abilityChoices;
  if (
    racialChoices.length !== (racialRule?.count ?? 0) ||
    new Set(racialChoices).size !== racialChoices.length ||
    racialChoices.some((ability) => racialRule?.exclude?.includes(ability))
  ) {
    invalid(
      ['racialChoices'],
      `Choose ${racialRule?.count ?? 0} different eligible racial bonus abilities`,
    );
  }

  const die = Number(classDef.hitDie.slice(1)) as HitDie;
  const rolls = choices.hpRolls ?? [];
  if (campaign.hpMethod === 'average' && rolls.length !== 0) {
    invalid(['hpRolls'], 'Average HP uses computed values; do not supply HP rolls');
  }
  if (campaign.hpMethod === 'rolled') {
    if (rolls.length !== level - 1) {
      invalid(['hpRolls'], `Enter one HP roll for each level after 1st (${level - 1} rolls)`);
    }
    rolls.forEach((roll, index) => {
      if (roll > die) invalid(['hpRolls', index], `HP roll must be between 1 and ${die}`);
    });
  }

  const picked = backgroundPicks(background, choices.backgroundChoices, registry, campaign);

  // Validate all fixed grants used by the new build before computing its sheet.
  background.tools.forEach((id) =>
    enabledReference('item', id, campaign, registry, ['backgroundId']),
  );
  race.featureIds.forEach((id) => enabledReference('feature', id, campaign, registry, ['raceId']));
  background.featureIds.forEach((id) =>
    enabledReference('feature', id, campaign, registry, ['backgroundId']),
  );
  classDef.features
    .filter((feature) => feature.level <= level)
    .forEach(({ featureId }) =>
      enabledReference('feature', featureId, campaign, registry, ['classId']),
    );

  const build = CharacterBuildSchema.parse({
    id: choices.id,
    schemaVersion: SCHEMA_VERSION,
    campaignId: campaign.id,
    name: choices.name,
    raceId,
    backgroundId,
    ...(choices.alignment ? { alignment: choices.alignment } : {}),
    classes: [{ classId, level }],
    ...(campaign.leveling === 'xp' ? { xp: xpForLevel(level) } : {}),
    abilityScores: {
      base: choices.abilityBases,
      bonuses: [
        ...race.abilityBonuses.map((bonus) => ({ source: raceId, ...bonus })),
        ...racialChoices.map((ability) => ({ source: raceId, ability, value: racialRule!.value })),
      ],
    },
    hpEntries: Array.from({ length: level }, (_, index) => ({
      level: index + 1,
      classId,
      value:
        index === 0 ? die : campaign.hpMethod === 'average' ? averageHpRoll(die) : rolls[index - 1],
      method: index === 0 ? 'max' : campaign.hpMethod,
      floor: campaign.hpLevelFloor,
    })),
    proficiencies: {
      saves: classDef.saves,
      skills: [...new Set([...background.skills, ...picked.skills])],
      expertise: [],
      armor: [],
      weapons: [],
      tools: [...new Set([...background.tools, ...picked.tools])],
      languages: [...new Set([...race.languages, ...picked.languages])],
    },
    spells: [],
    favorites: [],
    featureIds: [],
    choices: {},
    items: [],
    journal: {},
    overrides: [],
  });
  const live = LiveStateSchema.parse({
    characterId: build.id,
    schemaVersion: SCHEMA_VERSION,
    hp: 0,
    tempHp: 0,
    deathSaves: { success: 0, fail: 0 },
    hitDiceSpent: {},
    slotsUsed: Array<number>(10).fill(0),
    ...(classDef.spellcasting?.progression === 'pact' ? { pactSlotsUsed: 0 } : {}),
    featureUsesSpent: {},
    effects: [],
    conditions: [],
    exhaustion: 0,
    items: {},
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    clock: { seconds: 8 * SECONDS_PER_HOUR },
  });
  if (choices.levelChoices?.length)
    applyLevelPicks(choices.levelChoices, { campaign, build, live, registry, classId });
  if (choices.guided) applyGuided(choices.guided, { campaign, build, live, registry, classId });
  live.hp = computeSheet({ campaign, build, live }, registry).maxHp.value;
  return { build, live: LiveStateSchema.parse(live), events: [] };
}

/** Applies each level's picks in order, as if the character had levelled up one step at a time. */
function applyLevelPicks(
  picks: { level: number; choices: z.infer<typeof LevelChoicesSchema> }[],
  ctx: {
    campaign: Campaign;
    build: CharacterBuild;
    live: LiveState;
    registry: Registry;
    classId: string;
  },
) {
  const { campaign, build, live, registry, classId } = ctx;
  const finalLevel = build.classes[0]!.level;
  const levels = picks.map((pick) => pick.level);
  if (new Set(levels).size !== levels.length || levels.some((level) => level > finalLevel))
    invalid(
      ['levelChoices'],
      'Level choices must be for different levels up to the starting level',
    );
  for (const { level, choices } of [...picks].sort((a, b) => a.level - b.level)) {
    build.classes[0]!.level = level;
    const result = applyLevelChoices({
      campaign,
      build,
      registry,
      score: (ability) =>
        computeSheet({ campaign, build, live }, registry).abilities[ability].score.value,
      classId,
      newLevel: level,
      choices,
    });
    if ('blocked' in result) invalid(['levelChoices', level], result.blocked);
    build.classes = result.build.classes;
    build.abilityScores = result.build.abilityScores;
    build.proficiencies = result.build.proficiencies;
    build.featureIds = result.build.featureIds;
  }
  build.classes[0]!.level = finalLevel;
}

/** Adds class proficiencies, skill picks, starting kit and spells to a new build, in place. */
function applyGuided(
  guided: GuidedChoices,
  ctx: {
    campaign: Campaign;
    build: CharacterBuild;
    live: LiveState;
    registry: Registry;
    classId: string;
  },
) {
  const { campaign, build, live, registry, classId } = ctx;
  const start = CLASS_START[classId];
  if (!start) invalid(['guided'], `No starting choices are defined for ${classId}`);
  const add = <T>(list: T[], values: T[]) => {
    for (const value of values) if (!list.includes(value)) list.push(value);
  };

  // Skills: exactly the class count, from its list, none already known.
  const { skills } = guided;
  if (
    skills.length !== start.skills.count ||
    new Set(skills).size !== skills.length ||
    skills.some(
      (skill) =>
        (start.skills.from !== 'any' && !start.skills.from.includes(skill)) ||
        build.proficiencies.skills.includes(skill),
    )
  ) {
    invalid(
      ['guided', 'skills'],
      `Choose ${start.skills.count} different class skills you do not already have`,
    );
  }
  add(build.proficiencies.skills, skills);
  add(build.proficiencies.armor, start.armor);
  add(build.proficiencies.weapons, start.weapons);
  add(build.proficiencies.tools, start.tools);

  // Instruments
  const instruments = guided.instruments ?? [];
  if (
    instruments.length !== start.instruments ||
    new Set(instruments).size !== instruments.length ||
    instruments.some(
      (id) => registry.entries.get(id)?.kind !== 'item' || !isInstrument(id, registry),
    )
  ) {
    invalid(['guided', 'instruments'], `Choose ${start.instruments} different instruments`);
  }
  add(build.proficiencies.tools, instruments);

  // Equipment
  if (guided.equipment.length !== start.equipment.length)
    invalid(
      ['guided', 'equipment'],
      `Pick an option for each of the ${start.equipment.length} steps`,
    );
  const granted: { itemId: string; quantity: number }[] = [];
  start.equipment.forEach((step, index) => {
    const pick = guided.equipment[index]!;
    const option = step.options[pick.option];
    if (!option) invalid(['guided', 'equipment', index], `Unknown option for ${step.label}`);
    const slots = option.items.filter((entry) => entry.slot);
    const fills = pick.slots ?? [];
    if (fills.length !== slots.length)
      invalid(['guided', 'equipment', index], `${step.label}: fill ${slots.length} open item(s)`);
    let used = 0;
    for (const entry of option.items) {
      let itemId = entry.itemId;
      if (entry.slot) {
        itemId = fills[used++]!;
        if (!slotChoices(entry.slot, registry).includes(itemId))
          invalid(['guided', 'equipment', index], `${itemId} does not fit ${step.label}`);
      }
      granted.push({ itemId: itemId!, quantity: entry.quantity ?? 1 });
    }
  });
  let wornBody = false;
  let wornShield = false;
  granted.forEach(({ itemId, quantity }, index) => {
    const def = registry.get('item', itemId);
    const instanceId = `${build.id}:start:${index + 1}`;
    const shield = def.armor?.category === 'shield';
    const equipped = def.armor !== undefined && (shield ? !wornShield : !wornBody);
    if (equipped) {
      if (shield) wornShield = true;
      else wornBody = true;
    }
    build.items.push({ instanceId, itemId });
    live.items[instanceId] = { qty: quantity, equipped, attuned: false };
  });

  // Spells
  if (guided.spells) {
    const sheet = computeSheet({ campaign, build, live }, registry);
    const base = { campaign, live, sheet, registry };
    const picks = guided.spells;
    // A wizard's spellbook grows two at a time, so feed leveled picks in steps.
    const leveled = (picks.add ?? []).filter((id) => {
      const entry = registry.entries.get(id);
      return entry?.kind === 'spell' && entry.level > 0;
    });
    const cantrips = (picks.add ?? []).filter((id) => !leveled.includes(id));
    const gains = levelSpellGains({ ...base, build }, classId, true);
    const steps: string[][] = [];
    if (gains.mode === 'spellbook') {
      steps.push([...cantrips, ...leveled.slice(0, gains.spells)]);
      for (let at = gains.spells; at < leveled.length; at += 2)
        steps.push(leveled.slice(at, at + 2));
    } else {
      steps.push([...cantrips, ...leveled]);
    }
    let current = build;
    steps.forEach((add, step) => {
      const result = applyLevelSpells({ ...base, build: current }, classId, step === 0, { add });
      if ('blocked' in result) invalid(['guided', 'spells'], result.blocked);
      current = result.build;
    });
    build.spells = current.spells;
  }
}

function isInstrument(id: string, registry: Registry) {
  const entry = registry.entries.get(id);
  return entry?.kind === 'item' && entry.category === 'instrument';
}

function enabledReference<K extends RefKind>(
  kind: K,
  id: string,
  campaign: Campaign,
  registry: Registry,
  path: (string | number)[],
) {
  const entry = registry.entries.get(id);
  if (!entry || entry.kind !== kind) invalid(path, `Unknown ${kind} reference: ${id}`);
  if (entry.ruleset !== campaign.ruleset || !campaign.sources.includes(entry.source)) {
    invalid(path, `${id} is not enabled by this campaign's rules and sources`);
  }
  return registry.get(kind, id);
}

/** Check the picks against what the background offers; blank means none picked yet. */
function backgroundPicks(
  background: BackgroundDef,
  picks: BackgroundChoices | undefined,
  registry: Registry,
  campaign: Campaign,
): { skills: z.infer<typeof SkillSchema>[]; languages: string[]; tools: string[] } {
  const skills = picks?.skills ?? [];
  const languages = picks?.languages ?? [];
  const tools = picks?.tools ?? [];
  const path = ['backgroundChoices'];
  const need = (n: number | undefined, got: unknown[], key: string) => {
    if (got.length !== 0 && got.length !== (n ?? 0))
      invalid([...path, key], `Choose ${n ?? 0} ${key} for this background`);
    if (new Set(got).size !== got.length) invalid([...path, key], `Pick each ${key} entry once`);
  };
  need(background.skillChoices, skills, 'skills');
  need(background.languageChoices, languages, 'languages');
  const slots = toolSlots(background);
  need(slots.length, tools, 'tools');
  const items = [...registry.entries.values()].filter(
    (entry): entry is ItemDef => entry.kind === 'item',
  );
  const allowed = new Set(slots.flatMap((group) => toolGroupOptions(group, items)));
  tools.forEach((id, index) => {
    if (!allowed.has(id))
      invalid([...path, 'tools', index], `${id} is not one of the offered tools`);
    enabledReference('item', id, campaign, registry, [...path, 'tools', index]);
  });
  return { skills, languages, tools };
}

function invalid(path: (string | number)[], message: string): never {
  throw new z.ZodError([{ code: 'custom', path, message }]);
}
