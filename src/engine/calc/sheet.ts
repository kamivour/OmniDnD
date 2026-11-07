import { characterRegistry, type Registry } from '../registry';
import { recordedLevel, xpForLevel } from './advancement';
import { encumbrance, type Encumbrance } from './encumbrance';
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
import type {
  Campaign,
  CharacterBuild,
  HitDieName,
  ItemDef,
  LiveState,
  Modifier,
  RaceDef,
} from '../schema';
import { ABILITIES, abilityModifier, type Ability } from './abilities';
import { characterFeatures, resolveFormula, type CharacterFeature } from './features';
import { levelHp, maxHp } from './hp';
import { proficiencyBonus } from './proficiency';
import { spellSlots, type SpellSlots } from './slots';
import { sumParts, type Part, type Stat } from './stat';
import { isPreparedCaster2014 } from './spell-selections';
import {
  overridePath,
  overrideStat,
  resolveDieOverride,
  type NumberDomain,
} from './value-overrides';

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
  preparedLimit?: number;
  maxSpellLevel?: number;
}

export interface WeaponAttack {
  instanceId: string;
  itemId: string;
  name: string;
  type: 'melee' | 'ranged';
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
  /** Canonical calculated values and their domains, shared by editors and breakdowns. */
  values: Record<string, { label: string; stat: Stat; domain: NumberDomain }>;
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
  encumbrance: Encumbrance;
  nextLevelXp?: number;
}

export function computeSheet(state: CharacterState, bundled: Registry): Sheet {
  const registry = characterRegistry(bundled, state.build);
  const sheet = computeValues(state, registry);
  if (safeValues(sheet) || state.build.overrides.length === 0) return sheet;
  // Older exports allow opaque overrides. Preserve their records, but do not let a
  // newly recognized, otherwise well-formed value overflow dependent calculations.
  let accepted: CharacterBuild['overrides'] = [];
  let safe = computeValues({ ...state, build: { ...state.build, overrides: accepted } }, registry);
  if (!safeValues(safe)) return sheet;
  for (const entry of state.build.overrides) {
    const candidate = computeValues(
      {
        ...state,
        build: { ...state.build, overrides: [...accepted, entry] },
      },
      registry,
    );
    if (safeValues(candidate)) {
      accepted = [...accepted, entry];
      safe = candidate;
    }
  }
  return safe;
}

function safeValues(sheet: Sheet): boolean {
  return (
    Number.isSafeInteger(
      sumParts(sheet.hitDice.map((pool) => ({ label: pool.die, value: pool.max }))).value,
    ) &&
    Object.values(sheet.values).every(
      ({ stat }) =>
        Number.isSafeInteger(stat.value) &&
        stat.parts.every((part) => Number.isSafeInteger(part.value)),
    )
  );
}

