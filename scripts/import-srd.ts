/**
 * Imports the SRD 5.1 reference data into data/srd/*.json. Run once when the pin or the
 * mapping changes:
 *
 *   npm run import:srd
 *   npm run import:srd -- --from <dir>    (a local copy of the 5e-SRD-*.json files)
 *
 * Source: 5e-bits/5e-database, the data behind dnd5eapi.co, pinned to one commit so the
 * output changes only when we move the pin. SRD 5.1 is CC BY 4.0 (attribution in DATA.md §2).
 * The mapping is in scripts/srd/map.ts. The report lists what the mapper skipped and the
 * seed character's ids that the SRD does not have (those go in data/content/).
 * The app never fetches SRD data at runtime.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  mapBackground,
  mapClass,
  mapClassFeatures,
  mapCondition,
  mapCreature,
  mapItem,
  mapMagicItem,
  mapRace,
  mapSpell,
  mapSubclass,
  mapSubrace,
  mapTrait,
  referencedIds,
  sortById,
  type RawBackground,
  type RawClass,
  type RawCondition,
  type RawFeature,
  type RawItem,
  type RawLevel,
  type RawMagicItem,
  type RawMonster,
  type RawRace,
  type RawSpell,
  type RawSubclass,
  type RawSubrace,
  type RawTrait,
} from './srd/map.ts';
import type { ItemDef, RefEntry } from '../src/engine/schema';

const COMMIT = 'a6212beb4b278917c2cff41c2b04c4ef4f3e0d6f';
const SOURCE = `https://raw.githubusercontent.com/5e-bits/5e-database/${COMMIT}/src/2014/en`;
const OUT = new URL('../data/srd/', import.meta.url);
const SEED = new URL('../data/characters/the-fool.json', import.meta.url);
const ATTEMPTS = 3;

const { values } = parseArgs({ options: { from: { type: 'string' } } });

async function load<T>(name: string): Promise<T[]> {
  const file = `5e-SRD-${name}.json`;
  if (values.from) return JSON.parse(readFileSync(join(values.from, file), 'utf8')) as T[];
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${SOURCE}/${file}`);
      if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
      return (await res.json()) as T[];
    } catch (error) {
      if (attempt === ATTEMPTS) throw error;
      console.warn(`retrying ${file}: ${String(error)}`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

const [
  rawSpells,
  rawClasses,
  rawSubclasses,
  levels,
  rawFeatures,
  rawRaces,
  rawSubraces,
  rawTraits,
  rawBackgrounds,
  rawEquipment,
  rawConditions,
  rawMagicItems,
  rawMonsters,
] = await Promise.all([
  load<RawSpell>('Spells'),
  load<RawClass>('Classes'),
  load<RawSubclass>('Subclasses'),
  load<RawLevel>('Levels'),
  load<RawFeature>('Features'),
  load<RawRace>('Races'),
  load<RawSubrace>('Subraces'),
  load<RawTrait>('Traits'),
  load<RawBackground>('Backgrounds'),
  load<RawItem>('Equipment'),
  load<RawCondition>('Conditions'),
  load<RawMagicItem>('Magic-Items'),
  load<RawMonster>('Monsters'),
]);

const notes: string[] = [];
const spells = rawSpells.map((raw) => mapSpell(raw, notes));
const { features: classFeatures, idOf } = mapClassFeatures(rawFeatures, notes);
const races = rawRaces.map(mapRace);
const subraces = rawSubraces.map((raw) => {
  const parent = races.find((race) => race.id === `race.${raw.race.index}`);
  if (!parent) throw new Error(`${raw.index}: unknown parent race ${raw.race.index}`);
  return mapSubrace(raw, parent);
});
const backgrounds = rawBackgrounds.map((raw) => mapBackground(raw, notes));
const items = rawEquipment.map(mapItem).filter((item): item is ItemDef => item !== undefined);
const magicItems = rawMagicItems
  .map((raw) => mapMagicItem(raw, notes))
  .filter((item): item is ItemDef => item !== undefined);

const packs: Record<string, RefEntry[]> = {
  spells,
  features: [
    ...classFeatures,
    ...rawTraits.map(mapTrait),
    ...backgrounds.map(({ feature }) => feature),
  ],
  classes: rawClasses.map((raw) => mapClass(raw, levels, idOf)),
  subclasses: rawSubclasses.map((raw) => mapSubclass(raw, levels, idOf)),
  races: [...races, ...subraces],
  backgrounds: backgrounds.map(({ background }) => background),
  items,
  'magic-items': magicItems,
  conditions: rawConditions.map(mapCondition),
  creatures: rawMonsters.map(mapCreature),
};

for (const [name, entries] of Object.entries(packs)) {
  writeFileSync(new URL(`${name}.json`, OUT), `${JSON.stringify(sortById(entries), null, 2)}\n`);
  console.log(`wrote data/srd/${name}.json (${entries.length})`);
}
rmSync(new URL('.gitkeep', OUT), { force: true });

const known = new Set(Object.values(packs).flatMap((entries) => entries.map((entry) => entry.id)));
const seed: unknown = JSON.parse(readFileSync(SEED, 'utf8'));
const missing = [...referencedIds(seed)].filter((id) => !known.has(id)).sort();

console.log(`\nskipped ${rawEquipment.length - items.length} mounts and vehicles`);
console.log(
  `skipped ${rawMagicItems.length - magicItems.length} magic item groups listed by variant`,
);
console.log(`\nnotes (${notes.length}):`);
for (const note of notes) console.log(`  ${note}`);
console.log(`\nthe-fool.json ids not in the SRD (${missing.length}), add to data/content/:`);
for (const id of missing) console.log(`  ${id}`);
