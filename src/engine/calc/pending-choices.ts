import type { Registry } from '../registry';
import type { Source } from '../schema';
import { asiLevels } from './level-choices';
import { computeSheet, type CharacterState } from './sheet';
import { spellSelectionDetails } from './spell-selections';

export type PendingKind =
  | 'subclass'
  | 'asi'
  | 'option'
  | 'expertise'
  | 'cantrips'
  | 'spells-known'
  | 'spellbook'
  | 'prepared';

/** One decision a character still has to make. */
export interface PendingChoice {
  /** Stable while the item stays open, so a dismissed item stays dismissed. */
  id: string;
  kind: PendingKind;
  classId: string;
  label: string;
  /** How many picks are open. */
  count: number;
  /** Optional items (preparing spells) can be dismissed. */
  optional: boolean;
  /** `choices` opens the class-choice form; `spells` opens the Spellbook. */
  area: 'choices' | 'spells';
  /** For `option`: the option features to pick from. */
  prefix?: string;
}

interface OptionFamily {
  classId: string;
  /** Only characters of this subclass pick from the family. */
  subclassId?: string;
  label: string;
  /** Option features share this id prefix. */
  prefix: string;
  /** [class level, total picks from that level on], PHB 2014. */
  totals: [number, number][];
}

/** Class features that make the player pick from a list of option features. */
export const OPTION_FAMILIES: OptionFamily[] = [
  {
    classId: 'class.fighter',
    label: 'Fighting Style',
    prefix: 'feature.fighter.fighting-style-',
    totals: [[1, 1]],
  },
  {
    classId: 'class.paladin',
    label: 'Fighting Style',
    prefix: 'feature.paladin.fighting-style-',
    totals: [[2, 1]],
  },
  {
    classId: 'class.ranger',
    label: 'Fighting Style',
    prefix: 'feature.ranger.fighting-style-',
    totals: [[2, 1]],
  },
  {
    classId: 'class.sorcerer',
    label: 'Metamagic',
    prefix: 'feature.sorcerer.metamagic-',
    totals: [
      [3, 2],
      [10, 3],
      [17, 4],
    ],
  },
  {
    classId: 'class.warlock',
    label: 'Eldritch Invocations',
    prefix: 'feature.warlock.eldritch-invocation-',
    totals: [
      [2, 2],
      [5, 3],
      [7, 4],
      [9, 5],
      [12, 6],
      [15, 7],
      [18, 8],
    ],
  },
  {
    classId: 'class.warlock',
    label: 'Pact Boon',
    prefix: 'feature.warlock.pact-of-the-',
    totals: [[3, 1]],
  },
  {
    classId: 'class.artificer',
    label: 'Infusions',
    prefix: 'feature.artificer.infusion-',
    totals: [
      [2, 4],
      [6, 6],
      [10, 8],
      [14, 10],
      [18, 12],
    ],
  },
  {
    classId: 'class.fighter',
    subclassId: 'subclass.fighter.battle-master',
    label: 'Maneuvers',
    prefix: 'feature.fighter.maneuver-',
    totals: [
      [3, 3],
      [7, 5],
      [10, 7],
      [15, 9],
    ],
  },
  {
    classId: 'class.monk',
    subclassId: 'subclass.monk.four-elements',
    label: 'Elemental Disciplines',
    prefix: 'feature.monk.discipline-',
    totals: [
      [3, 1],
      [6, 2],
      [11, 3],
      [17, 4],
    ],
  },
  {
    classId: 'class.barbarian',
    subclassId: 'subclass.barbarian.totem-warrior',
    label: 'Totem Spirit',
    prefix: 'feature.barbarian.totem-spirit-',
    totals: [[3, 1]],
  },
  {
    classId: 'class.barbarian',
    subclassId: 'subclass.barbarian.totem-warrior',
    label: 'Aspect of the Beast',
    prefix: 'feature.barbarian.totem-aspect-',
    totals: [[6, 1]],
  },
  {
    classId: 'class.barbarian',
    subclassId: 'subclass.barbarian.totem-warrior',
    label: 'Totemic Attunement',
    prefix: 'feature.barbarian.totem-attunement-',
    totals: [[14, 1]],
  },
];

/** Skills (or tools) with double proficiency: Rogue 1 and 6, Bard 3 and 10. */
export const EXPERTISE_TOTALS: Record<string, [number, number][]> = {
  'class.rogue': [
    [1, 2],
    [6, 4],
  ],
  'class.bard': [
    [3, 2],
    [10, 4],
  ],
};

