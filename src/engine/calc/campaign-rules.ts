import { characterRegistry, type Registry } from '../registry';
import type { Campaign, CharacterBuild, Source } from '../schema';

export type EncumbranceRule = 'off' | 'standard' | 'variant';
export type RestRule = 'standard' | 'gritty' | 'epic';

/** Campaign optional rules with their defaults filled in. */
export interface OptionalRules {
  feats: boolean;
  multiclassing: boolean;
  /** Tasha's optional class features. */
  optionalClassFeatures: boolean;
  /** Tasha's customizing your origin. */
  customOrigin: boolean;
  /** House rule: drinking a potion yourself is a bonus action. */
  potionBonusAction: boolean;
  encumbrance: EncumbranceRule;
  rests: RestRule;
}

/** Off unless enabled; encumbrance and rests start at the Player's Handbook rule. */
export const OPTIONAL_RULE_DEFAULTS: OptionalRules = {
  feats: false,
  multiclassing: false,
  optionalClassFeatures: false,
  customOrigin: false,
  potionBonusAction: false,
  encumbrance: 'standard',
  rests: 'standard',
};

const ENCUMBRANCE: readonly EncumbranceRule[] = ['off', 'standard', 'variant'];
const RESTS: readonly RestRule[] = ['standard', 'gritty', 'epic'];

function pick<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

/** Reads a campaign's stored rules; missing or unknown values fall back to the defaults. */
export function optionalRules(campaign: Pick<Campaign, 'optionalRules'>): OptionalRules {
  const stored = campaign.optionalRules;
  const flag = (key: keyof OptionalRules) =>
    typeof stored[key] === 'boolean' ? stored[key] : (OPTIONAL_RULE_DEFAULTS[key] as boolean);
  return {
    feats: flag('feats'),
    multiclassing: flag('multiclassing'),
    optionalClassFeatures: flag('optionalClassFeatures'),
    customOrigin: flag('customOrigin'),
    potionBonusAction: flag('potionBonusAction'),
    encumbrance: pick(stored.encumbrance, ENCUMBRANCE, OPTIONAL_RULE_DEFAULTS.encumbrance),
    rests: pick(stored.rests, RESTS, OPTIONAL_RULE_DEFAULTS.rests),
  };
}

export const SOURCE_NAMES: Record<Source, string> = {
  PHB: "Player's Handbook",
  DMG: "Dungeon Master's Guide",
  XGE: "Xanathar's Guide to Everything",
  TCE: "Tasha's Cauldron of Everything",
  HB: 'Homebrew',
};

/** Choices a character keeps from books the campaign no longer enables, by display name. */
export function sourceConflicts(
  campaign: Pick<Campaign, 'sources'> & Partial<Pick<Campaign, 'optionalRules'>>,
  build: CharacterBuild,
  registry: Registry,
): string[] {
  const refs = characterRegistry(registry, build);
  const ids = [
    build.raceId,
    build.subraceId,
    build.backgroundId,
    ...build.classes.flatMap(({ classId, subclassId }) => [classId, subclassId]),
    ...build.spells.flatMap(({ known, prepared }) => [...known, ...(prepared ?? [])]),
    ...build.featureIds,
    ...build.items.map(({ itemId }) => itemId),
  ];
  const notes = new Set<string>();
  for (const id of ids) {
    if (!id) continue;
    const entry = refs.entries.get(id);
    if (!entry || campaign.sources.includes(entry.source)) continue;
    notes.add(`${entry.name} (${entry.source})`);
  }
  if (campaign.optionalRules) {
    const rules = optionalRules({ optionalRules: campaign.optionalRules });
    if (
      !rules.customOrigin &&
      build.abilityScores.bonuses.some(({ source }) => source === 'Custom origin')
    )
      notes.add('Custom origin ability bonuses');
    if (!rules.feats)
      for (const id of build.featureIds) {
        const entry = refs.entries.get(id);
        if (entry?.kind === 'feature' && entry.origin === 'feat') notes.add(`${entry.name} (feat)`);
      }
  }
  return [...notes];
}