function computeValues({ campaign, build, live }: CharacterState, registry: Registry): Sheet {
  const values: Sheet['values'] = {};
  const value = (path: string, label: string, base: Stat, domain: NumberDomain = {}): Stat => {
    const stat = overrideStat(build, path, base, domain);
    values[path] = { label, stat, domain };
    return stat;
  };
  const scalar = (path: string, label: string, base: number, domain: NumberDomain = {}) =>
    value(path, label, { value: base, parts: [] }, domain).value;
  const actualLevel = recordedLevel(build);
  const level = value(
    '/level',
    'Character level',
    {
      value: actualLevel,
      parts: build.classes.map((entry) => ({
        label: registry.get('class', entry.classId).name,
        value: entry.level,
      })),
    },
    { min: 1, max: 20 },
  ).value;
  const proficiency = scalar('/proficiency', 'Proficiency bonus', proficiencyBonus(level), {
    min: 0,
  });
  const proficiencyPart: Part = { label: 'Proficiency', value: proficiency };

  const abilities = Object.fromEntries(
    ABILITIES.map((ability) => {
      const score = value(
        overridePath('abilities', ability, 'score'),
        `${ability} score`,
        sumParts([
          { label: 'Base', value: build.abilityScores.base[ability] },
          ...build.abilityScores.bonuses
            .filter((bonus) => bonus.ability === ability)
            .map((bonus) => ({ label: sourceLabel(bonus.source, registry), value: bonus.value })),
        ]),
        { min: 0 },
      );
      const mod = scalar(
        overridePath('abilities', ability, 'mod'),
        `${ability} modifier`,
        abilityModifier(score.value),
      );
      return [ability, { score, mod }];
    }),
  ) as Sheet['abilities'];
  const mods = Object.fromEntries(
    ABILITIES.map((ability) => [ability, abilities[ability].mod]),
  ) as Record<Ability, number>;
  const ctx = { mods, proficiency };
  const modPart = (ability: Ability): Part => ({ label: ability, value: mods[ability] });

  const features = characterFeatures(build, registry, ctx, level).map((feature) => {
    const path = overridePath('features', feature.def.id);
    const result = { ...feature };
    if (feature.uses)
      result.uses = {
        ...feature.uses,
        max: scalar(`${path}/uses/max`, `${feature.def.name} uses maximum`, feature.uses.max, {
          min: 0,
        }),
      };
    if (feature.die) {
      const die = resolveDieOverride(build, `${path}/die`, feature.die);
      result.die = die.value;
      if (die.override) result.dieOverride = die.override;
    }
    return result;
  });
  const sources: { label: string; modifiers: readonly Modifier[]; level: number }[] = [
    ...features.map(({ def, level }) => ({
      label: def.name,
      modifiers: def.modifiers ?? [],
      level,
    })),
    ...live.effects.map((effect) => ({
      label: effect.name,
      modifiers: effect.modifiers,
      level: 0,
    })),
  ];
  const modifierParts = (...targets: Modifier['target'][]): Part[] =>
    sources.flatMap(({ label, modifiers, level }) =>
      modifiers
        .filter((modifier) => targets.includes(modifier.target))
        .map((modifier) => ({ label, value: resolveFormula(modifier.value, ctx, level) })),
    );

  const saves = Object.fromEntries(
    ABILITIES.map((ability) => {
      const proficient = build.proficiencies.saves.includes(ability);
      const parts = [modPart(ability), ...(proficient ? [proficiencyPart] : [])];
      return [
        ability,
        {
          ...value(
            overridePath('saves', ability),
            `${ability} save`,
            sumParts([...parts, ...modifierParts('saves')]),
          ),
          proficient,
        },
      ];
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
      return [
        skill,
        {
          ...value(
            overridePath('skills', skill),
            `${skill.replaceAll('-', ' ')} skill`,
            sumParts(parts),
          ),
          proficiency: kind,
        },
      ];
    }),
  ) as Sheet['skills'];

  const passive = (skill: Skill): Stat =>
    value(
      overridePath('passives', skill),
      `Passive ${skill}`,
      sumParts([{ label: 'Base', value: 10 }, ...skills[skill].parts]),
    );

  const equipped = build.items.flatMap((item) => {
    const state = live.items[item.instanceId];
    if (!state?.equipped || state.qty <= 0) return [];
    return [{ instanceId: item.instanceId, def: registry.get('item', item.itemId) }];
  });

  const conditions = [
    ...new Set([...live.conditions, ...live.effects.flatMap((effect) => effect.conditions)]),
  ];

  const race = registry.get('race', build.subraceId ?? build.raceId);
  const hpBonusParts = modifierParts('hp');
  const hpParts = [
    ...build.hpEntries.map((entry) => ({
      label: `Level ${entry.level}`,
      value: levelHp(entry.value, mods.CON, entry.floor ?? campaign.hpLevelFloor),
    })),
    ...hpBonusParts,
  ];
  const fullHp =
    maxHp(
      build.hpEntries.map((entry) => entry.value),
      mods.CON,
      campaign.hpLevelFloor,
      build.hpEntries.map((entry) => entry.floor),
    ) + hpBonusParts.reduce((sum, part) => sum + part.value, 0);
  const hpTotal = hpParts.reduce((sum, part) => sum + part.value, 0);
  if (fullHp !== hpTotal) hpParts.push({ label: 'Minimum max HP 1', value: fullHp - hpTotal });
  const halvedHp = live.exhaustion >= 4 ? Math.max(1, Math.floor(fullHp / 2)) : fullHp;
  const maxHpStat: Stat = {
    value: halvedHp,
    parts:
      halvedHp === fullHp
        ? hpParts
        : [...hpParts, { label: 'Exhaustion (halved)', value: halvedHp - fullHp }],
    notes: [
      ...build.hpEntries.map((entry) => {
        const floor = entry.floor ?? campaign.hpLevelFloor;
        const beforeFloor = entry.value + mods.CON;
        const entryLabel =
          entry.method === 'rolled' ? 'roll' : entry.method === 'average' ? 'average' : 'maximum';
        const floorNote =
          floor === 'one'
            ? `minimum 1 per level → ${Math.max(1, beforeFloor)}`
            : 'no per-level minimum';
        return `Level ${entry.level} (${registry.get('class', entry.classId).name}): locked ${entryLabel} ${entry.value} + current CON (${mods.CON >= 0 ? '+' : ''}${mods.CON}) = ${beforeFloor}; ${floorNote}.`;
      }),
      ...(fullHp !== hpTotal ? [`Minimum maximum HP: max(1, ${hpTotal}) = ${fullHp}.`] : []),
      ...(live.exhaustion >= 4
        ? [`Exhaustion ${live.exhaustion}: max(1, floor(${fullHp} / 2)) = ${halvedHp}.`]
        : []),
    ],
  };

  const classDefs = build.classes.map((entry) => ({
    entry,
    def: registry.get('class', entry.classId),
  }));

  const hitDice = classDefs
    .reduce<Sheet['hitDice']>((pool, { entry, def }) => {
      const row = pool.find((dice) => dice.die === def.hitDie);
      if (row) row.max += entry.level;
      else pool.push({ die: def.hitDie, max: entry.level });
      return pool;
    }, [])
    .map((pool) => ({
      ...pool,
      max: scalar(
        overridePath('hitDice', pool.die, 'max'),
        `${pool.die} Hit Dice maximum`,
        pool.max,
        { min: 0 },
      ),
    }));
  const slots = spellSlots(
    classDefs.flatMap(({ entry, def }) =>
      def.spellcasting ? [{ progression: def.spellcasting.progression, level: entry.level }] : [],
    ),
  );
  slots.max = slots.max.map((max, slotLevel) =>
    slotLevel === 0
      ? max
      : scalar(
          overridePath('slots', 'max', slotLevel),
          `Level ${slotLevel} spell slots maximum`,
          max,
          { min: 0 },
        ),
  );
  if (slots.pact)
    slots.pact = {
      count: scalar('/slots/pact/count', 'Pact slots maximum', slots.pact.count, { min: 0 }),
      level: scalar('/slots/pact/level', 'Pact slot level', slots.pact.level, { min: 1, max: 5 }),
    };
  const attacks = equipped.flatMap(({ instanceId, def }) => {
    if (!def.weapon) return [];
    const attack = weaponAttack(instanceId, def, build, mods, proficiencyPart);
    attack.toHit = value(
      overridePath('attacks', instanceId, 'toHit'),
      `${def.name} attack`,
      attack.toHit,
    );
    if (attack.damage)
      attack.damage.bonus = scalar(
        overridePath('attacks', instanceId, 'damage', 'bonus'),
        `${def.name} damage bonus`,
        attack.damage.bonus,
        typeof def.weapon.damage === 'number' ? { min: 0 } : {},
      );
    return [attack];
  });

  const load = encumbrance({ campaign, build, live }, registry, abilities.STR.score.value);
  const result: Sheet = {
    values,
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
    initiative: value(
      '/initiative',
      'Initiative',
      sumParts([modPart('DEX'), ...modifierParts('initiative', 'checks', 'unproficient-checks')]),
    ),
    ac: value(
      '/ac',
      'Armor class',
      armorClass(equipped, mods.DEX, modifierParts('ac'), unarmoredDefenses(features, mods)),
      {
        min: 0,
      },
    ),
    speed: value(
      '/speed',
      'Speed',
      speed(
        race,
        equipped,
        abilities.STR.score.value,
        live.exhaustion,
        conditions,
        modifierParts('speed'),
        load,
      ),
      { min: 0 },
    ),
    darkvision: scalar('/darkvision', 'Darkvision', race.darkvision ?? 0, { min: 0 }),
    maxHp: value('/maxHp', 'Maximum HP', maxHpStat, { min: 1 }),
    hitDice,
    spellcasting: classDefs.flatMap(({ entry, def }) => {
      if (!def.spellcasting) return [];
      const { ability, cantripsKnown, spellsKnown } = def.spellcasting;
      const known = (table: readonly number[] | undefined) => table?.[entry.level - 1];
      const stats: SpellcastingStats = {
        classId: entry.classId,
        ability,
        saveDc: value(
          overridePath('spellcasting', entry.classId, 'saveDc'),
          `${def.name} spell save DC`,
          sumParts([{ label: 'Base', value: 8 }, proficiencyPart, modPart(ability)]),
        ),
        attack: value(
          overridePath('spellcasting', entry.classId, 'attack'),
          `${def.name} spell attack`,
          sumParts([proficiencyPart, modPart(ability)]),
        ),
      };
      const cantrips = known(cantripsKnown);
      const spells = known(spellsKnown);
      if (cantrips !== undefined)
        stats.cantripsKnown = scalar(
          overridePath('spellcasting', entry.classId, 'cantripsKnown'),
          `${def.name} cantrips known limit`,
          cantrips,
          { min: 0 },
        );
      if (spells !== undefined)
        stats.spellsKnown = scalar(
          overridePath('spellcasting', entry.classId, 'spellsKnown'),
          `${def.name} spells known limit`,
          spells,
          { min: 0 },
        );
      const ownSlots = spellSlots([
        { progression: def.spellcasting.progression, level: entry.level },
      ]);
      const maximum = Math.max(
        0,
        ownSlots.pact?.level ?? ownSlots.max.findLastIndex((max) => max > 0),
      );
      stats.maxSpellLevel = scalar(
        overridePath('spellcasting', entry.classId, 'maxSpellLevel'),
        `${def.name} maximum spell level`,
        maximum,
        { min: 0, max: 9 },
      );
      if (isPreparedCaster2014(entry.classId))
        stats.preparedLimit = scalar(
          overridePath('spellcasting', entry.classId, 'preparedLimit'),
          `${def.name} prepared spells limit`,
          stats.maxSpellLevel === 0
            ? 0
            : Math.max(
                1,
                (entry.classId === 'class.paladin' ? Math.floor(entry.level / 2) : entry.level) +
                  mods[ability],
              ),
          { min: 0 },
        );
      return [stats];
    }),
    slots,
    features,
    attacks,
    conditions,
    encumbrance: load,
    carryingCapacity: scalar(
      '/carryingCapacity',
      'Carrying capacity',
      abilities.STR.score.value * CARRY_PER_STR,
      { min: 0 },
    ),
    ...(campaign.leveling === 'xp' && actualLevel < 20
      ? {
          nextLevelXp: scalar('/nextLevelXp', 'Next level XP', xpForLevel(actualLevel + 1), {
            min: 0,
          }),
        }
      : {}),
  };
  if (
    race.darkvision === undefined &&
    result.darkvision === 0 &&
    !values['/darkvision']?.stat.override
  )
    delete result.darkvision;
  return result;
}

