import type { CharacterState, Sheet } from '../../engine/calc/sheet';
import { ancestryPick } from '../../engine/calc/ancestry';
import { featureUseDetails } from '../../engine/commands';
import type { Registry } from '../../engine/registry';
import type { FeatureDef, Recharge } from '../../engine/schema';

export type FeatureOrigin = FeatureDef['origin'];

/** Display order and headings (SPEC Features). Temporary grants arrive with the M10 effects editor. */
export const ORIGIN_GROUPS: { origin: FeatureOrigin; title: string }[] = [
  { origin: 'race', title: 'Race' },
  { origin: 'class', title: 'Class' },
  { origin: 'subclass', title: 'Subclass' },
  { origin: 'background', title: 'Background' },
  { origin: 'feat', title: 'Feats' },
  { origin: 'item', title: 'Equipment' },
  { origin: 'homebrew', title: 'Homebrew' },
];

export type FeatureKind = 'passive' | 'active' | 'triggered' | 'special';

const ACTIVATION: Record<FeatureDef['activation'], { kind: FeatureKind; label: string }> = {
  passive: { kind: 'passive', label: 'Passive' },
  action: { kind: 'active', label: 'Action' },
  bonus: { kind: 'active', label: 'Bonus action' },
  free: { kind: 'active', label: 'No action' },
  reaction: { kind: 'triggered', label: 'Reaction' },
  special: { kind: 'special', label: 'Special' },
};

export const RECHARGE_LABEL: Record<Recharge, string> = {
  short: 'Short or long rest',
  long: 'Long rest',
  dawn: 'Dawn',
  none: 'No recharge',
};

export interface FeatureEntry {
  id: string;
  name: string;
  /** Where it comes from: "Bard 3", "Wood Elf", "Added to build". */
  from: string;
  kind: FeatureKind;
  activation: string;
  trigger?: string;
  /** Own-words summary when present; otherwise SRD text paragraphs. */
  lines: string[];
  summarized: boolean;
  /** Feeds sheet calculations (modifiers or defenses). */
  automatic: boolean;
  die?: string;
  /** This feature's own pool. Shared-use features name their pool instead. */
  ownPool?: { max: number; used: number; recharge: string };
  sharedPool?: { name: string; remaining: number; max: number };
  /** Use is offered for active and triggered features, and anything that spends uses. */
  usable: boolean;
  unavailableReason?: string;
  favorite: boolean;
  /** Saved spell or proficiency picks that can be changed in To do. */
  changePicks?: 'feat-spells' | 'proficiencies';
}

/** Who granted each feature, matching the order `characterFeatures` reads them. */
function grantLabels(build: CharacterState['build'], registry: Registry) {
  const labels = new Map<string, string>();
  const add = (id: string, label: string) => {
    if (!labels.has(id)) labels.set(id, label);
  };
  const race = registry.get('race', build.subraceId ?? build.raceId);
  race.featureIds.forEach((id) => add(id, race.name));
  const background = registry.get('background', build.backgroundId);
  background.featureIds.forEach((id) => add(id, background.name));
  for (const { classId, subclassId } of build.classes) {
    const cls = registry.get('class', classId);
    for (const row of cls.features) add(row.featureId, `${cls.name} ${row.level}`);
    if (subclassId) {
      const sub = registry.get('subclass', subclassId);
      for (const row of sub.features) add(row.featureId, `${sub.name} ${row.level}`);
    }
  }
  build.featureIds.forEach((id) => add(id, 'Added to build'));
  return labels;
}

const ABILITY_NAME = {
  STR: 'Strength',
  DEX: 'Dexterity',
  CON: 'Constitution',
  INT: 'Intelligence',
  WIS: 'Wisdom',
  CHA: 'Charisma',
} as const;

/** Computed lines for draconic ancestry picks, Breath Weapon and Elemental Affinity. */
function ancestryLines(def: FeatureDef, sheet: Sheet): string[] {
  if (def.ancestry)
    return [
      [
        `Damage type: ${def.ancestry.type}`,
        def.ancestry.area,
        def.ancestry.save && `${ABILITY_NAME[def.ancestry.save]} save`,
      ]
        .filter(Boolean)
        .join(' · ') + '.',
    ];
  if (def.breath) {
    const breath = sheet.breathWeapon;
    return [
      breath
        ? `DC ${breath.dc} ${ABILITY_NAME[breath.save]} save · ${breath.area} · ${breath.dice} ${breath.type}, half on a success.`
        : 'Pick a Draconic Ancestry on the To do screen to set the area and damage type.',
    ];
  }
  if (def.affinity) {
    const type = ancestryPick(sheet.features, 'subclass')?.type;
    const bonus = sheet.abilities[def.affinity.ability].mod;
    return type
      ? [
          `${type[0]!.toUpperCase()}${type.slice(1)} spells: add ${bonus >= 0 ? '+' : ''}${bonus} to one damage roll. Use spends 1 sorcery point for an hour of ${type} resistance.`,
        ]
      : [];
  }
  return [];
}

export function featuresModel(
  state: CharacterState,
  sheet: Sheet,
  registry: Registry,
): { origin: FeatureOrigin; title: string; entries: FeatureEntry[] }[] {
  const labels = grantLabels(state.build, registry);
  const favorites = new Set(state.build.favorites);
  const entries = sheet.features.map(({ def, dice, bonus }): FeatureEntry => {
    // Level-scaled value shown beside the feature: a die, a dice count or a flat bonus.
    const details = featureUseDetails({ live: state.live, sheet }, def.id);
    const { kind, label } = ACTIVATION[def.activation];
    const shared = details.poolId !== def.id;
    const lines = [
      ...ancestryLines(def, sheet),
      ...(def.summary
        ? [def.summary.effect]
        : (def.fullText?.split(/\n\s*\n/).filter(Boolean) ?? [])),
    ];
    const usable =
      kind === 'active' || kind === 'triggered' || !!details.uses || details.tempHp !== undefined;
    const dieText =
      details.die && details.dieBonus !== undefined
        ? `${details.die} + ${details.dieBonus}`
        : details.die;
    return {
      id: def.id,
      name: def.name,
      from: labels.get(def.id) ?? 'Added to build',
      kind,
      activation: label,
      ...(def.trigger ? { trigger: def.trigger } : {}),
      lines,
      summarized: !!def.summary,
      automatic: !!(def.modifiers?.length || def.defenses),
      ...(dieText || dice || bonus !== undefined ? { die: dieText ?? dice ?? `+${bonus}` } : {}),
      ...(details.uses && !shared
        ? {
            ownPool: {
              max: details.uses.max,
              used: details.uses.spent,
              recharge: RECHARGE_LABEL[details.uses.recharge],
            },
          }
        : {}),
      ...(details.uses && shared
        ? {
            sharedPool: {
              name: details.pool!.def.name,
              remaining: details.uses.remaining,
              max: details.uses.max,
            },
          }
        : {}),
      usable,
      ...(usable && details.unavailableReason
        ? { unavailableReason: details.unavailableReason }
        : {}),
      favorite: favorites.has(def.id),
      ...(state.build.featSpells?.[def.id]
        ? { changePicks: 'feat-spells' as const }
        : state.build.proficiencyPicks?.[def.id]
          ? { changePicks: 'proficiencies' as const }
          : {}),
    };
  });
  return ORIGIN_GROUPS.map(({ origin, title }) => ({
    origin,
    title,
    entries: entries.filter((entry) => registry.get('feature', entry.id).origin === origin),
  })).filter(({ entries }) => entries.length > 0);
}
