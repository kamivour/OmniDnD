import type { Ability } from '../../engine/calc/abilities';
import { optionalRules } from '../../engine/calc/campaign-rules';
import { levelSpellGains } from '../../engine/calc/level-spells';
import { MULTICLASS_RULES, type MulticlassRule } from '../../engine/calc/multiclass';
import { averageHpRoll, type HitDie } from '../../engine/calc/hp';
import type { ClassDef, HitDieName, SubclassDef } from '../../engine/schema';
import type { Skill } from '../../engine/rules2014';
import { computeSheet, type CharacterState, type Sheet } from '../../engine/calc/sheet';
import { levelHp } from '../../engine/calc/hp';
import { spellSelectionDetails } from '../../engine/calc/spell-selections';
import { overridePath } from '../../engine/calc/value-overrides';
import { levelUp, type LevelUpPayload } from '../../engine/commands/level';
import { runCommand, type Automation } from '../../engine/commands/runner';
import type { Registry } from '../../engine/registry';
import { resourceOverride } from '../components/resource-override';

export interface LevelUpChange {
  label: string;
  before: string;
  after: string;
  beforeNote?: string;
  afterNote?: string;
}

/** Both results are discarded. Apply still performs the real warning check and command. */
export function previewLevelUp(
  state: CharacterState,
  registry: Registry,
  payload: LevelUpPayload,
  automation: Automation = 'assisted',
) {
  const options = {
    eventId: 'preview.level-up',
    realTime: '1970-01-01T00:00:00.000Z',
    automation,
  };
  const checked = runCommand(levelUp, state, payload, registry, options);
  if (checked.result !== 'warn') return { ...checked, warnings: [] as string[] };
  const projected = runCommand(levelUp, state, payload, registry, { ...options, force: true });
  return { ...projected, warnings: checked.reasons };
}

const pool = (max: number, spent: number) => `${Math.max(0, max - spent)} / ${max}`;
const totalLevel = (state: CharacterState) =>
  state.build.classes.reduce((sum, entry) => sum + entry.level, 0);
const noteAt = (sheet: Sheet, path: string) => sheet.values[path]?.stat.override?.note;

