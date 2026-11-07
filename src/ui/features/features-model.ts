import type { CharacterState, Sheet } from '../../engine/calc/sheet';
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
    const lines = def.summary
      ? [def.summary.effect]
      : (def.fullText?.split(/\n\s*\n/).filter(Boolean) ?? []);
    const usable = kind === 'active' || kind === 'triggered' || !!details.uses;
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
      ...(details.die || dice || bonus !== undefined
        ? { die: details.die ?? dice ?? `+${bonus}` }
        : {}),
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
    };
  });
  return ORIGIN_GROUPS.map(({ origin, title }) => ({
    origin,
    title,
    entries: entries.filter((entry) => registry.get('feature', entry.id).origin === origin),
  })).filter(({ entries }) => entries.length > 0);
}
