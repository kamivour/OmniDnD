import { itemTier, itemType, type CatalogEntry } from '../../engine/catalog';
import type { Registry } from '../../engine/registry';
import type { ItemDef, SpellDef } from '../../engine/schema';
import { skillName } from '../format';
import { TIER_LABELS, TYPE_NAMES, titleCase } from './compendium-model';
import { equipmentProfile } from './equipment-reference';

/** One labelled value in the facts grid. */
export type Fact = readonly [label: string, value: string];

/** A list under the facts. `id` makes the row open another compendium entry. */
export interface FactList {
  title: string;
  items: { label: string; level?: number; id?: string; detail?: string }[];
}

export interface EntryFacts {
  facts: Fact[];
  lists: FactList[];
}

const ABBR = (ability: string) => ability.toUpperCase();
const join = (values: readonly string[], last = 'and') =>
  values.length <= 1
    ? (values[0] ?? '')
    : `${values.slice(0, -1).join(', ')} ${last} ${values[values.length - 1]!}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function castingTime(casting: SpellDef['casting']): string {
  switch (casting.cost) {
    case 'action':
      return '1 action';
    case 'bonus':
      return '1 bonus action';
    case 'reaction':
      return casting.trigger ? `1 reaction, ${casting.trigger}` : '1 reaction';
    case 'minutes':
      return plural(casting.amount!, 'minute');
    case 'hours':
      return plural(casting.amount!, 'hour');
  }
}

export function spellComponents({ components: c }: SpellDef): string {
  return [c.v && 'V', c.s && 'S', c.m !== undefined && (c.m ? `M (${c.m})` : 'M')]
    .filter(Boolean)
    .join(', ');
}

/**
 * The feat's prerequisite: SRD text names it in italics; our summaries open with "Needs ...".
 * Undefined when the feat has none.
 */
export function featPrerequisite(entry: CatalogEntry): string | undefined {
  if (entry.id === 'feature.feat.elemental-adept' || entry.id === 'feature.feat.spell-sniper')
    return 'Ability to cast at least one spell';
  if (entry.id === 'feature.feat.wood-elf-magic') return 'Wood elf';
  const srd = entry.fullText?.match(/Prerequisite:\s*([^*\n]+)/i)?.[1];
  if (srd) return srd.trim().replace(/\.$/, '');
  const effect = entry.summary?.effect ?? '';
  const needs = effect.match(/^Needs ([^.]+)\./)?.[1];
  if (!needs || /^no prerequisite/i.test(needs)) return undefined;
  return needs.charAt(0).toUpperCase() + needs.slice(1);
}

function armorClass(armor: NonNullable<ItemDef['armor']>): string {
  switch (armor.category) {
    case 'light':
      return `${armor.baseAc} + DEX modifier`;
    case 'medium':
      return `${armor.baseAc} + DEX modifier (max 2)`;
    case 'heavy':
      return String(armor.baseAc);
    case 'shield':
      return `+${armor.baseAc}`;
  }
}

function itemFacts(item: ItemDef, registry: Registry, variantId?: string): Fact[] {
  const {
    reference,
    weapon: w,
    armor: a,
    base,
    bases,
  } = equipmentProfile(item, registry, variantId);
  const facts: Fact[] = [
    ['Type', reference?.ammunition ? 'Ammunition' : TYPE_NAMES[itemType(item)]],
  ];
  const tier = itemTier(item);
  if (tier !== 'mundane') facts.push(['Rarity', TIER_LABELS[tier]]);
  if (item.attunement) {
    const header = item.fullText?.split('\n', 1)[0] ?? '';
    const condition =
      reference?.attunement ?? header.match(/\(requires attunement (by [^)]+)\)/i)?.[1];
    facts.push(['Attunement', condition ? `Required · ${condition}` : 'Required']);
  }
  if (base) facts.push(['Base item', base.name]);
  else if (reference?.fit) facts.push(['Applies to', reference.fit]);
  if (w) {
    facts.push(['Weapon', `${w.category === 'simple' ? 'Simple' : 'Martial'} ${w.type}`]);
    facts.push([
      'Damage',
      w.damage === undefined
        ? 'No damage'
        : `${w.damage}${w.versatile ? ` (${w.versatile} two-handed)` : ''}`,
    ]);
    if (w.damageType) facts.push(['Damage Type', titleCase(w.damageType)]);
    const props = [
      ...(w.range ? ['Range'] : []),
      ...w.properties.map((property) =>
        property === 'two-handed' ? 'Two-handed' : titleCase(property),
      ),
    ];
    if (w.range) facts.push(['Range', `${w.range.normal}/${w.range.long} ft`]);
    if (props.length) facts.push(['Properties', props.join(', ')]);
  }
  if (reference?.weaponBonus)
    facts.push([
      'Magic bonus',
      w && w.damage === undefined
        ? `+${reference.weaponBonus} to attack rolls`
        : `+${reference.weaponBonus} to attack and damage rolls`,
    ]);
  if (a) {
    facts.push(['Armor', a.category === 'shield' ? 'Shield' : `${titleWord(a.category)} armor`]);
    facts.push(['AC', armorClass(a)]);
    if (a.strMin) facts.push(['Strength', `${a.strMin} needed`]);
    if (a.stealthDisadvantage) facts.push(['Stealth', 'Disadvantage']);
  } else if (reference?.armorBonus) {
    facts.push(['Magic bonus', `+${reference.armorBonus} AC`]);
  }
  if (item.charges) {
    const { max, recharge, regain } = item.charges;
    facts.push(['Charges', String(max)]);
    if (recharge === 'dawn') {
      const amount =
        regain && regain !== 'all'
          ? `${regain.dice}${regain.bonus ? ` + ${regain.bonus}` : ''}`
          : undefined;
      facts.push(['Recharge', amount ? `${amount} at dawn` : 'At dawn']);
    }
  }
  if (item.cost)
    facts.push([
      'Cost',
      `${item.cost.amount} ${item.cost.unit}${item.bundle ? ` for ${item.bundle}` : ''}`,
    ]);
  if (item.weight !== undefined && item.weight > 0) facts.push(['Weight', `${item.weight} lb`]);
  if (!base && bases.length === 0 && item.baseItemId) facts.push(['Base item', item.baseItemId]);
  return facts;
}

const titleWord = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

const featureList = (
  title: string,
  features: readonly { level?: number; featureId: string }[],
  registry: Registry,
): FactList => ({
  title,
  items: [...features]
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
    .map(({ featureId, level }) => {
      const entry = registry.entries.get(featureId);
      return {
        label: entry?.name ?? featureId,
        level,
        detail: entry?.summary?.effect ?? entry?.fullText,
      };
    }),
});

/** Kind-specific facts and lists for the compendium detail. Pure: reads the registry only. */
export function entryFacts(
  entry: CatalogEntry,
  registry: Registry,
  variantId?: string,
): EntryFacts {
  const name = (id: string) => registry.entries.get(id)?.name ?? id;
  switch (entry.kind) {
    case 'spell':
      return {
        facts: [
          [
            'Level',
            entry.level === 0
              ? `${titleWord(entry.school)} cantrip`
              : `Level ${entry.level} ${entry.school}`,
          ],
          ['Casting time', castingTime(entry.casting) + (entry.ritual ? ' (ritual)' : '')],
          ['Range', entry.range],
          ['Components', spellComponents(entry)],
          [
            'Duration',
            entry.duration.concentration
              ? `Concentration, ${entry.duration.text.replace(/^concentration,?\s*/i, '')}`
              : entry.duration.text,
          ],
          ...(entry.save ? ([['Save', ABBR(entry.save)]] as Fact[]) : []),
          ...(entry.attack
            ? ([['Attack', `${titleWord(entry.attack)} spell attack`]] as Fact[])
            : []),
          ['Classes', entry.classes.map(name).sort().join(', ') || 'None'],
        ],
        lists: [],
      };
    case 'class': {
      const facts: Fact[] = [
        ['Hit die', entry.hitDie],
        ['Saves', entry.saves.map(ABBR).join(', ')],
        ['Subclass at', `Level ${entry.subclassLevel}`],
      ];
      if (entry.spellcasting)
        facts.push([
          'Spellcasting',
          `${ABBR(entry.spellcasting.ability)}, ${entry.spellcasting.progression === 'pact' ? 'Pact Magic' : `${entry.spellcasting.progression} caster`}`,
        ]);
      const subclasses = [...registry.entries.values()]
        .filter((e) => e.kind === 'subclass' && e.classId === entry.id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => ({ label: e.name, id: e.id }));
      return {
        facts,
        lists: [
          featureList('Features by level', entry.features, registry),
          ...(subclasses.length ? [{ title: 'Subclasses', items: subclasses }] : []),
        ],
      };
    }
    case 'subclass': {
      const lists: FactList[] = [featureList('Features by level', entry.features, registry)];
      const parent = registry.entries.get(entry.classId);
      const knowsSpells =
        parent?.kind === 'class' && parent.spellcasting?.spellsKnown !== undefined;
      if (entry.grantedSpells?.length)
        lists.push({
          title: knowsSpells ? 'Granted spells' : 'Always prepared spells',
          items: entry.grantedSpells.flatMap((g) =>
            g.spellIds.map((id) => ({ label: name(id), level: g.level, id })),
          ),
        });
      if (entry.expandedSpellIds?.length)
        lists.push({
          title: 'Added to your spell choices',
          items: entry.expandedSpellIds.map((id) => ({ label: name(id), id })),
        });
      const facts: Fact[] = [['Class', name(entry.classId)]];
      if (parent?.kind === 'class') facts.push(['Subclass at', `Level ${parent.subclassLevel}`]);
      if (entry.additionalSpellLists?.length)
        facts.push(['Additional spell lists', entry.additionalSpellLists.map(name).join(', ')]);
      if (entry.spellcasting)
        facts.push([
          'Spellcasting',
          `${ABBR(entry.spellcasting.ability)}, ${entry.spellcasting.progression} caster`,
        ]);
      return { facts, lists };
    }
    case 'race': {
      const bonuses = entry.abilityBonuses.map(
        (b) => `${b.value > 0 ? '+' : ''}${b.value} ${ABBR(b.ability)}`,
      );
      if (entry.abilityChoices) {
        const c = entry.abilityChoices;
        bonuses.push(
          `+${c.value} to ${c.count === 1 ? 'one other' : `${c.count} others`}${c.exclude?.length ? ` (not ${c.exclude.map(ABBR).join(', ')})` : ''}`,
        );
      }
      const facts: Fact[] = [
        ['Size', titleWord(entry.size)],
        ['Speed', `${entry.speed} ft`],
      ];
      if (entry.darkvision) facts.push(['Darkvision', `${entry.darkvision} ft`]);
      if (bonuses.length) facts.push(['Abilities', bonuses.join(', ')]);
      if (entry.languages.length) facts.push(['Languages', entry.languages.join(', ')]);
      if (entry.subraceOf) facts.push(['Subrace of', name(entry.subraceOf)]);
      const subraces = [...registry.entries.values()]
        .filter((e) => e.kind === 'race' && e.subraceOf === entry.id)
        .map((e) => ({ label: e.name, id: e.id }));
      return {
        facts,
        lists: [
          ...(entry.featureIds.length
            ? [
                featureList(
                  'Traits',
                  entry.featureIds.map((featureId) => ({ featureId })),
                  registry,
                ),
              ]
            : []),
          ...(subraces.length ? [{ title: 'Subraces', items: subraces }] : []),
        ],
      };
    }
    case 'background': {
      const facts: Fact[] = [];
      const skills = entry.skills.map(skillName);
      if (entry.skillChoices) skills.push(`${entry.skillChoices} of your choice`);
      if (skills.length) facts.push(['Skills', skills.join(', ')]);
      const tools = entry.tools.map(name);
      for (const t of entry.toolChoices ?? [])
        tools.push(
          `${t.count} ${t.group === 'any' ? 'tool' : t.group === 'gaming' ? 'gaming set' : t.group === 'artisan' ? "artisan's tools" : 'instrument'} of your choice`,
        );
      if (tools.length) facts.push(['Tools', tools.join(', ')]);
      if (entry.languageChoices)
        facts.push(['Languages', `${entry.languageChoices} of your choice`]);
      return {
        facts,
        lists: entry.featureIds.length
          ? [
              featureList(
                'Feature',
                entry.featureIds.map((featureId) => ({ featureId })),
                registry,
              ),
            ]
          : [],
      };
    }
    case 'feature': {
      const facts: Fact[] = [['Prerequisite', featPrerequisite(entry) ?? 'None']];
      const g = entry.grants;
      if (g?.ability?.length)
        facts.push([
          'Ability',
          `+1 ${join(g.ability.map(ABBR), 'or')}${g.saveFromAbility ? ', and its saving throws' : ''}`,
        ]);
      if (g?.skills) facts.push(['Skills', `${g.skills} of your choice`]);
      if (g?.armor?.length)
        facts.push([
          'Armor',
          join(g.armor.map((a) => (a === 'shield' ? 'shields' : `${a} armor`))),
        ]);
      return { facts, lists: [] };
    }
    case 'item':
      return { facts: itemFacts(entry, registry, variantId), lists: [] };
  }
}