/** Advancement can add pools and change their capacities; each side uses its own Sheet. */
export function levelUpChanges(
  before: CharacterState,
  after: CharacterState,
  registry: Registry,
  classId: string,
): LevelUpChange[] {
  const previous = computeSheet(before, registry);
  const next = computeSheet(after, registry);
  const className = registry.get('class', classId).name;
  const rows: LevelUpChange[] = [
    {
      label: 'Recorded character level',
      before: String(totalLevel(before)),
      after: String(totalLevel(after)),
    },
    {
      label: `${className} class level`,
      before: String(before.build.classes.find((entry) => entry.classId === classId)?.level ?? 0),
      after: String(after.build.classes.find((entry) => entry.classId === classId)?.level ?? 0),
    },
    { label: 'Current HP', before: String(before.live.hp), after: String(after.live.hp) },
    {
      label: 'Maximum HP',
      before: String(previous.maxHp.value),
      after: String(next.maxHp.value),
      beforeNote: previous.maxHp.override?.note,
      afterNote: next.maxHp.override?.note,
    },
  ];
  const entry = after.build.hpEntries.at(-1);
  if (entry && after.build.hpEntries.length > before.build.hpEntries.length) {
    const contribution = levelHp(
      entry.value,
      next.abilities.CON.mod,
      entry.floor ?? after.campaign.hpLevelFloor,
    );
    const con = `${next.abilities.CON.mod >= 0 ? '+' : ''}${next.abilities.CON.mod}`;
    const raw = entry.value + next.abilities.CON.mod;
    const calculation =
      contribution === raw ? `${raw} HP` : `${raw}; minimum 1 gives ${contribution} HP`;
    rows.splice(2, 0, {
      label: 'New HP entry',
      before: 'Not recorded',
      after: `Level ${entry.level}: ${entry.method === 'rolled' ? 'roll' : 'average'} ${entry.value} + CON (${con}) = ${calculation} entry, before maximum HP adjustments`,
    });
  }
  const dice = new Set([...previous.hitDice, ...next.hitDice].map(({ die }) => die));
  for (const die of dice) {
    const oldMax = previous.hitDice.find((entry) => entry.die === die)?.max ?? 0;
    const newMax = next.hitDice.find((entry) => entry.die === die)?.max ?? 0;
    const path = overridePath('hitDice', die, 'max');
    rows.push({
      label: `${die} Hit Dice`,
      before: pool(oldMax, before.live.hitDiceSpent[die] ?? 0),
      after: pool(newMax, after.live.hitDiceSpent[die] ?? 0),
      beforeNote: resourceOverride(
        before.build,
        previous,
        path,
        overridePath('hitDice', die, 'remaining'),
        before.live.hitDiceSpent[die] ?? 0,
        oldMax,
      )?.note,
      afterNote: resourceOverride(
        after.build,
        next,
        path,
        overridePath('hitDice', die, 'remaining'),
        after.live.hitDiceSpent[die] ?? 0,
        newMax,
      )?.note,
    });
  }
  for (let level = 1; level <= 9; level += 1) {
    const oldMax = previous.slots.max[level] ?? 0;
    const newMax = next.slots.max[level] ?? 0;
    const oldValue = pool(oldMax, before.live.slotsUsed[level] ?? 0);
    const newValue = pool(newMax, after.live.slotsUsed[level] ?? 0);
    if (oldValue === newValue) continue;
    const path = overridePath('slots', 'max', level);
    rows.push({
      label: `Level ${level} spell slots`,
      before: oldValue,
      after: newValue,
      beforeNote: resourceOverride(
        before.build,
        previous,
        path,
        overridePath('slots', 'remaining', level),
        before.live.slotsUsed[level] ?? 0,
        oldMax,
      )?.note,
      afterNote: resourceOverride(
        after.build,
        next,
        path,
        overridePath('slots', 'remaining', level),
        after.live.slotsUsed[level] ?? 0,
        newMax,
      )?.note,
    });
  }
  if (previous.slots.pact || next.slots.pact) {
    const pactText = (state: CharacterState, sheet: Sheet) =>
      sheet.slots.pact
        ? `${pool(sheet.slots.pact.count, state.live.pactSlotsUsed ?? 0)} at level ${sheet.slots.pact.level}`
        : 'None';
    const oldValue = pactText(before, previous);
    const newValue = pactText(after, next);
    if (oldValue !== newValue)
      rows.push({
        label: 'Pact Magic slots',
        before: oldValue,
        after: newValue,
        beforeNote:
          [
            resourceOverride(
              before.build,
              previous,
              '/slots/pact/count',
              '/slots/pact/remaining',
              before.live.pactSlotsUsed ?? 0,
              previous.slots.pact?.count ?? 0,
            )?.note,
            noteAt(previous, '/slots/pact/level'),
          ]
            .filter(Boolean)
            .join('; ') || undefined,
        afterNote:
          [
            resourceOverride(
              after.build,
              next,
              '/slots/pact/count',
              '/slots/pact/remaining',
              after.live.pactSlotsUsed ?? 0,
              next.slots.pact?.count ?? 0,
            )?.note,
            noteAt(next, '/slots/pact/level'),
          ]
            .filter(Boolean)
            .join('; ') || undefined,
      });
  }
  const features = new Set([...previous.features, ...next.features].map(({ def }) => def.id));
  for (const featureId of features) {
    const oldFeature = previous.features.find(({ def }) => def.id === featureId);
    const newFeature = next.features.find(({ def }) => def.id === featureId);
    const name = newFeature?.def.name ?? oldFeature!.def.name;
    if (oldFeature?.uses?.recharge !== newFeature?.uses?.recharge) {
      const recharge = {
        short: 'Short rest',
        long: 'Long rest',
        dawn: 'Dawn',
        none: 'Manual adjustment',
      };
      rows.push({
        label: `${name} recharge`,
        before: oldFeature?.uses ? recharge[oldFeature.uses.recharge] : 'None',
        after: newFeature?.uses ? recharge[newFeature.uses.recharge] : 'None',
      });
    }
    if (oldFeature?.uses || newFeature?.uses) {
      const oldValue = pool(
        oldFeature?.uses?.max ?? 0,
        before.live.featureUsesSpent[featureId] ?? 0,
      );
      const newValue = pool(
        newFeature?.uses?.max ?? 0,
        after.live.featureUsesSpent[featureId] ?? 0,
      );
      if (oldValue !== newValue) {
        const path = overridePath('features', featureId, 'uses', 'max');
        rows.push({
          label: `${name} uses`,
          before: oldValue,
          after: newValue,
          beforeNote: oldFeature?.uses
            ? resourceOverride(
                before.build,
                previous,
                path,
                overridePath('features', featureId, 'uses', 'remaining'),
                before.live.featureUsesSpent[featureId] ?? 0,
                oldFeature.uses.max,
              )?.note
            : undefined,
          afterNote: newFeature?.uses
            ? resourceOverride(
                after.build,
                next,
                path,
                overridePath('features', featureId, 'uses', 'remaining'),
                after.live.featureUsesSpent[featureId] ?? 0,
                newFeature.uses.max,
              )?.note
            : undefined,
        });
      }
    }
    if (oldFeature?.die !== newFeature?.die)
      rows.push({
        label: `${name} die`,
        before: oldFeature?.die ?? 'None',
        after: newFeature?.die ?? 'None',
        beforeNote: oldFeature?.dieOverride?.note,
        afterNote: newFeature?.dieOverride?.note,
      });
  }
  const gained = next.features
    .filter(({ def }) => !previous.features.some((row) => row.def.id === def.id))
    .map(({ def }) => def.name);
  if (gained.length > 0)
    rows.push({ label: 'New features', before: 'None', after: gained.join(', ') });
  const casters = new Set(
    [...previous.spellcasting, ...next.spellcasting].map(({ classId: id }) => id),
  );
  for (const casterId of casters) {
    const oldDetails = spellSelectionDetails({ ...before, sheet: previous, registry }, casterId);
    const newDetails = spellSelectionDetails({ ...after, sheet: next, registry }, casterId);
    const name = registry.get('class', casterId).name;
    for (const [key, label, pathKey] of [
      ['cantrips', 'cantrip limit', 'cantripsKnown'],
      ['known', 'known spells limit', 'spellsKnown'],
      ['prepared', 'prepared spells limit', 'preparedLimit'],
    ] as const) {
      const oldLimit = oldDetails[key].limit;
      const newLimit = newDetails[key].limit;
      if (oldLimit === newLimit) continue;
      const path = overridePath('spellcasting', casterId, pathKey);
      rows.push({
        label: `${name} ${label}`,
        before: oldLimit === undefined ? 'Not limited' : String(oldLimit),
        after: newLimit === undefined ? 'Not limited' : String(newLimit),
        beforeNote: noteAt(previous, path),
        afterNote: noteAt(next, path),
      });
    }
    if (oldDetails.maxSpellLevel !== newDetails.maxSpellLevel)
      rows.push({
        label: `${name} maximum spell level`,
        before: String(oldDetails.maxSpellLevel),
        after: String(newDetails.maxSpellLevel),
      });
  }
  return rows;
}

