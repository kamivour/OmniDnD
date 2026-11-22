import { useState } from 'react';
import { registry } from '../../data/registry';
import {
  choiceLanguages,
  choiceSkills,
  choiceTools,
  chooseProficiencies,
  type ChooseProficienciesPayload,
} from '../../engine/commands';
import { computeSheet, type CharacterState } from '../../engine/calc/sheet';
import type { Proficiencies } from '../../engine/calc/proficiencies';
import type { ProficiencyChoice } from '../../engine/schema';
import type { Skill } from '../../engine/rules2014';
import { useCommand } from '../commands/command-context';
import { skillName } from '../format';

/** One option in a pick, written as `kind:value` so rows can share a single list of picks. */
type Token = string;

interface Option {
  token: Token;
  label: string;
  note?: string;
}

const KIND_NOUN: Record<ProficiencyChoice['kinds'][number], string> = {
  skill: 'skill',
  expertise: 'skill expertise',
  tool: 'tool',
  weapon: 'weapon',
  language: 'language',
  darkvision: 'darkvision',
};

function rowTitle(row: ProficiencyChoice) {
  const nouns = row.kinds.map((kind) => KIND_NOUN[kind]).join(' or ');
  return `Pick ${row.count} ${nouns}${row.expertise ? ' (with expertise)' : ''}`;
}

function rowOptions(row: ProficiencyChoice, have: Proficiencies): Option[] {
  const options: Option[] = [];
  for (const kind of row.kinds) {
    if (kind === 'skill' || kind === 'expertise')
      for (const skill of choiceSkills(row))
        options.push({
          token: `${kind}:${skill}`,
          label: skillName(skill),
          ...(kind === 'skill' && have.skills.includes(skill) && !row.expertise
            ? { note: 'proficient' }
            : {}),
          ...(kind === 'expertise' && !have.skills.includes(skill)
            ? { note: 'not proficient' }
            : {}),
        });
    if (kind === 'tool')
      for (const id of choiceTools(row, registry))
        options.push({
          token: `tool:${id}`,
          label: registry.entries.get(id)?.name ?? id,
          ...(have.tools.includes(id) ? { note: 'proficient' } : {}),
        });
    if (kind === 'weapon')
      for (const id of row.weapons ?? [])
        options.push({
          token: `weapon:${id}`,
          label: registry.entries.get(id)?.name ?? id,
          ...(have.weapons.includes(id) ? { note: 'proficient' } : {}),
        });
    if (kind === 'language')
      for (const language of choiceLanguages)
        options.push({
          token: `language:${language}`,
          label: language,
          ...(have.languages.includes(language) ? { note: 'known' } : {}),
        });
    if (kind === 'darkvision') options.push({ token: 'darkvision:60', label: 'Darkvision 60 ft' });
  }
  return options;
}

/** Spreads saved picks back over the rows, first row with room first. */
function initialRows(
  rows: readonly ProficiencyChoice[],
  saved: ChooseProficienciesPayload | undefined,
  options: Option[][],
): Token[][] {
  const tokens = [
    ...(saved?.skills ?? []).map((value) => `skill:${value}`),
    ...(saved?.expertise ?? []).map((value) => `expertise:${value}`),
    ...(saved?.tools ?? []).map((value) => `tool:${value}`),
    ...(saved?.weapons ?? []).map((value) => `weapon:${value}`),
    ...(saved?.languages ?? []).map((value) => `language:${value}`),
    ...(saved?.darkvision ? ['darkvision:60'] : []),
  ];
  const result: Token[][] = rows.map(() => []);
  for (const token of tokens) {
    const at = rows.findIndex(
      (row, index) =>
        result[index]!.length < row.count &&
        options[index]!.some((option) => option.token === token),
    );
    if (at !== -1) result[at]!.push(token);
  }
  return result;
}

function toPayload(featureId: string, tokens: Token[]): ChooseProficienciesPayload {
  const of = (kind: string) =>
    tokens
      .filter((token) => token.startsWith(`${kind}:`))
      .map((token) => token.slice(kind.length + 1));
  const skills = of('skill') as Skill[];
  const expertise = of('expertise') as Skill[];
  const tools = of('tool');
  const weapons = of('weapon');
  const languages = of('language');
  return {
    featureId,
    ...(skills.length > 0 ? { skills } : {}),
    ...(expertise.length > 0 ? { expertise } : {}),
    ...(tools.length > 0 ? { tools } : {}),
    ...(weapons.length > 0 ? { weapons } : {}),
    ...(languages.length > 0 ? { languages } : {}),
    ...(tokens.includes('darkvision:60') ? { darkvision: true as const } : {}),
  };
}

/** Skills, tools, languages or darkvision for a race trait or feature such as Skill Versatility. */
export function ProficiencyPicksForm({
  featureId,
  state,
  onDone,
}: {
  featureId: string;
  state: CharacterState;
  onDone: () => void;
}) {
  const { run } = useCommand();
  const def = registry.get('feature', featureId);
  const rows = def.proficiencies?.choose ?? [];
  const saved = state.build.proficiencyPicks?.[featureId];
  // Mark what the character has from elsewhere, leaving out this feature's own picks.
  const sheet = computeSheet(
    {
      ...state,
      build: {
        ...state.build,
        proficiencyPicks: Object.fromEntries(
          Object.entries(state.build.proficiencyPicks ?? {}).filter(([id]) => id !== featureId),
        ),
      },
    },
    registry,
  );
  const options = rows.map((row) => rowOptions(row, sheet.proficiencies));
  const [chosen, setChosen] = useState<Token[][]>(() =>
    initialRows(rows, saved && { featureId, ...saved }, options),
  );
  const complete = rows.every((row, index) => chosen[index]!.length === row.count);
  const all = chosen.flat();

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row, index) => {
        const taken = chosen[index]!;
        return (
          <fieldset key={index} className="flex flex-col">
            <legend className="mb-1 text-sm text-text">
              {rowTitle(row)} ({taken.length} chosen)
            </legend>
            <div className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">
              {options[index]!.map((option) => {
                const checked = taken.includes(option.token);
                const elsewhere = !checked && all.includes(option.token);
                return (
                  <label
                    key={option.token}
                    className="flex min-h-11 items-center gap-2 text-sm text-text"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={elsewhere || (!checked && taken.length >= row.count)}
                      onChange={() =>
                        setChosen(
                          chosen.map((list, at) =>
                            at !== index
                              ? list
                              : checked
                                ? list.filter((token) => token !== option.token)
                                : [...list, option.token],
                          ),
                        )
                      }
                      className="size-4 accent-(--omni-accent)"
                    />
                    <span>
                      {option.label}
                      {option.note && (
                        <span className="ml-1 text-xs text-text-muted">({option.note})</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
      <div>
        <button
          type="button"
          disabled={!complete}
          onClick={() => run(chooseProficiencies, toPayload(featureId, all), undefined, onDone)}
          className="min-h-11 rounded-btn bg-accent px-4 font-semibold text-bg disabled:opacity-40"
        >
          Save choice
        </button>
      </div>
    </div>
  );
}
