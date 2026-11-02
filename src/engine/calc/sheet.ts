import type { Registry } from '../registry';
import {
  CARRY_PER_STR,
  HEAVY_ARMOR_SPEED_PENALTY,
  SKILL_ABILITY,
  SKILLS,
  SPEED_ZERO_CONDITIONS,
  type Condition,
  type DamageType,
  type Skill,
  type WeaponProperty,
} from '../rules2014';
import type { Campaign, CharacterBuild, HitDieName, ItemDef, LiveState, Modifier } from '../schema';
import { ABILITIES, abilityModifier, type Ability } from './abilities';
import { characterFeatures, resolveFormula, type CharacterFeature } from './features';
import { levelHp, maxHp } from './hp';
import { proficiencyBonus } from './proficiency';
import { spellSlots, type SpellSlots } from './slots';
import { sumParts, type Part, type Stat } from './stat';

export interface CharacterState {
  campaign: Campaign;
  build: CharacterBuild;
  live: LiveState;
}

export interface SpellcastingStats {
  classId: string;
  ability: Ability;
  saveDc: Stat;
  attack: Stat;
  cantripsKnown?: number;
  spellsKnown?: number;
}

export interface WeaponAttack {
  instanceId: string;
  itemId: string;
  name: string;
  ability: Ability;
  proficient: boolean;
  toHit: Stat;
  /** Absent for the Net. `dice` is absent for a flat-damage weapon (Blowgun). */
  damage?: { dice?: string; bonus: number; type: DamageType };
  versatile?: string;
  range?: { normal: number; long: number };
  properties: WeaponProperty[];
}

/** Everything the engine derives from build + live state. Display only: never stored (DATA.md §4). */
export interface Sheet {
  level: number;
  proficiency: number;
  abilities: Record<Ability, { score: Stat; mod: number }>;
  saves: Record<Ability, Stat & { proficient: boolean }>;
  skills: Record<Skill, Stat & { proficiency: 'none' | 'proficient' | 'expertise' }>;
  passives: { perception: Stat; investigation: Stat; insight: Stat };
  initiative: Stat;
  ac: Stat;
  speed: Stat;
  darkvision?: number;
  maxHp: Stat;
  hitDice: { die: HitDieName; max: number }[];
  spellcasting: SpellcastingStats[];
  slots: SpellSlots;
  features: CharacterFeature[];
  attacks: WeaponAttack[];
  /** Applied conditions, from `live.conditions` and active effects. */
  conditions: Condition[];
  carryingCapacity: number;
}