/** Everything the wizard can ask for beyond class and HP; empty values mean "decide later". */
export interface LevelPicks {
  skill: string;
  tool: string;
  subclassId: string;
  asiMode: 'later' | 'abilities' | 'feat';
  asiSplit: 'one' | 'two';
  ability1: Ability;
  ability2: Ability;
  featId: string;
  cantrips: string[];
  spells: string[];
  swapOut: string;
  swapIn: string;
}

export const emptyPicks: LevelPicks = {
  skill: '',
  tool: '',
  subclassId: '',
  asiMode: 'later',
  asiSplit: 'one',
  ability1: 'STR',
  ability2: 'DEX',
  featId: '',
  cantrips: [],
  spells: [],
  swapOut: '',
  swapIn: '',
};

/** Turns the wizard's picks into the `levelUp` payload fields. Spells are left out when `withSpells` is false. */
export function picksToPayload(
  picks: LevelPicks,
  needs: { subclass: boolean; asi: boolean },
  isNewClass: boolean,
  withSpells = true,
): Pick<LevelUpPayload, 'choices' | 'spells' | 'skill' | 'tool'> {
  const choices: NonNullable<LevelUpPayload['choices']> = {};
  if (needs.subclass && picks.subclassId) choices.subclassId = picks.subclassId;
  if (needs.asi && picks.asiMode === 'abilities')
    choices.asi = {
      kind: 'abilities',
      increases:
        picks.asiSplit === 'one'
          ? [{ ability: picks.ability1, value: 2 }]
          : [
              { ability: picks.ability1, value: 1 },
              { ability: picks.ability2, value: 1 },
            ],
    };
  if (needs.asi && picks.asiMode === 'feat' && picks.featId)
    choices.asi = { kind: 'feat', featId: picks.featId };
  const add = [...picks.cantrips, ...picks.spells];
  const spells: NonNullable<LevelUpPayload['spells']> = {};
  if (add.length > 0) spells.add = add;
  if (picks.swapOut && picks.swapIn) spells.swap = { remove: picks.swapOut, add: picks.swapIn };
  return {
    ...(Object.keys(choices).length > 0 ? { choices } : {}),
    ...(withSpells && Object.keys(spells).length > 0 ? { spells } : {}),
    ...(isNewClass && picks.skill ? { skill: picks.skill as Skill } : {}),
    ...(isNewClass && picks.tool ? { tool: picks.tool } : {}),
  };
}

