import type { CharacterState, Sheet } from '../../engine/calc/sheet';
import { featureUseDetails } from '../../engine/commands';
import type { Registry } from '../../engine/registry';
import type { HitDieName } from '../../engine/schema';
import { combatModel } from '../combat/combat-model';
import { spellbookModel } from '../spells/spellbook-model';

export type DashboardResource = (
  | { kind: 'slot'; level: number | 'pact' }
  | { kind: 'feature'; featureId: string }
  | { kind: 'hit-die'; die: HitDieName }
) & {
  key: string;
  label: string;
  name: string;
  max: number;
  used: number;
  tone: 'magic' | 'accent';
  lines: string[];
};

export type DashboardQuickEntry = { key: string; id: string; name: string } & (
  | { kind: 'spell'; classId: string }
  | { kind: 'feature'; featureId: string; actionable: boolean }
  | { kind: 'weapon'; instanceId: string }
  | { kind: 'item'; instanceId: string }
  | { kind: 'unavailable'; reason: string }
);

export interface DashboardFavoriteChoice {
  id: string;
  name: string;
  note?: string;
}

const RECHARGE = {
  short: 'Uses return after a short or long rest.',
  long: 'Uses return after a long rest.',
  dawn: 'Uses return at dawn.',
  none: 'This resource has no automatic recharge.',
};

function remaining(max: number, used: number): string {
  return `${Math.max(0, max - used)} of ${max} left.`;
}

/** Resource maximums and ownership come from the engine; imported spent values stay intact. */
export function dashboardResources(
  state: CharacterState,
  sheet: Sheet,
  registry: Registry,
): { title: string; items: DashboardResource[] }[] {
  const slots: DashboardResource[] = spellbookModel(state, sheet, registry).slots.map(
    ({ level, max, used }) => ({
      kind: 'slot',
      key: `slot:${level}`,
      level,
      label: `Level ${level}`,
      name: `Level ${level} spell slots`,
      max,
      used,
      tone: 'magic',
      lines: [
        remaining(max, used),
        'Spend a slot to cast a spell of that level or lower.',
        'Spell slots return after a long rest.',
      ],
    }),
  );
  const pact = sheet.slots.pact;
  if (pact) {
    const used = state.live.pactSlotsUsed ?? 0;
    slots.push({
      kind: 'slot',
      key: 'slot:pact',
      level: 'pact',
      label: `Pact Magic (level ${pact.level})`,
      name: 'Pact Magic slots',
      max: pact.count,
      used,
      tone: 'magic',
      lines: [
        remaining(pact.count, used),
        `These slots cast spells at level ${pact.level}.`,
        'Pact Magic slots return after a short or long rest.',
      ],
    });
  }
  const features: DashboardResource[] = sheet.features.flatMap(({ def, uses }) => {
    // A shared-use feature such as Cutting Words does not create another pool.
    if (!uses || def.usesFrom) return [];
    const details = featureUseDetails({ live: state.live, sheet }, def.id);
    const used = state.live.featureUsesSpent[def.id] ?? 0;
    const lines = def.summary
      ? [def.summary.effect]
      : (def.fullText?.split(/\n\s*\n/).filter(Boolean) ?? []);
    return [
      {
        kind: 'feature',
        key: `feature:${def.id}`,
        featureId: def.id,
        label: `${def.name}${details.die ? ` (${details.die})` : ''}`,
        name: def.name,
        max: uses.max,
        used,
        tone: 'accent',
        lines: [...lines, remaining(uses.max, used), RECHARGE[uses.recharge]],
      },
    ];
  });
  const hitDice: DashboardResource[] = sheet.hitDice.map(({ die, max }) => {
    const used = state.live.hitDiceSpent[die] ?? 0;
    return {
      kind: 'hit-die',
      key: `hit-die:${die}`,
      die,
      label: `${die} Hit Dice`,
      name: `${die} Hit Dice`,
      max,
      used,
      tone: 'accent',
      lines: [
        remaining(max, used),
        'Spend Hit Dice during a short rest to regain HP, adding CON to each roll.',
        'A long rest restores up to half your total Hit Dice, with a minimum of one.',
      ],
    };
  });
  return [
    { title: 'Spell slots', items: slots },
    { title: 'Features & traits', items: features },
    { title: 'Hit Dice', items: hitDice },
  ];
}

