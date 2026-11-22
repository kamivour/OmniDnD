import type { Registry } from '../../engine/registry';
import type { PendingChoice } from '../../engine/calc/pending-choices';
import { computeSheet, type CharacterState } from '../../engine/calc/sheet';
import { skillName } from '../format';

export interface SavedChoice {
  /** `feat-spells:<featureId>` or `proficiencies:<featureId>`; also the `?change=` value. */
  id: string;
  kind: 'feat-spells' | 'proficiencies';
  featureId: string;
  name: string;
  summary: string;
}

/**
 * Spell and proficiency picks already saved for features the character still has, so they
 * can be changed later. Picks that still show as an open To do item are left out.
 */
export function savedChoices(
  state: CharacterState,
  registry: Registry,
  open: readonly PendingChoice[],
): SavedChoice[] {
  const owned = new Set(computeSheet(state, registry).features.map((row) => row.def.id));
  const openIds = new Set(open.map((item) => `${item.kind}:${item.featureId}`));
  const nameOf = (id: string) => registry.entries.get(id)?.name ?? id;
  const rows: SavedChoice[] = [];
  for (const [featureId, pick] of Object.entries(state.build.featSpells ?? {}))
    rows.push({
      id: `feat-spells:${featureId}`,
      kind: 'feat-spells',
      featureId,
      name: nameOf(featureId),
      summary: pick.spellIds.map(nameOf).join(', '),
    });
  for (const [featureId, pick] of Object.entries(state.build.proficiencyPicks ?? {}))
    rows.push({
      id: `proficiencies:${featureId}`,
      kind: 'proficiencies',
      featureId,
      name: nameOf(featureId),
      summary: [
        ...(pick.skills ?? []).map(skillName),
        ...(pick.tools ?? []).map(nameOf),
        ...(pick.weapons ?? []).map(nameOf),
        ...(pick.languages ?? []),
        ...(pick.expertise ?? []).map((skill) => `${skillName(skill)} expertise`),
        ...(pick.darkvision ? ['Darkvision 60 ft'] : []),
      ].join(', '),
    });
  return rows
    .filter((row) => owned.has(row.featureId) && !openIds.has(row.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}