export interface NewClassOption {
  classId: string;
  name: string;
  hitDie: HitDieName;
  average: number;
  rule: MulticlassRule;
}

/** Classes the character could start; the engine still checks the 13+ minimums. */
export function newClassOptions(state: CharacterState, registry: Registry): NewClassOption[] {
  if (!optionalRules(state.campaign).multiclassing) return [];
  const owned = new Set(state.build.classes.map((entry) => entry.classId));
  return [...registry.entries.values()]
    .filter(
      (entry): entry is ClassDef =>
        entry.kind === 'class' &&
        !owned.has(entry.id) &&
        state.campaign.sources.includes(entry.source) &&
        MULTICLASS_RULES[entry.id] !== undefined,
    )
    .map((entry) => ({
      classId: entry.id,
      name: entry.name,
      hitDie: entry.hitDie,
      average: averageHpRoll(Number(entry.hitDie.slice(1)) as HitDie),
      rule: MULTICLASS_RULES[entry.id]!,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const optionName = (registry: Registry, id: string) => registry.entries.get(id)?.name ?? id;

export function subclassOptions(state: CharacterState, registry: Registry, classId: string) {
  return [...registry.entries.values()]
    .filter(
      (entry): entry is SubclassDef =>
        entry.kind === 'subclass' &&
        entry.classId === classId &&
        state.campaign.sources.includes(entry.source),
    )
    .map((entry) => ({ id: entry.id, name: entry.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Feats the player may pick instead of an ability score improvement; empty when the campaign has feats off. */
export function featOptions(state: CharacterState, registry: Registry) {
  if (!optionalRules(state.campaign).feats) return [];
  const owned = new Set(state.build.featureIds);
  return [...registry.entries.values()]
    .filter(
      (entry) =>
        entry.kind === 'feature' &&
        entry.origin === 'feat' &&
        !owned.has(entry.id) &&
        state.campaign.sources.includes(entry.source),
    )
    .map((entry) => ({ id: entry.id, name: entry.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** What the new level lets this class learn. `next` is the character after the level, before any spell picks. */
export function levelSpellInfo(
  next: CharacterState,
  registry: Registry,
  classId: string,
  firstLevel: boolean,
) {
  const ctx = { ...next, sheet: computeSheet(next, registry), registry };
  const gains = levelSpellGains(ctx, classId, firstLevel);
  const details = spellSelectionDetails(ctx, classId);
  const known = new Set(details.selection.known);
  return {
    gains,
    cantrips: details.candidates.cantrips.filter((id) => !known.has(id)),
    spells: details.candidates.known.filter((id) => !known.has(id)),
    knownSpells: details.known.ids,
  };
}
