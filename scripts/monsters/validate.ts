import { ABILITIES, abilityModifier, type Ability } from '../../src/engine/calc/abilities.ts';
import { SKILL_ABILITY, SKILLS } from '../../src/engine/rules2014.ts';
import type { NamedCreature } from './identify.ts';
import type { IndexEntry } from './names.ts';
import { averageHp, ENTRY_LISTS, proficiencyForCr, XP_BY_CR } from './parse.ts';

export interface Finding {
  code: string;
  severity: 'blocking' | 'review';
  message: string;
}

interface Correction {
  field: string;
  from: number | string;
  to: number | string;
}

interface Candidate extends Correction {
  apply: (copy: NamedCreature) => void;
}

export interface ValidatedCreature {
  creature: NamedCreature;
  findings: Finding[];
  correction?: Correction;
  overrideKey?: string;
}

// Preserve digits in names so numbered forms and named creatures stay distinct.
export const nameKey = (name: string) =>
  name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export function indexCoverage(
  creatures: readonly NamedCreature[],
  expected: readonly IndexEntry[],
) {
  const seen = new Map<string, NamedCreature[]>();
  for (const creature of creatures) {
    if (!creature.name) continue;
    const key = nameKey(creature.name);
    const matches = seen.get(key) ?? [];
    matches.push(creature);
    seen.set(key, matches);
  }
  const missing = expected.filter(({ name }) => !seen.has(nameKey(name)));
  const duplicates = [...seen.values()].filter((matches) => matches.length > 1);
  const index = new Set(expected.map(({ name }) => nameKey(name)));
  const unindexed = creatures.filter(({ name }) => name && !index.has(nameKey(name)));
  return {
    expected: expected.length,
    matched: expected.length - missing.length,
    missing,
    duplicates,
    unindexed,
  };
}

/** A single substitution, with no insertion, deletion or multi-character numeric rewrite. */
function oneSubstitution(from: string, to: string): boolean {
  return from.length === to.length && [...from].filter((char, i) => char !== to[i]).length === 1;
}

const rollParts = (formula: string) => {
  const match = /^(\d+)d(\d+)([+-]\d+)?$/.exec(formula);
  return match
    ? { count: Number(match[1]), die: Number(match[2]), bonus: Number(match[3] ?? 0) }
    : undefined;
};

