import { itemTier, itemType, type CatalogEntry } from '../../engine/catalog';
import type { Registry } from '../../engine/registry';
import type { ItemDef, SpellDef } from '../../engine/schema';
import { skillName } from '../format';
import { TIER_LABELS, TYPE_NAMES } from './compendium-model';

/** One labelled value in the facts grid. */
export type Fact = readonly [label: string, value: string];

/** A list under the facts. `id` makes the row open another compendium entry. */
export interface FactList {
  title: string;
  items: { label: string; level?: number; id?: string }[];
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

function itemFacts(item: ItemDef, name: (id: string) => string): Fact[] {
  const facts: Fact[] = [['Type', TYPE_NAMES[itemType(item)]]];
  const tier = itemTier(item);
  if (tier !== 'mundane') facts.push(['Rarity', TIER_LABELS[tier]]);
  if (item.attunement) facts.push(['Attunement', 'Required']);
  if (item.weapon) {
    const w = item.weapon;
    facts.push(['Weapon', `${w.category === 'simple' ? 'Simple' : 'Martial'} ${w.type}`]);
    if (w.damage !== undefined)
      facts.push([
        'Damage',
        `${w.damage} ${w.damageType ?? ''}`.trim() +
          (w.versatile ? ` (${w.versatile} two-handed)` : ''),
      ]);
    const props = w.properties.map((p) => p.replaceAll('-', ' '));
    if (props.length) facts.push(['Properties', props.join(', ')]);
    if (w.range) facts.push(['Range', `${w.range.normal}/${w.range.long} ft`]);
  }
  if (item.armor) {
    const a = item.armor;
    facts.push(['Armor', a.category === 'shield' ? 'Shield' : `${titleWord(a.category)} armor`]);
    facts.push(['AC', armorClass(a)]);
    if (a.strMin) facts.push(['Strength', `${a.strMin} needed`]);
    if (a.stealthDisadvantage) facts.push(['Stealth', 'Disadvantage']);
  }
  if (item.charges) facts.push(['Charges', String(item.charges.max)]);
  if (item.cost)
    facts.push([
      'Cost',
      `${item.cost.amount} ${item.cost.unit}${item.bundle ? ` for ${item.bundle}` : ''}`,
    ]);
  if (item.weight !== undefined && item.weight > 0) facts.push(['Weight', `${item.weight} lb`]);
  if (item.baseItemId) facts.push(['Counts as', name(item.baseItemId)]);
  return facts;
}

const titleWord = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

const featureList = (
  title: string,
  features: readonly { level: number; featureId: string }[],
  name: (id: string) => string,
): FactList => ({
  title,
  items: [...features]
    .sort((a, b) => a.level - b.level)
    .map((f) => ({ label: name(f.featureId), level: f.level })),
});

/** Kind-specific facts and lists for the compendium detail. Pure: reads the registry only. */
export function entryFacts(entry: CatalogEntry, registry: Registry): EntryFacts {
  const name = (id: string) => registry.entries.get(id)?.name ?? id;
  const all = [...registry.entries.values()];
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
      const subclasses = all
        .filter((e) => e.kind === 'subclass' && e.classId === entry.id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => ({ label: e.name, id: e.id }));
      return {
        facts,
        lists: [
          featureList('Features by level', entry.features, name),
          ...(subclasses.length ? [{ title: 'Subclasses', items: subclasses }] : []),
        ],
      };
    }
    case 'subclass': {
      const lists: FactList[] = [featureList('Features by level', entry.features, name)];
      if (entry.grantedSpells?.length)
        lists.push({
          title: 'Always prepared spells',
          items: entry.grantedSpells.flatMap((g) =>
            g.spellIds.map((id) => ({ label: name(id), level: g.level, id })),
          ),
        });
      const facts: Fact[] = [['Class', name(entry.classId)]];
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
      const subraces = all
        .filter((e) => e.kind === 'race' && e.subraceOf === entry.id)
        .map((e) => ({ label: e.name, id: e.id }));
      return {
        facts,
        lists: [
          ...(entry.featureIds.length
            ? [{ title: 'Traits', items: entry.featureIds.map((id) => ({ label: name(id) })) }]
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
          ? [{ title: 'Feature', items: entry.featureIds.map((id) => ({ label: name(id) })) }]
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
      return { facts: itemFacts(entry, name), lists: [] };
  }
}