/** Label for an ability bonus source: the entry name when the source is a reference id. */
function sourceLabel(source: string, registry: Registry): string {
  return registry.entries.get(source)?.name ?? source;
}

type Equipped = { instanceId: string; def: ItemDef }[];

/** PHB 2014: armor base + DEX (light full, medium max +2, heavy none); 10 + DEX unarmored; a shield adds its bonus. */
/** PHB 2014 Unarmored Defense: Barbarian adds CON (a shield is fine), Monk adds WIS (no shield). */
const UNARMORED_DEFENSES: Record<string, { ability: Ability; shield: boolean }> = {
  'feature.barbarian.unarmored-defense': { ability: 'CON', shield: true },
  'feature.monk.unarmored-defense': { ability: 'WIS', shield: false },
};

interface UnarmoredDefense {
  ability: Ability;
  shield: boolean;
  mod: number;
}

function unarmoredDefenses(
  features: readonly { def: { id: string } }[],
  mods: Record<Ability, number>,
): UnarmoredDefense[] {
  return features.flatMap(({ def }) => {
    const rule = UNARMORED_DEFENSES[def.id];
    return rule ? [{ ...rule, mod: mods[rule.ability] }] : [];
  });
}

function armorClass(
  equipped: Equipped,
  dexMod: number,
  extra: Part[],
  unarmored: UnarmoredDefense[] = [],
): Stat {
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
    // The best allowed source wins; a Monk with a shield gets no Unarmored Defense.
    const best = unarmored
      .filter((rule) => (rule.shield || !shield) && rule.mod > 0)
      .sort((a, b) => b.mod - a.mod)[0];
    if (best) parts.push({ label: `Unarmored Defense (${best.ability})`, value: best.mod });
  }
  if (shield?.armor) parts.push({ label: shield.name, value: shield.armor.baseAc });
  return sumParts([...parts, ...extra]);
}