function collect(creature: NamedCreature) {
  const findings: Finding[] = [];
  const candidates: Candidate[] = [];
  const add = (code: string, message: string, severity: Finding['severity'] = 'review') =>
    findings.push({ code, message, severity });
  const check = (
    field: string,
    observed: number | string,
    expected: readonly (number | string)[],
    update?: (copy: NamedCreature, value: number | string) => void,
  ) => {
    if (!expected.length || expected.includes(observed)) return;
    add(field, `${field}: read ${observed}, expected ${expected.join(' or ')}.`);
    if (!update) return;
    for (const value of new Set(expected)) {
      if (oneSubstitution(String(observed), String(value)))
        candidates.push({ field, from: observed, to: value, apply: (copy) => update(copy, value) });
    }
  };
  const mod = (ability: Ability) => {
    const score = creature.abilities[ability];
    return score === undefined ? undefined : abilityModifier(score);
  };
  const required = (key: keyof NamedCreature, label: string) => {
    if (creature[key] === undefined || creature[key] === null)
      add(`missing:${key}`, `${label} was not read.`, 'blocking');
  };
  required('name', 'Creature name');
  required('size', 'Size');
  required('creatureType', 'Creature type');
  required('ac', 'Armor Class');
  required('hp', 'Hit points');
  required('hpFormula', 'Hit Dice formula');
  required('cr', 'Challenge rating');
  required('languages', 'Languages');
  if (!creature.actions.length) add('missing:actions', 'No actions were read.', 'blocking');
  if (!Object.keys(creature.speed).length) add('missing:speed', 'Speed was not read.', 'blocking');

  for (const ability of ABILITIES) {
    const score = creature.abilities[ability];
    if (score === undefined || !Number.isInteger(score) || score < 1 || score > 30) {
      add(`ability:${ability}`, `${ability} score is missing or outside 1–30.`, 'blocking');
      continue;
    }
    const printed = creature.printedModifiers?.[ability];
    if (printed !== undefined) {
      const calculated = abilityModifier(score);
      check(`modifier:${ability}`, printed, [calculated], (copy, next) => {
        copy.printedModifiers![ability] = Number(next);
      });
      if (calculated !== printed) {
        for (const next of [10 + printed * 2, 11 + printed * 2]) {
          if (next < 1 || next > 30 || !oneSubstitution(String(score), String(next))) continue;
          candidates.push({
            field: `ability:${ability}`,
            from: score,
            to: next,
            apply: (copy) => {
              copy.abilities[ability] = next;
            },
          });
        }
      }
    }
  }

  const { hp, hpFormula, cr, xp, proficiencyBonus } = creature;
  const con = mod('CON');
  const parts = hpFormula === undefined ? undefined : rollParts(hpFormula);
  if (hpFormula !== undefined && (!parts || parts.count < 1 || parts.die < 2))
    add('hp-formula', 'Hit Dice formula could not be read.', 'blocking');
  if (hp !== undefined && (!Number.isInteger(hp) || hp < 1))
    add('hp-range', 'Hit points must be a positive integer.', 'blocking');
  if (hp !== undefined && parts && hpFormula !== undefined) {
    const mean = averageHp(hpFormula);
    if (mean !== undefined)
      check('hp-average', hp, [mean], (copy, next) => {
        copy.hp = Number(next);
      });
    if (con !== undefined) {
      const expected = parts.count * con;
      const formula = `${parts.count}d${parts.die}${expected > 0 ? '+' : ''}${expected || ''}`;
      check('hp-constitution', parts.bonus, [expected]);
      if (parts.bonus !== expected && oneSubstitution(hpFormula, formula))
        candidates.push({
          field: 'hp-formula',
          from: hpFormula,
          to: formula,
          apply: (copy) => {
            copy.hpFormula = formula;
          },
        });
    }
  }
  const baseXp = cr === undefined ? undefined : XP_BY_CR.get(cr);
  const pb = baseXp === undefined ? undefined : proficiencyForCr(cr!);
  if (cr !== undefined && baseXp === undefined)
    add('challenge', 'Challenge rating is outside the 2014 table.', 'blocking');
  required('xp', 'Experience points');
  required('proficiencyBonus', 'Proficiency bonus');
  // CR 0 may award 0 XP. Lair XP is additional to the ordinary CR XP.
  if (xp !== undefined && baseXp !== undefined)
    check('xp', xp, cr === 0 ? [0, baseXp] : [baseXp], (copy, next) => {
      copy.xp = Number(next);
    });
  if (proficiencyBonus !== undefined && pb !== undefined)
    check('proficiency', proficiencyBonus, [pb], (copy, next) => {
      copy.proficiencyBonus = Number(next);
    });
  if (cr !== undefined && xp !== undefined && baseXp !== xp && !(cr === 0 && xp === 0)) {
    const fromXp = xp === 0 ? 0 : Array.from(XP_BY_CR).find(([, value]) => value === xp)?.[0];
    if (fromXp !== undefined && oneSubstitution(String(cr), String(fromXp)))
      candidates.push({
        field: 'challenge',
        from: cr,
        to: fromXp,
        apply: (copy) => {
          copy.cr = fromXp;
          copy.proficiencyBonus ??= proficiencyForCr(fromXp);
        },
      });
  }

  if (pb !== undefined) {
    for (const ability of ABILITIES) {
      const bonus = creature.saves[ability];
      const base = mod(ability);
      if (bonus !== undefined && base !== undefined)
        check(`save:${ability}`, bonus, [base + pb, base + 2 * pb], (copy, next) => {
          copy.saves[ability] = Number(next);
        });
    }
    for (const skill of SKILLS) {
      const bonus = creature.skills[skill];
      const base = mod(SKILL_ABILITY[skill]);
      if (bonus !== undefined && base !== undefined)
        check(`skill:${skill}`, bonus, [base + pb, base + 2 * pb], (copy, next) => {
          copy.skills[skill] = Number(next);
        });
    }
  }
  const perception = creature.skills.perception ?? mod('WIS');
  if (perception !== undefined && creature.senses.passivePerception !== undefined)
    check(
      'passive-perception',
      creature.senses.passivePerception,
      [10 + perception],
      (copy, next) => {
        copy.senses.passivePerception = Number(next);
      },
    );

  if (pb !== undefined) checkEntries(creature, pb, mod, check, add);
  return { findings, candidates };
}

