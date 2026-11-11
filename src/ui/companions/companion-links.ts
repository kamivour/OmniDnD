import type { Companion } from '../../engine/schema';

/**
 * Features and spells that bring a creature into play. Their cards get a Stats button that opens
 * the creature on the Companions screen: the existing one, or the add form pre-filled.
 */
export interface CompanionLink {
  key: string;
  /** Template label the add form starts from; absent means the player picks one. */
  template?: string;
  /** Matches an existing companion by its limit key. Summons that pick a creature never match. */
  limitKey?: string;
}

const LINKS: Record<string, CompanionLink> = {
  'feature.artificer.battle-smith-steel-defender': {
    key: 'steel-defender',
    template: 'Steel Defender',
    limitKey: 'steel-defender',
  },
  'feature.artificer.artillerist-eldritch-cannon': {
    key: 'eldritch-cannon',
    template: 'Eldritch Cannon',
    limitKey: 'eldritch-cannon',
  },
  'spell.find-familiar': { key: 'familiar', limitKey: 'familiar' },
  'spell.find-steed': { key: 'steed' },
};

/** Conjure spells and Tasha's Summon spells offer a creature to pick (Q43). */
const SUMMON_SPELL = /^spell\.(conjure|summon)-/;

export function companionLink(refId: string): CompanionLink | undefined {
  return LINKS[refId] ?? (SUMMON_SPELL.test(refId) ? { key: 'summon' } : undefined);
}

export function linkByKey(key: string | null): CompanionLink | undefined {
  if (!key) return undefined;
  return (
    Object.values(LINKS).find((link) => link.key === key) ??
    (key === 'summon' ? { key: 'summon' } : undefined)
  );
}

/** The companion this link already has in play, if any. */
export function existingCompanion(
  link: CompanionLink,
  companions: readonly Companion[],
): Companion | undefined {
  return link.limitKey ? companions.find((c) => c.limit?.key === link.limitKey) : undefined;
}
