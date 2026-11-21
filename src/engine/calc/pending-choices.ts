import { optionalRules, sourceAllows } from './campaign-rules';
import { INFUSIONS_KNOWN, infusionMinimumLevel, INFUSION_PREFIX } from './infusions';
import type { Registry } from '../registry';
import { featSpellSources } from './feat-spells';
import { openProficiencyPicks } from './proficiencies';
import { openAsiChoices } from './asi-choices';
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
  | 'prepared'
  | 'feat-spells'
  | 'proficiencies';

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
  /** For `option`: every feature the campaign allows for this pick, owned ones included. */
  optionIds?: string[];
  /** For `feat-spells` and `proficiencies`: the feat, trait or feature with open picks. */
  featureId?: string;
}

interface OptionFamily {
  classId: string;
  /** Race pick lists (Draconic Ancestry) use the race instead of a class. */
  raceId?: string;
  /** Only characters of this subclass pick from the family. */
  subclassId?: string;
  label: string;
  /** Option features share this id prefix. */
  prefix: string;
  /** Tasha optional class features that join this list when the campaign uses them. */
  tasha?: string[];
  /** [class level, total picks from that level on], PHB 2014. */
  totals: [number, number][];
}

/** Class features that make the player pick from a list of option features. */
export const OPTION_FAMILIES: OptionFamily[] = [
  {
    classId: 'class.bard',
    subclassId: 'subclass.bard.swords',
    label: 'Fighting Style',
    prefix: 'feature.bard.swords-fighting-style-',
    totals: [[3, 1]],
  },
  {
    classId: 'class.druid',
    subclassId: 'subclass.druid.land',
    label: 'Circle Spells terrain',
    prefix: 'feature.druid.circle-of-the-land-',
    totals: [[3, 1]],
  },
  {
    classId: 'class.fighter',
    label: 'Fighting Style',
    prefix: 'feature.fighter.fighting-style-',
    tasha: [
      'feature.tce.fighting-style-blind-fighting',
      'feature.tce.fighting-style-interception',
      'feature.tce.fighting-style-superior-technique',
      'feature.tce.fighting-style-thrown-weapon-fighting',
      'feature.tce.fighting-style-unarmed-fighting',
    ],
    totals: [[1, 1]],
  },
  {
    classId: 'class.paladin',
    label: 'Fighting Style',
    prefix: 'feature.paladin.fighting-style-',
    tasha: [
      'feature.tce.fighting-style-blessed-warrior',
      'feature.tce.fighting-style-blind-fighting',
      'feature.tce.fighting-style-interception',
    ],
    totals: [[2, 1]],
  },
  {
    classId: 'class.ranger',
    label: 'Fighting Style',
    prefix: 'feature.ranger.fighting-style-',
    tasha: [
      'feature.tce.fighting-style-blind-fighting',
      'feature.tce.fighting-style-druidic-warrior',
      'feature.tce.fighting-style-thrown-weapon-fighting',
    ],
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
    totals: INFUSIONS_KNOWN,
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
    classId: 'class.sorcerer',
    subclassId: 'subclass.sorcerer.draconic',
    label: 'Dragon Ancestor',
    prefix: 'feature.sorcerer.dragon-ancestor-',
    totals: [[1, 1]],
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

/** Race traits that make the player pick an option feature; `classId` is unused here. */
export const RACE_OPTION_FAMILIES: (OptionFamily & { raceId: string })[] = [
  {
    classId: '',
    raceId: 'race.dragonborn',
    label: 'Draconic Ancestry',
    prefix: 'feature.draconic-ancestry-',
    totals: [[1, 1]],
  },
];

/**
 * Feats that grant one pick from an option list. A class list with the same prefix shares the
 * count, so a fighter with Fighting Initiate picks two different styles.
 */
export const FEAT_OPTION_FAMILIES: (OptionFamily & { featId: string })[] = [
  {
    classId: '',
    featId: 'feature.feat.fighting-initiate',
    label: 'Fighting Initiate',
    prefix: 'feature.fighter.fighting-style-',
    tasha: [
      'feature.tce.fighting-style-blind-fighting',
      'feature.tce.fighting-style-interception',
      'feature.tce.fighting-style-superior-technique',
      'feature.tce.fighting-style-thrown-weapon-fighting',
      'feature.tce.fighting-style-unarmed-fighting',
    ],
    totals: [[1, 1]],
  },
  {
    classId: '',
    featId: 'feature.feat.eldritch-adept',
    label: 'Eldritch Adept',
    prefix: 'feature.warlock.eldritch-invocation-',
    totals: [[1, 1]],
  },
  {
    classId: '',
    featId: 'feature.feat.elemental-adept',
    label: 'Elemental Adept',
    prefix: 'feature.feat.elemental-adept-',
    totals: [[1, 1]],
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

/** True when the feature belongs to this pick list (its own prefix or a listed Tasha option). */
export function familyIncludes(family: OptionFamily, id: string): boolean {
  return id.startsWith(family.prefix) || (family.tasha?.includes(id) ?? false);
}

/**
 * The features the campaign allows for a pick list. Tasha options need the optional class
 * features rule. https://www.dndbeyond.com/sources/dnd/tcoe/character-classes#Fighter
 */
export function familyOptionIds(
  family: OptionFamily,
  registry: Registry,
  campaign: CharacterState['campaign'],
  classLevel?: number,
): string[] {
  const tasha = optionalRules(campaign).optionalClassFeatures ? (family.tasha ?? []) : [];
  return [...registry.entries.values()]
    .filter(
      (row) =>
        row.kind === 'feature' &&
        (row.id.startsWith(family.prefix) || tasha.includes(row.id)) &&
        sourceAllows(campaign, row) &&
        (family.prefix !== INFUSION_PREFIX ||
          classLevel === undefined ||
          infusionMinimumLevel(row.id) <= classLevel),
    )
    .map((row) => row.id);
}

const totalAt = (totals: [number, number][], level: number) =>
  totals.reduce((sum, [from, total]) => (level >= from ? total : sum), 0);

function classOptionTotal(family: OptionFamily, entry: CharacterState['build']['classes'][number]) {
  const championStyle =
    family.prefix === 'feature.fighter.fighting-style-' &&
    entry.subclassId === 'subclass.fighter.champion' &&
    entry.level >= 10;
  return totalAt(family.totals, entry.level) + (championStyle ? 1 : 0);
}

/**
 * What the character still has to decide, from the build alone. It only lists things the data
 * can verify; table rulings and homebrew choices are never guessed.
 */
export function pendingChoices(state: CharacterState, registry: Registry): PendingChoice[] {
  const { build, campaign } = state;
  const className = (id: string) => registry.entries.get(id)?.name ?? id;
  const items: PendingChoice[] = [];
  const featAllowance = (prefix: string) =>
    FEAT_OPTION_FAMILIES.filter(
      (family) => family.prefix === prefix && build.featureIds.includes(family.featId),
    ).length;
  /** Picks the character's classes grant from a list with this prefix. */
  const classAllowance = (prefix: string) =>
    build.classes.reduce((sum, entry) => {
      const family = OPTION_FAMILIES.find(
        (row) =>
          row.prefix === prefix &&
          row.classId === entry.classId &&
          (row.subclassId === undefined || row.subclassId === entry.subclassId),
      );
      return sum + (family ? classOptionTotal(family, entry) : 0);
    }, 0);

  for (const entry of build.classes) {
    const def = registry.entries.get(entry.classId);
    if (def?.kind !== 'class') continue;
    const name = def.name;

    const hasSubclasses = [...registry.entries.values()].some(
      (row) =>
        row.kind === 'subclass' && row.classId === entry.classId && sourceAllows(campaign, row),
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
      const options = familyOptionIds(family, registry, campaign, entry.level);
      const taken = build.featureIds.filter((id) => familyIncludes(family, id)).length;
      const classTotal = classOptionTotal(family, entry);
      const allowance = classTotal + featAllowance(family.prefix);
      const open = Math.min(
        Math.max(0, Math.min(classTotal, allowance - taken)),
        options.length - taken,
      );
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
          optionIds: options,
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

  for (const family of RACE_OPTION_FAMILIES) {
    if (family.raceId !== build.raceId && family.raceId !== build.subraceId) continue;
    const options = familyOptionIds(family, registry, campaign);
    const taken = build.featureIds.filter((id) => familyIncludes(family, id)).length;
    const open = Math.min(totalAt(family.totals, 1) - taken, options.length - taken);
    if (open > 0)
      items.push({
        id: `option:${family.prefix}`,
        kind: 'option',
        classId: build.classes[0]?.classId ?? '',
        label: `${family.label}: pick ${open}`,
        count: open,
        optional: false,
        area: 'choices',
        prefix: family.prefix,
        optionIds: options,
      });
  }

  for (const family of FEAT_OPTION_FAMILIES) {
    if (!build.featureIds.includes(family.featId)) continue;
    const options = familyOptionIds(family, registry, campaign);
    const taken = build.featureIds.filter((id) => familyIncludes(family, id)).length;
    const classTotal = classAllowance(family.prefix);
    const allowance = classTotal + featAllowance(family.prefix);
    const classOpen = Math.max(0, Math.min(classTotal, allowance - taken));
    const open = Math.min(allowance - taken - classOpen, options.length - taken - classOpen);
    if (open > 0)
      items.push({
        id: `option:${family.featId}`,
        kind: 'option',
        classId: build.classes[0]?.classId ?? '',
        label: `${family.label}: pick ${open}`,
        count: open,
        optional: false,
        area: 'choices',
        prefix: family.prefix,
        optionIds: options,
        featureId: family.featId,
      });
  }

  // Ability score improvements: earned at class levels, spent by ASI or feat picks.
  const openAsis = openAsiChoices(build, registry);
  const asiOpen = openAsis.length;
  if (asiOpen > 0)
    items.push({
      id: 'asi',
      kind: 'asi',
      classId: openAsis[0]!.classId,
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

  // Spells taught by feats and racial traits (Magic Initiate, Fey Touched, High Elf cantrip).
  for (const source of featSpellSources({ registry, build, sheet })) {
    if (source.open === 0 && source.needs.length === 0) continue;
    items.push({
      id: `feat-spells:${source.featureId}`,
      kind: 'feat-spells',
      classId: '',
      featureId: source.featureId,
      label: `${source.name}: choose spells`,
      count: source.open,
      optional: false,
      area: 'choices',
    });
  }

  // Skills, tools and languages race traits and features let the player pick (Skill Versatility).
  for (const { def, open } of openProficiencyPicks(build, sheet.features)) {
    items.push({
      id: `proficiencies:${def.id}`,
      kind: 'proficiencies',
      classId: '',
      featureId: def.id,
      label: `${def.name}: choose proficiencies`,
      count: open,
      optional: false,
      area: 'choices',
    });
  }
  return items;
}