function speed(
  race: RaceDef,
  equipped: Equipped,
  strScore: number,
  exhaustion: number,
  conditions: Condition[],
  extra: Part[],
  load: Encumbrance,
): Stat {
  const parts: Part[] = [{ label: race.name, value: race.speed }, ...extra];
  const heavy = equipped.find(({ def }) => def.armor?.category === 'heavy')?.def;
  // 2014 Dwarf Speed ignores heavy armor's STR penalty, including inherited subraces.
  // https://www.dndbeyond.com/sources/dnd/basic-rules-2014/races#DwarfTraits
  const dwarf = race.id === 'race.dwarf' || race.subraceOf === 'race.dwarf';
  if (load.mode !== 'variant' && !dwarf && heavy?.armor?.strMin && strScore < heavy.armor.strMin) {
    parts.push({
      label: `${heavy.name} (STR ${heavy.armor.strMin})`,
      value: -HEAVY_ARMOR_SPEED_PENALTY,
    });
  }
  if (load.speedPenalty > 0)
    parts.push({
      label: load.level === 'heavy' ? 'Heavily encumbered' : 'Encumbered',
      value: -load.speedPenalty,
    });
  const beforeFloor = sumParts(parts).value;
  if (beforeFloor < 0) parts.push({ label: 'Minimum speed', value: -beforeFloor });
  const current = () => Math.max(0, sumParts(parts).value);
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
    (entry) => entry === weapon.category || entry === def.id || entry === def.baseItemId,
  );
  const abilityPart = { label: ability, value: mods[ability] };
  const attack: WeaponAttack = {
    instanceId,
    itemId: def.id,
    name: def.name,
    type: weapon.type,
    ability,
    proficient,
    toHit: sumParts(proficient ? [abilityPart, proficiencyPart] : [abilityPart]),
    properties: weapon.properties,
  };
  if (weapon.damage !== undefined && weapon.damageType) {
    attack.damage =
      typeof weapon.damage === 'number'
        ? { bonus: Math.max(0, weapon.damage + mods[ability]), type: weapon.damageType }
        : { dice: weapon.damage, bonus: mods[ability], type: weapon.damageType };
  }
  if (weapon.versatile) attack.versatile = weapon.versatile;
  if (weapon.range) attack.range = weapon.range;
  return attack;
}