const spellAbility = (text: string): Ability | undefined => {
  const match =
    /spellcasting ability (?:is|uses) (strength|dexterity|constitution|intelligence|wisdom|charisma)\b/i.exec(
      text,
    ) ??
    /\b(strength|dexterity|constitution|intelligence|wisdom|charisma) as (?:the|its) (?:innate )?spellcasting ability\b/i.exec(
      text,
    );
  return match?.[1]?.slice(0, 3).toUpperCase() as Ability | undefined;
};

function checkEntries(
  creature: NamedCreature,
  pb: number,
  mod: (ability: Ability) => number | undefined,
  check: (field: string, observed: number | string, expected: readonly (number | string)[]) => void,
  add: (code: string, message: string) => void,
) {
  const entries = ENTRY_LISTS.flatMap((list) => creature[list]);
  const caster = [...new Set(entries.flatMap((entry) => spellAbility(entry.text) ?? []))];
  for (const list of ENTRY_LISTS) {
    for (const [i, entry] of creature[list].entries()) {
      const field = `${list}:${i}:${entry.name}`;
      const attack = /\b(?:melee|ranged)(?:\s+or\s+ranged)?\s+(weapon|spell)\s+attack\b/i.exec(
        entry.text,
      );
      if (attack) {
        const weapon = attack[1]!.toLowerCase() === 'weapon';
        const abilities = weapon ? (['STR', 'DEX'] as const) : caster.length === 1 ? caster : [];
        const mods = abilities.flatMap((ability) => mod(ability) ?? []);
        if (entry.attackBonus === undefined)
          add(`${field}:attack`, `${entry.name}: attack bonus was not read.`);
        else {
          check(
            `${field}:attack`,
            entry.attackBonus,
            mods.map((value) => pb + value),
          );
          const matching = mods.filter((value) => value + pb === entry.attackBonus);
          const damage = entry.damage?.[0] && rollParts(entry.damage[0].dice);
          if (weapon && damage) check(`${field}:damage`, damage.bonus, matching);
        }
      }
      const ability = spellAbility(entry.text);
      const casting = ability === undefined ? undefined : mod(ability);
      const dc = /\bspell\s+save\s+DC\s*(\d+)\b/i.exec(entry.text);
      if (dc && casting !== undefined)
        check(`${field}:spell-dc`, Number(dc[1]), [8 + pb + casting]);
      else if (dc)
        add(
          `${field}:spell-dc`,
          `${entry.name}: spellcasting ability is needed to check the save DC.`,
        );
    }
  }
}

function parserFindings(creature: NamedCreature): Finding[] {
  return creature.issues.map((message, index) => ({
    code: `parse:${index}`,
    severity: 'review',
    message,
  }));
}

/** A correction is accepted only when precisely one candidate clears every math finding. */
export function validateCreature(creature: NamedCreature): ValidatedCreature {
  const original = collect(creature);
  const parser = parserFindings(creature);
  const ancillary = parser.filter(
    ({ message }) =>
      !/hit points \d+ do not match|^[A-Z]{3} \d+ does not match modifier/.test(message),
  );
  if (!ancillary.length && original.candidates.length) {
    const checked = original.candidates.flatMap(({ apply, ...correction }) => {
      const copy = structuredClone(creature);
      apply(copy);
      const next = collect(copy).findings;
      if (next.length) return [];
      copy.issues = [];
      return [{ creature: copy, correction }];
    });
    if (checked.length === 1) return { ...checked[0]!, findings: [] };
  }
  return { creature, findings: [...original.findings, ...parser] };
}