export function computeSheet({ campaign, build, live }: CharacterState, registry: Registry): Sheet {
  const level = build.classes.reduce((sum, entry) => sum + entry.level, 0);
  const proficiency = proficiencyBonus(level);
  const proficiencyPart: Part = { label: 'Proficiency', value: proficiency };

  const abilities = Object.fromEntries(
    ABILITIES.map((ability) => {
      const score = sumParts([
        { label: 'Base', value: build.abilityScores.base[ability] },
        ...build.abilityScores.bonuses
          .filter((bonus) => bonus.ability === ability)
          .map((bonus) => ({ label: sourceLabel(bonus.source, registry), value: bonus.value })),
      ]);
      return [ability, { score, mod: abilityModifier(score.value) }];
    }),
  ) as Sheet['abilities'];
  const mods = Object.fromEntries(
    ABILITIES.map((ability) => [ability, abilities[ability].mod]),
  ) as Record<Ability, number>;
  const ctx = { mods, proficiency };
  const modPart = (ability: Ability): Part => ({ label: ability, value: mods[ability] });

  const features = characterFeatures(build, registry, ctx);
  const sources: { label: string; modifiers: readonly Modifier[] }[] = [
    ...features.map(({ def }) => ({ label: def.name, modifiers: def.modifiers ?? [] })),
    ...live.effects.map((effect) => ({ label: effect.name, modifiers: effect.modifiers })),
  ];
  const modifierParts = (...targets: Modifier['target'][]): Part[] =>
    sources.flatMap(({ label, modifiers }) =>
      modifiers
        .filter((modifier) => targets.includes(modifier.target))
        .map((modifier) => ({ label, value: resolveFormula(modifier.value, ctx) })),
    );

  const saves = Object.fromEntries(
    ABILITIES.map((ability) => {
      const proficient = build.proficiencies.saves.includes(ability);
      const parts = [modPart(ability), ...(proficient ? [proficiencyPart] : [])];
      return [ability, { ...sumParts([...parts, ...modifierParts('saves')]), proficient }];
    }),
  ) as Sheet['saves'];

  const expertise = new Set<string>(build.proficiencies.expertise);
  const proficientSkills = new Set<string>(build.proficiencies.skills);
  const skills = Object.fromEntries(
    SKILLS.map((skill) => {
      const kind = expertise.has(skill)
        ? 'expertise'
        : proficientSkills.has(skill)
          ? 'proficient'
          : 'none';
      const parts = [
        modPart(SKILL_ABILITY[skill]),
        ...(kind === 'expertise' ? [{ label: 'Expertise', value: proficiency * 2 }] : []),
        ...(kind === 'proficient' ? [proficiencyPart] : []),
        ...modifierParts('checks', ...(kind === 'none' ? (['unproficient-checks'] as const) : [])),
      ];
      return [skill, { ...sumParts(parts), proficiency: kind }];
    }),
  ) as Sheet['skills'];

  const passive = (skill: Skill): Stat =>
    sumParts([{ label: 'Base', value: 10 }, ...skills[skill].parts]);

  const equipped = build.items.flatMap((item) => {
    const state = live.items[item.instanceId];
    if (!state?.equipped) return [];
    return [{ instanceId: item.instanceId, def: registry.get('item', item.itemId) }];
  });

  const conditions = [
    ...new Set([...live.conditions, ...live.effects.flatMap((effect) => effect.conditions)]),
  ];

  const race = registry.get('race', build.subraceId ?? build.raceId);
  const hpParts = build.hpEntries.map((entry) => ({
    label: `Level ${entry.level}`,
    value: levelHp(entry.value, mods.CON, entry.floor ?? campaign.hpLevelFloor),
  }));
  const fullHp = maxHp(
    build.hpEntries.map((entry) => entry.value),
    mods.CON,
    campaign.hpLevelFloor,
    build.hpEntries.map((entry) => entry.floor),
  );
  const halvedHp = live.exhaustion >= 4 ? Math.max(1, Math.floor(fullHp / 2)) : fullHp;
  const maxHpStat: Stat = {
    value: halvedHp,
    parts:
      halvedHp === fullHp
        ? hpParts
        : [...hpParts, { label: 'Exhaustion (halved)', value: halvedHp - fullHp }],
  };

  const classDefs = build.classes.map((entry) => ({
    entry,
    def: registry.get('class', entry.classId),
  }));

  return {
    level,
    proficiency,
    abilities,
    saves,
    skills,
    passives: {
      perception: passive('perception'),
      investigation: passive('investigation'),
      insight: passive('insight'),
    },
    // Initiative is a DEX check without proficiency (D51).
    initiative: sumParts([
      modPart('DEX'),
      ...modifierParts('initiative', 'checks', 'unproficient-checks'),
    ]),
    ac: armorClass(equipped, mods.DEX, modifierParts('ac')),
    speed: speed(
      race.name,
      race.speed,
      equipped,
      abilities.STR.score.value,
      live.exhaustion,
      conditions,
      modifierParts('speed'),
    ),
    ...(race.darkvision ? { darkvision: race.darkvision } : {}),
    maxHp: maxHpStat,
    hitDice: classDefs.reduce<Sheet['hitDice']>((pool, { entry, def }) => {
      const row = pool.find((dice) => dice.die === def.hitDie);
      if (row) row.max += entry.level;
      else pool.push({ die: def.hitDie, max: entry.level });
      return pool;
    }, []),
    spellcasting: classDefs.flatMap(({ entry, def }) => {
      if (!def.spellcasting) return [];
      const { ability, cantripsKnown, spellsKnown } = def.spellcasting;
      const known = (table: readonly number[] | undefined) => table?.[entry.level - 1];
      const stats: SpellcastingStats = {
        classId: entry.classId,
        ability,
        saveDc: sumParts([{ label: 'Base', value: 8 }, proficiencyPart, modPart(ability)]),
        attack: sumParts([proficiencyPart, modPart(ability)]),
      };
      const cantrips = known(cantripsKnown);
      const spells = known(spellsKnown);
      if (cantrips !== undefined) stats.cantripsKnown = cantrips;
      if (spells !== undefined) stats.spellsKnown = spells;
      return [stats];
    }),
    slots: spellSlots(
      classDefs.flatMap(({ entry, def }) =>
        def.spellcasting ? [{ progression: def.spellcasting.progression, level: entry.level }] : [],
      ),
    ),
    features,
    attacks: equipped.flatMap(({ instanceId, def }) =>
      def.weapon ? [weaponAttack(instanceId, def, build, mods, proficiencyPart)] : [],
    ),
    conditions,
    carryingCapacity: abilities.STR.score.value * CARRY_PER_STR,
  };
}

