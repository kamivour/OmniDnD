import { z } from 'zod';
import { AbilityBasesSchema, abilityBaseIssues } from './calc/ability-methods';
export { STANDARD_ARRAY, POINT_BUY_COSTS } from './calc/ability-methods';
import { averageHpRoll, type HitDie } from './calc/hp';
import { xpForLevel } from './calc/advancement';
export { xpForLevel } from './calc/advancement';
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
  type Campaign,
  type CharacterBuild,
  type LiveState,
  type LogEvent,
  type RefKind,
} from './schema';

const LevelSchema = z.int().min(1).max(20);

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
    /** Entries are for levels 2 through N. Level 1 always uses the die maximum. */
    hpRolls: z.array(z.int().positive()).optional(),
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
 * Creates a blank character from choices, with full derived resources. Throws ZodError
 * for invalid input or references. Class skill, spell and equipment choices stay empty
 * until the guided builder exists; fixed grants come from the registry.
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
      skills: background.skills,
      expertise: [],
      armor: [],
      weapons: [],
      tools: background.tools,
      languages: race.languages,
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
  live.hp = computeSheet({ campaign, build, live }, registry).maxHp.value;
  return { build, live: LiveStateSchema.parse(live), events: [] };
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

function invalid(path: (string | number)[], message: string): never {
  throw new z.ZodError([{ code: 'custom', path, message }]);
}