function supportedFavorite(id: string): boolean {
  return /^(spell|feature|item)\./.test(id);
}

function unavailable(id: string, name: string, reason: string): DashboardQuickEntry {
  return { key: `unavailable:${id}`, id, name, kind: 'unavailable', reason };
}

/** A favorite is a reference; spell classes and concrete item instances retain their identity. */
export function dashboardQuickAccess(
  state: CharacterState,
  sheet: Sheet,
  registry: Registry,
): DashboardQuickEntry[] {
  const combat = combatModel(state, sheet, registry);
  const actionable = new Set(combat.features.map(({ feature }) => feature.id));
  const weapons = new Set(combat.weapons.map(({ instanceId }) => instanceId));
  const ownedFeatures = new Set(sheet.features.map(({ def }) => def.id));
  return [...new Set(state.build.favorites)].flatMap((id): DashboardQuickEntry[] => {
    if (!supportedFavorite(id)) return [];
    const def = registry.entries.get(id);
    if (!def) return [unavailable(id, id, 'This reference is unavailable')];
    if (def.kind === 'spell') {
      const entries = combat.spells.entries.filter(({ spell }) => spell.id === id);
      if (entries.length === 0) return [unavailable(id, def.name, 'This spell is not selected')];
      return entries.map(({ classId }) => ({
        kind: 'spell',
        key: `spell:${classId}:${id}`,
        id,
        name: `${def.name}${entries.length > 1 ? ` (${registry.get('class', classId).name})` : ''}`,
        classId,
      }));
    }
    if (def.kind === 'feature') {
      return ownedFeatures.has(id)
        ? [
            {
              kind: 'feature',
              key: `feature:${id}`,
              id,
              name: def.name,
              featureId: id,
              actionable: actionable.has(id),
            },
          ]
        : [unavailable(id, def.name, 'You do not have this feature')];
    }
    if (def.kind === 'item') {
      const owned = state.build.items.filter(({ itemId }) => itemId === id);
      const available = owned.filter(
        ({ instanceId }) => (state.live.items[instanceId]?.qty ?? 0) > 0,
      );
      if (available.length === 0)
        return [
          unavailable(
            id,
            def.name,
            owned.length > 0 ? 'No owned quantity available' : 'You do not own this item',
          ),
        ];
      return available.map(({ instanceId }) => ({
        kind: weapons.has(instanceId) ? 'weapon' : 'item',
        key: `item:${instanceId}`,
        id,
        name: `${def.name}${available.length > 1 ? ` (${instanceId})` : ''}`,
        instanceId,
      }));
    }
    return [];
  });
}

/** Includes retained favorites so replacing spells or losing gear never hides explicit cleanup. */
export function dashboardFavoriteChoices(
  state: CharacterState,
  sheet: Sheet,
  registry: Registry,
): DashboardFavoriteChoice[] {
  const spells = spellbookModel(state, sheet, registry).entries.map(({ spell }) => spell.id);
  const features = sheet.features.map(({ def }) => def.id);
  const items = state.build.items.map(({ itemId }) => itemId);
  const selectedSpells = new Set(spells);
  const ownedFeatures = new Set(features);
  const ownedItems = new Set(items);
  return [
    ...new Set([
      ...spells,
      ...features,
      ...items,
      ...state.build.favorites.filter(supportedFavorite),
    ]),
  ].map((id) => {
    const def = registry.entries.get(id);
    let note: string | undefined;
    if (!def) note = 'Unavailable reference';
    else if (def.kind === 'spell' && !selectedSpells.has(id)) note = 'Not selected';
    else if (def.kind === 'feature' && !ownedFeatures.has(id)) note = 'Not owned';
    else if (def.kind === 'item') {
      if (!ownedItems.has(id)) note = 'Not owned';
      else if (
        !state.build.items.some(
          ({ itemId, instanceId }) => itemId === id && (state.live.items[instanceId]?.qty ?? 0) > 0,
        )
      )
        note = 'No quantity available';
    }
    return { id, name: def?.name ?? id, ...(note ? { note } : {}) };
  });
}