const totalAt = (totals: [number, number][], level: number) =>
  totals.reduce((sum, [from, total]) => (level >= from ? total : sum), 0);

/**
 * What the character still has to decide, from the build alone. It only lists things the data
 * can verify; table rulings and homebrew choices are never guessed.
 */
export function pendingChoices(state: CharacterState, registry: Registry): PendingChoice[] {
  const { build, campaign } = state;
  const className = (id: string) => registry.entries.get(id)?.name ?? id;
  const enabled = (source: Source) => campaign.sources.includes(source);
  const items: PendingChoice[] = [];

  for (const entry of build.classes) {
    const def = registry.entries.get(entry.classId);
    if (def?.kind !== 'class') continue;
    const name = def.name;

    const hasSubclasses = [...registry.entries.values()].some(
      (row) => row.kind === 'subclass' && row.classId === entry.classId && enabled(row.source),
    );
    if (hasSubclasses && entry.subclassId === undefined && entry.level >= def.subclassLevel)
      items.push({
        id: `subclass:${entry.classId}`,
        kind: 'subclass',
        classId: entry.classId,
        label: `Choose a ${name} subclass`,
        count: 1,
        optional: false,
        area: 'choices',
      });

    for (const family of OPTION_FAMILIES.filter(
      (row) =>
        row.classId === entry.classId &&
        (row.subclassId === undefined || row.subclassId === entry.subclassId),
    )) {
      const options = [...registry.entries.values()].filter(
        (row) => row.kind === 'feature' && row.id.startsWith(family.prefix) && enabled(row.source),
      );
      const taken = build.featureIds.filter((id) => id.startsWith(family.prefix)).length;
      const open = Math.min(totalAt(family.totals, entry.level) - taken, options.length - taken);
      if (open > 0)
        items.push({
          id: `option:${family.prefix}`,
          kind: 'option',
          classId: entry.classId,
          label: `${family.label}: pick ${open}`,
          count: open,
          optional: false,
          area: 'choices',
          prefix: family.prefix,
        });
    }

    const expertise = EXPERTISE_TOTALS[entry.classId];
    if (expertise) {
      const open = totalAt(expertise, entry.level) - build.proficiencies.expertise.length;
      if (open > 0)
        items.push({
          id: `expertise:${entry.classId}`,
          kind: 'expertise',
          classId: entry.classId,
          label: `Expertise: pick ${open}`,
          count: open,
          optional: false,
          area: 'choices',
        });
    }
  }

  // Ability score improvements: earned at class levels, spent by ASI or feat picks.
  const earned = build.classes.reduce(
    (sum, entry) => sum + asiLevels(entry.classId).filter((at) => at <= entry.level).length,
    0,
  );
  const spentAsi = new Set(
    build.abilityScores.bonuses
      .map((bonus) => bonus.source)
      .filter((source) => source.startsWith('ASI: ')),
  ).size;
  const spentFeats = build.featureIds.filter((id) => {
    const row = registry.entries.get(id);
    return row?.kind === 'feature' && row.origin === 'feat';
  }).length;
  const asiOpen = earned - spentAsi - spentFeats;
  if (asiOpen > 0)
    items.push({
      id: 'asi',
      kind: 'asi',
      classId: build.classes[0]?.classId ?? '',
      label: `Ability score improvement or feat${asiOpen > 1 ? ` (${asiOpen})` : ''}`,
      count: asiOpen,
      optional: false,
      area: 'choices',
    });

  // Spells
  const sheet = computeSheet(state, registry);
  for (const entry of build.classes) {
    const details = spellSelectionDetails({ ...state, sheet, registry }, entry.classId);
    if (details.mode === 'unsupported') continue;
    const name = className(entry.classId);
    const room = (list: { count: number; limit?: number }) =>
      list.limit === undefined ? 0 : list.limit - list.count;
    const add = (kind: PendingKind, label: string, count: number, optional: boolean) => {
      if (count > 0)
        items.push({
          id: `${kind}:${entry.classId}`,
          kind,
          classId: entry.classId,
          label: `${name} ${label}: ${count} to pick`,
          count,
          optional,
          area: 'spells',
        });
    };
    add('cantrips', 'cantrips', room(details.cantrips), false);
    if (details.mode === 'known') add('spells-known', 'spells known', room(details.known), false);
    if (details.mode === 'spellbook') {
      const wanted = 6 + 2 * (details.classLevel - 1);
      add('spellbook', 'spellbook spells', wanted - details.known.count, false);
    }
    if (details.mode === 'prepared' || details.mode === 'spellbook')
      add('prepared', 'prepared spells', room(details.prepared), true);
  }
  return items;
}
