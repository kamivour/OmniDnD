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