/** Label for an ability bonus source: the entry name when the source is a reference id. */
function sourceLabel(source: string, registry: Registry): string {
  return registry.entries.get(source)?.name ?? source;
}

type Equipped = { instanceId: string; def: ItemDef }[];

/** PHB 2014: armor base + DEX (light full, medium max +2, heavy none); 10 + DEX unarmored; a shield adds its bonus. */
function armorClass(equipped: Equipped, dexMod: number, extra: Part[]): Stat {
  const body = equipped.find(({ def }) => def.armor && def.armor.category !== 'shield')?.def;
  const shield = equipped.find(({ def }) => def.armor?.category === 'shield')?.def;
  const parts: Part[] = [];
  if (body?.armor) {
    parts.push({ label: body.name, value: body.armor.baseAc });
    const { category } = body.armor;
    const dex = category === 'heavy' ? 0 : category === 'medium' ? Math.min(dexMod, 2) : dexMod;
    if (category !== 'heavy') parts.push({ label: 'DEX', value: dex });
  } else {
    parts.push({ label: 'Unarmored', value: 10 }, { label: 'DEX', value: dexMod });
  }
  if (shield?.armor) parts.push({ label: shield.name, value: shield.armor.baseAc });
  return sumParts([...parts, ...extra]);
}

function speed(
  raceName: string,
  base: number,
  equipped: Equipped,
  strScore: number,
  exhaustion: number,
  conditions: Condition[],
  extra: Part[],
): Stat {
  const parts: Part[] = [{ label: raceName, value: base }, ...extra];
  const heavy = equipped.find(({ def }) => def.armor?.category === 'heavy')?.def;
  if (heavy?.armor?.strMin && strScore < heavy.armor.strMin) {
    parts.push({
      label: `${heavy.name} (STR ${heavy.armor.strMin})`,
      value: -HEAVY_ARMOR_SPEED_PENALTY,
    });
  }
  const current = () =>
    Math.max(
      0,
      parts.reduce((sum, part) => sum + part.value, 0),
    );
  const stopped = conditions.find((condition) => SPEED_ZERO_CONDITIONS.includes(condition));
  if (stopped || exhaustion >= 5) {
    parts.push({ label: stopped ?? 'Exhaustion', value: -current() });
  } else if (exhaustion >= 2) {
    parts.push({ label: 'Exhaustion (halved)', value: -Math.ceil(current() / 2) });
  }
  return { value: current(), parts };
}

/** Finesse uses the better of STR and DEX; other ranged weapons use DEX; other melee weapons STR. */
function weaponAttack(
  instanceId: string,
  def: ItemDef,
  build: CharacterBuild,
  mods: Record<Ability, number>,
  proficiencyPart: Part,
): WeaponAttack {
  const weapon = def.weapon!;
  const ability: Ability = weapon.properties.includes('finesse')
    ? mods.DEX > mods.STR
      ? 'DEX'
      : 'STR'
    : weapon.type === 'ranged'
      ? 'DEX'
      : 'STR';
  const proficient = build.proficiencies.weapons.some(
    (entry) => entry === weapon.category || entry === def.id,
  );
  const abilityPart = { label: ability, value: mods[ability] };
  const attack: WeaponAttack = {
    instanceId,
    itemId: def.id,
    name: def.name,
    ability,
    proficient,
    toHit: sumParts(proficient ? [abilityPart, proficiencyPart] : [abilityPart]),
    properties: weapon.properties,
  };
  if (weapon.damage !== undefined && weapon.damageType) {
    attack.damage =
      typeof weapon.damage === 'number'
        ? { bonus: weapon.damage + mods[ability], type: weapon.damageType }
        : { dice: weapon.damage, bonus: mods[ability], type: weapon.damageType };
  }
  if (weapon.versatile) attack.versatile = weapon.versatile;
  if (weapon.range) attack.range = weapon.range;
  return attack;
}
