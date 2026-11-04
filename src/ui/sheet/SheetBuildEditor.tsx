import { useId, useRef, useState } from 'react';
import { registry } from '../../data/registry';
import { ABILITIES, type Ability } from '../../engine/calc/abilities';
import {
  AbilityBasesSchema,
  abilityBaseIssues,
  pointBuyCost,
  type AbilityMethod,
} from '../../engine/calc/ability-methods';
import { computeSheet } from '../../engine/calc/sheet';
import {
  editBuild,
  previewBuildEdit,
  type EditBuildChanges,
} from '../../engine/commands/edit-build';
import { SKILLS } from '../../engine/rules2014';
import type { CharacterBuild, RaceDef, RefEntry } from '../../engine/schema';
import { useCommand } from '../commands/command-context';
import { Field, inputClass } from '../components/fields';
import { SectionLabel } from '../components/SectionLabel';
import { AbilityBaseInput } from '../components/AbilityBaseInput';
import { OverrideMarker } from '../components/StatChip';
import { signed } from '../format';
import { useCharacter } from '../hooks/useCharacter';

const card = 'flex min-w-0 flex-col gap-4 rounded-card border border-border bg-surface p-4';
const button = 'min-h-11 rounded-btn border border-border px-4 text-sm disabled:opacity-40';
const labelFor = (value: string) =>
  value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const abilityMethodLabel = (method: AbilityMethod) =>
  ({
    rolled: 'Rolled scores',
    'standard-array': 'Standard array',
    'point-buy': 'Point buy',
  })[method];

interface Choice {
  id: string;
  name: string;
  available?: boolean;
}

function ChoiceList({
  label,
  options,
  selected,
  onChange,
  disabled,
}: {
  label: string;
  options: Choice[];
  selected: readonly string[];
  onChange: (id: string, checked: boolean) => void;
  disabled?: (id: string) => boolean;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-semibold text-text">{label}</legend>
      <div className="grid min-w-0 gap-x-4 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option.id}
            className="flex min-h-11 min-w-0 items-center gap-2 rounded-btn px-1 text-sm text-text has-disabled:text-text-muted"
          >
            <input
              type="checkbox"
              checked={selected.includes(option.id)}
              disabled={
                (option.available === false && !selected.includes(option.id)) ||
                disabled?.(option.id)
              }
              onChange={(event) => onChange(option.id, event.target.checked)}
              className="size-4 shrink-0 accent-(--omni-accent)"
            />
            <span className="min-w-0 wrap-anywhere">{option.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ReferenceSelect({
  id,
  label,
  options,
  value,
  onChange,
  required = false,
}: {
  id: string;
  label: string;
  options: Choice[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <Field label={label} htmlFor={id} className="min-w-0">
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className={inputClass}
      >
        <option value="" disabled={required}>
          {required ? 'Choose…' : 'None recorded'}
        </option>
        {options.map((option) => (
          <option
            key={option.id}
            value={option.id}
            disabled={option.available === false && option.id !== value}
          >
            {option.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Match only unambiguous racial-choice rows; unrelated saved bonuses stay untouched. */
function initialRacialChoices(build: CharacterBuild, race: RaceDef | undefined): Ability[] {
  if (!race?.abilityChoices) return [];
  const candidates = build.abilityScores.bonuses
    .map((bonus, index) => ({ ...bonus, index }))
    .filter((bonus) => bonus.source === build.raceId || bonus.source === build.subraceId);
  const fixed = new Set<number>();
  for (const grant of race.abilityBonuses) {
    const matches = candidates.filter(
      (bonus) =>
        !fixed.has(bonus.index) && grant.ability === bonus.ability && grant.value === bonus.value,
    );
    if (matches.length === 1) fixed.add(matches[0]!.index);
  }
  const selected = candidates.filter(
    (bonus) =>
      !fixed.has(bonus.index) &&
      bonus.value === race.abilityChoices!.value &&
      !race.abilityChoices!.exclude?.includes(bonus.ability),
  );
  return selected.length === race.abilityChoices.count &&
    new Set(selected.map((bonus) => bonus.ability)).size === selected.length
    ? selected.map((bonus) => bonus.ability)
    : [];
}

/** Staged build choices. Saving sends changed fields through one logged engine command. */
export function SheetBuildEditor({ onDone }: { onDone: () => void }) {
  const { state, sheet } = useCharacter();
  const { campaign } = state;
  const { run } = useCommand();
  const prefix = useId();
  const [baseline] = useState(() => structuredClone(state.build));
  const [originalAbilityMethod] = useState(campaign.abilityMethod);
  const [bases, setBases] = useState(
    () =>
      Object.fromEntries(
        ABILITIES.map((ability) => [ability, String(baseline.abilityScores.base[ability])]),
      ) as Record<Ability, string>,
  );
  const originalRace = registry.entries.get(baseline.subraceId ?? baseline.raceId);
  const [originalChoices] = useState(() =>
    initialRacialChoices(baseline, originalRace?.kind === 'race' ? originalRace : undefined),
  );
  const [name, setName] = useState(baseline.name);
  const [alignment, setAlignment] = useState(baseline.alignment ?? '');
  const [raceId, setRaceId] = useState(baseline.raceId);
  const [subraceId, setSubraceId] = useState(baseline.subraceId ?? '');
  const [backgroundId, setBackgroundId] = useState(baseline.backgroundId);
  const [subclasses, setSubclasses] = useState(() =>
    baseline.classes.map((entry) => entry.subclassId ?? ''),
  );
  const [proficiencies, setProficiencies] = useState(() => structuredClone(baseline.proficiencies));
  const [languages, setLanguages] = useState(baseline.proficiencies.languages.join('\n'));
  const [xp, setXp] = useState(baseline.xp === undefined ? '' : String(baseline.xp));
  const [racialChoices, setRacialChoices] = useState<Ability[]>(originalChoices);
  const [errors, setErrors] = useState<string[]>([]);
  const errorSummary = useRef<HTMLDivElement>(null);
  const references = [...registry.entries.values()].filter(
    (entry) => entry.ruleset === campaign.ruleset,
  );
  const available = (entry: RefEntry) => campaign.sources.includes(entry.source);
  const choicesFor = (entries: RefEntry[], retained: string[] = []): Choice[] => {
    const options = entries
      .filter((entry) => available(entry) || retained.includes(entry.id))
      .map((entry) => ({
        id: entry.id,
        name: `${entry.name}${available(entry) ? '' : ' (retained; source not enabled)'}`,
        available: available(entry),
      }));
    for (const id of retained) {
      if (!options.some((option) => option.id === id))
        options.push({
          id,
          name: `${registry.entries.get(id)?.name ?? id} (retained)`,
          available: false,
        });
    }
    return options.sort((first, second) => first.name.localeCompare(second.name));
  };
  const races = references.filter((entry) => entry.kind === 'race');
  const selectedRace = registry.entries.get(subraceId || raceId);
  const race = selectedRace?.kind === 'race' ? selectedRace : undefined;
  const raceChanged = raceId !== baseline.raceId || subraceId !== (baseline.subraceId ?? '');
  const bonusChoicesChanged =
    racialChoices.length !== originalChoices.length ||
    racialChoices.some((ability) => !originalChoices.includes(ability));
  const reviewRacialBonuses = raceChanged || bonusChoicesChanged;
  const skills = SKILLS.map((id) => ({ id, name: labelFor(id) }));
  const tools = choicesFor(
    references.filter(
      (entry) => entry.kind === 'item' && ['tool', 'instrument'].includes(entry.category),
    ),
    [...baseline.proficiencies.tools, ...proficiencies.tools],
  );
  const toolExpertise = choicesFor(
    references.filter(
      (entry) => entry.kind === 'item' && ['tool', 'instrument'].includes(entry.category),
    ),
    [...baseline.proficiencies.expertise, ...proficiencies.expertise].filter((id) =>
      id.startsWith('item.'),
    ),
  );
  const toggleProficiency = (
    key: keyof CharacterBuild['proficiencies'],
    id: string,
    checked: boolean,
  ) =>
    setProficiencies((current) => ({
      ...current,
      [key]: checked ? [...current[key], id] : current[key].filter((value) => value !== id),
    }));
  const changes: EditBuildChanges = {};
  if (name !== baseline.name && name.trim() !== baseline.name) changes.name = name.trim();
  if (
    alignment !== (baseline.alignment ?? '') &&
    (alignment.trim() || null) !== (baseline.alignment ?? null)
  )
    changes.alignment = alignment.trim() || null;
  if (raceId !== baseline.raceId) changes.raceId = raceId;
  if (subraceId !== (baseline.subraceId ?? '')) changes.subraceId = subraceId || null;
  if (backgroundId !== baseline.backgroundId) changes.backgroundId = backgroundId;
  const changedSubclasses = baseline.classes.flatMap((entry, index) =>
    subclasses[index] !== (entry.subclassId ?? '')
      ? [{ classId: entry.classId, subclassId: subclasses[index] || null }]
      : [],
  );
  if (changedSubclasses.length) changes.subclasses = changedSubclasses;
  const nextProficiencies =
    languages === baseline.proficiencies.languages.join('\n')
      ? proficiencies
      : {
          ...proficiencies,
          languages: languages
            .split('\n')
            .map((language) => language.trim())
            .filter(Boolean),
        };
  if (JSON.stringify(nextProficiencies) !== JSON.stringify(baseline.proficiencies))
    changes.proficiencies = nextProficiencies;
  const nextXp = xp.trim() ? Number(xp) : null;
  if (campaign.leveling === 'xp' && nextXp !== (baseline.xp ?? null)) changes.xp = nextXp;
  const enteredBases = Object.fromEntries(
    ABILITIES.map((ability) => [
      ability,
      bases[ability].trim() === '' ? NaN : Number(bases[ability]),
    ]),
  ) as Record<Ability, number>;
  const baseChanged = ABILITIES.some(
    (ability) => enteredBases[ability] !== baseline.abilityScores.base[ability],
  );
  const parsedBases = AbilityBasesSchema.safeParse(enteredBases);
  const baseIssues = parsedBases.success
    ? abilityBaseIssues(campaign.abilityMethod, parsedBases.data)
    : [
        campaign.abilityMethod === 'standard-array'
          ? 'Assign each standard-array score once: 15, 14, 13, 12, 10, 8'
          : `Enter six whole base scores between ${campaign.abilityMethod === 'point-buy' ? '8 and 15' : '3 and 18'}.`,
      ];
  const methodChanged = campaign.abilityMethod !== originalAbilityMethod;
  const baseStateChanged = ABILITIES.some(
    (ability) => state.build.abilityScores.base[ability] !== baseline.abilityScores.base[ability],
  );
  const baseBlocked = baseChanged && (baseIssues.length > 0 || methodChanged || baseStateChanged);
  if (baseChanged && parsedBases.success) changes.abilityBases = parsedBases.data;
  const hasChanges = Object.keys(changes).length > 0 || bonusChoicesChanged;
  const pointCost = pointBuyCost(enteredBases);
  const previewChanges: EditBuildChanges = {};
  if (changes.raceId !== undefined) previewChanges.raceId = changes.raceId;
  if (changes.subraceId !== undefined) previewChanges.subraceId = changes.subraceId;
  if (baseChanged && parsedBases.success && !baseBlocked)
    previewChanges.abilityBases = parsedBases.data;
  const previewRequested = baseChanged || reviewRacialBonuses;
  const preview =
    previewRequested && !baseBlocked && !baseStateChanged
      ? previewBuildEdit(
          { ...state, sheet, registry },
          {
            changes: previewChanges,
            expected: baseline,
            ...(baseChanged ? { expectedAbilityMethod: originalAbilityMethod } : {}),
            ...(reviewRacialBonuses ? { racialChoices } : {}),
          },
        )
      : undefined;
  const previewBuild =
    !baseStateChanged && !baseBlocked
      ? previewRequested
        ? preview?.build
        : state.build
      : undefined;
  const abilityPreview = previewBuild
    ? computeSheet({ ...state, build: previewBuild }, registry)
    : undefined;
  const bonusEntries = previewBuild?.abilityScores.bonuses ?? state.build.abilityScores.bonuses;
  const previewProblems =
    preview?.checks.filter((check) => check.level === 'block').map((check) => check.reason) ?? [];

  return (
    <form
      aria-label="Edit character build"
      noValidate
      className="flex min-w-0 flex-col gap-4"
      onChange={() => errors.length > 0 && setErrors([])}
      onSubmit={(event) => {
        event.preventDefault();
        if (!hasChanges || baseBlocked) return;
        const result = run(
          editBuild,
          {
            changes,
            expected: baseline,
            ...(baseChanged ? { expectedAbilityMethod: originalAbilityMethod } : {}),
            ...(reviewRacialBonuses ? { racialChoices } : {}),
          },
          undefined,
          onDone,
        );
        if (result.result === 'blocked') {
          setErrors(result.reasons);
          requestAnimationFrame(() => errorSummary.current?.focus());
        }
      }}
    >
      <p className="text-sm text-text-muted">
        Review identity, base scores, racial bonus choices and proficiencies, then save them
        together. Cancel discards this draft.
      </p>
      {errors.length > 0 && (
        <div
          ref={errorSummary}
          role="alert"
          tabIndex={-1}
          className="rounded-card border border-warn bg-surface p-3 text-sm text-text"
        >
          <p className="font-semibold">Check these choices before saving:</p>
          <ul className="mt-2 list-disc pl-5">
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      <section aria-label="Identity choices" className={card}>
        <SectionLabel>Identity</SectionLabel>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field label="Character name" htmlFor={`${prefix}-name`}>
            <input
              id={`${prefix}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Alignment" htmlFor={`${prefix}-alignment`}>
            <input
              id={`${prefix}-alignment`}
              value={alignment}
              onChange={(event) => setAlignment(event.target.value)}
              className={inputClass}
            />
          </Field>
          {campaign.leveling === 'xp' && (
            <Field label="XP" htmlFor={`${prefix}-xp`} hint="Leave empty to stop tracking XP.">
              <input
                id={`${prefix}-xp`}
                type="number"
                min={0}
                step={1}
                value={xp}
                onChange={(event) => setXp(event.target.value)}
                className={inputClass}
              />
            </Field>
          )}
          <ReferenceSelect
            id={`${prefix}-race`}
            label="Race"
            options={choicesFor(
              races.filter((entry) => !entry.subraceOf),
              [baseline.raceId, raceId],
            )}
            value={raceId}
            required
            onChange={(id) => {
              setRaceId(id);
              setSubraceId(id === baseline.raceId ? (baseline.subraceId ?? '') : '');
              setRacialChoices(id === baseline.raceId ? originalChoices : []);
            }}
          />
          <ReferenceSelect
            id={`${prefix}-subrace`}
            label="Subrace"
            options={choicesFor(
              races.filter((entry) => entry.subraceOf === raceId),
              [baseline.subraceId, subraceId].filter((id): id is string => !!id),
            )}
            value={subraceId}
            onChange={(id) => {
              setSubraceId(id);
              setRacialChoices(
                raceId === baseline.raceId && id === (baseline.subraceId ?? '')
                  ? originalChoices
                  : [],
              );
            }}
          />
          <ReferenceSelect
            id={`${prefix}-background`}
            label="Background"
            options={choicesFor(
              references.filter((entry) => entry.kind === 'background'),
              [baseline.backgroundId, backgroundId],
            )}
            value={backgroundId}
            onChange={setBackgroundId}
            required
          />
          {baseline.classes.map((entry, index) => (
            <ReferenceSelect
              key={`${entry.classId}:${index}`}
              id={`${prefix}-subclass-${index}`}
              label={`${registry.entries.get(entry.classId)?.name ?? entry.classId} subclass`}
              options={choicesFor(
                references.filter(
                  (reference) =>
                    reference.kind === 'subclass' && reference.classId === entry.classId,
                ),
                [entry.subclassId, subclasses[index]].filter((id): id is string => !!id),
              )}
              value={subclasses[index] ?? ''}
              onChange={(id) =>
                setSubclasses((current) =>
                  current.map((value, row) => (row === index ? id : value)),
                )
              }
            />
          ))}
        </div>
        <p className="text-xs text-text-muted">
          Changing race clears an incompatible subrace. Race and background changes retain your
          recorded proficiencies and languages; review those choices below.
        </p>
      </section>
      <section aria-label="Ability base scores" className={card}>
        <SectionLabel>Base ability scores</SectionLabel>
        <p id={`${prefix}-ability-method`} className="text-sm text-text">
          {abilityMethodLabel(campaign.abilityMethod)}.{' '}
          {campaign.abilityMethod === 'rolled'
            ? 'Type each rolled base score. Bonuses are added separately.'
            : campaign.abilityMethod === 'standard-array'
              ? 'Assign 15, 14, 13, 12, 10 and 8, each once. Bonuses are added separately.'
              : 'Choose base scores from 8 to 15, spending up to 27 points. Bonuses are added separately.'}
        </p>
        {campaign.abilityMethod === 'point-buy' && (
          <p
            className={`sticky top-[var(--character-header-height)] z-10 bg-surface py-2 text-sm ${pointCost !== undefined && pointCost > 27 ? 'text-warn' : 'text-text'}`}
            aria-live="polite"
          >
            Points used: {pointCost ?? '—'} / 27
            {pointCost !== undefined &&
              (pointCost > 27
                ? ` · ${pointCost - 27} over budget`
                : ` · ${27 - pointCost} remaining`)}
          </p>
        )}
        {!baseChanged && baseIssues.length > 0 && (
          <p className="text-sm text-text-muted">
            Recorded base scores do not match this campaign's current method. They stay recorded
            unless you edit base scores.
          </p>
        )}
        {methodChanged && (
          <p role="status" className="text-sm text-warn">
            The campaign's ability method changed from {abilityMethodLabel(originalAbilityMethod)}{' '}
            to {abilityMethodLabel(campaign.abilityMethod)}. Your draft is kept; close and reopen
            Edit mode before saving edited base scores.
          </p>
        )}
        {baseStateChanged && (
          <p role="status" className="text-sm text-warn">
            Recorded base scores changed after editing began. Your draft is kept; close and reopen
            Edit mode before changing base scores.
          </p>
        )}
        {baseChanged && baseIssues.length > 0 && (
          <ul role="alert" className="list-disc pl-5 text-sm text-warn">
            {baseIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
        {previewProblems.length > 0 && (
          <p className="text-sm text-warn">
            Complete the ability and racial choices for a score preview. {previewProblems.join(' ')}
          </p>
        )}
        <p className="text-xs text-text-muted">
          Each bonus keeps its recorded source.{' '}
          {previewBuild
            ? 'Scores and modifiers below use the staged choices.'
            : 'Bonus sources below show recorded entries while the preview is incomplete.'}
        </p>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ABILITIES.map((ability) => {
            const score = abilityPreview?.abilities[ability].score;
            const modifier = abilityPreview?.values[`/abilities/${ability}/mod`]?.stat;
            const bonuses = bonusEntries.filter((bonus) => bonus.ability === ability);
            return (
              <div
                key={ability}
                className="flex min-w-0 flex-col gap-3 rounded-card border border-border p-3"
              >
                <h3 className="text-sm font-semibold text-accent">{ability}</h3>
                <Field label="Base" htmlFor={`${prefix}-base-${ability}`}>
                  <AbilityBaseInput
                    ability={ability}
                    id={`${prefix}-base-${ability}`}
                    method={campaign.abilityMethod}
                    value={bases[ability]}
                    onChange={(value) => setBases((current) => ({ ...current, [ability]: value }))}
                    className={inputClass}
                    describedBy={`${prefix}-ability-method`}
                    invalid={baseChanged && baseIssues.length > 0}
                  />
                </Field>
                <dl className="grid min-w-0 grid-cols-2 gap-2 text-sm">
                  <div className="min-w-0">
                    <dt className="text-xs text-text-muted">Score</dt>
                    <dd className="wrap-anywhere font-semibold text-text">
                      <output aria-label={`${ability} score preview`}>
                        {score?.value ?? '—'}
                        <OverrideMarker override={score?.override} />
                      </output>
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-text-muted">Modifier</dt>
                    <dd className="wrap-anywhere font-semibold text-text">
                      <output aria-label={`${ability} modifier preview`}>
                        {abilityPreview ? signed(abilityPreview.abilities[ability].mod) : '—'}
                        <OverrideMarker override={modifier?.override} />
                      </output>
                    </dd>
                  </div>
                </dl>
                {score?.override && (
                  <p className="text-xs text-text-muted">
                    Calculated score {score.override.calculated} before override:{' '}
                    {score.override.note}.
                  </p>
                )}
                {modifier?.override && (
                  <p className="text-xs text-text-muted">
                    Calculated modifier {signed(modifier.override.calculated)} before override:{' '}
                    {modifier.override.note}.
                  </p>
                )}
                <div className="min-w-0">
                  <p className="mb-1 text-xs text-text-muted">Bonus sources</p>
                  <ul
                    aria-label={`${ability} bonus sources`}
                    className="flex min-w-0 flex-col gap-1 text-xs text-text-muted"
                  >
                    {bonuses.length ? (
                      bonuses.map((bonus, index) => (
                        <li
                          key={`${bonus.source}-${index}`}
                          className="flex min-w-0 justify-between gap-2"
                        >
                          <span className="min-w-0 wrap-anywhere">
                            {registry.entries.get(bonus.source)?.name ?? bonus.source}
                          </span>
                          <span className="min-w-0 wrap-anywhere text-right">
                            {signed(bonus.value)}
                          </span>
                        </li>
                      ))
                    ) : (
                      <li>No recorded bonuses</li>
                    )}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section aria-label="Racial ability bonuses" className={card}>
        <SectionLabel>Racial ability bonuses</SectionLabel>
        <p className="text-sm text-text">
          Fixed bonuses:{' '}
          {race?.abilityBonuses.length
            ? race.abilityBonuses
                .map(({ ability, value }) => `${ability} ${signed(value)}`)
                .join(' · ')
            : 'None recorded'}
        </p>
        <p className="text-xs text-text-muted">
          Bonus amounts come from the selected 2014 race. Unrelated saved bonuses stay as recorded.
        </p>
        {race?.abilityChoices && (
          <>
            <ChoiceList
              label={`Choose ${race.abilityChoices.count} racial bonus abilities (+${race.abilityChoices.value} each)`}
              options={ABILITIES.filter(
                (ability) => !race.abilityChoices?.exclude?.includes(ability),
              ).map((id) => ({ id, name: id }))}
              selected={racialChoices}
              disabled={(id) =>
                !racialChoices.includes(id as Ability) &&
                racialChoices.length >= race.abilityChoices!.count
              }
              onChange={(id, checked) =>
                setRacialChoices((current) =>
                  checked ? [...current, id as Ability] : current.filter((value) => value !== id),
                )
              }
            />
            <p className="text-xs text-text-muted" aria-live="polite">
              {racialChoices.length} of {race.abilityChoices.count} chosen.
              {!reviewRacialBonuses && ' Saving other fields keeps the recorded bonuses.'}
            </p>
          </>
        )}
      </section>
      <section aria-label="Proficiency choices" className={card}>
        <SectionLabel>Proficiencies and languages</SectionLabel>
        <p className="text-xs text-text-muted">
          Choose the proficiencies your rules and table grant. Equipment ownership does not limit
          tool proficiency. Retained entries stay selected until you remove them.
        </p>
        <ChoiceList
          label="Saving throw proficiency"
          options={ABILITIES.map((id) => ({ id, name: id }))}
          selected={proficiencies.saves}
          onChange={(id, checked) => toggleProficiency('saves', id, checked)}
        />
        <ChoiceList
          label="Skill proficiency"
          options={skills}
          selected={proficiencies.skills}
          disabled={(id) => proficiencies.expertise.includes(id)}
          onChange={(id, checked) => toggleProficiency('skills', id, checked)}
        />
        <ChoiceList
          label="Skill Expertise"
          options={skills}
          selected={proficiencies.expertise}
          disabled={(id) => !proficiencies.skills.includes(id as (typeof SKILLS)[number])}
          onChange={(id, checked) => toggleProficiency('expertise', id, checked)}
        />
        <p className="text-xs text-text-muted">
          Remove a skill's Expertise before removing its proficiency.
        </p>
        <ChoiceList
          label="Armor proficiency"
          options={['light', 'medium', 'heavy', 'shield'].map((id) => ({ id, name: labelFor(id) }))}
          selected={proficiencies.armor}
          onChange={(id, checked) => toggleProficiency('armor', id, checked)}
        />
        <details className="min-w-0">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm text-accent">
            Weapon proficiency ({proficiencies.weapons.length} selected)
          </summary>
          <ChoiceList
            label="Weapon categories and individual weapons"
            options={[
              { id: 'simple', name: 'Simple weapons' },
              { id: 'martial', name: 'Martial weapons' },
              ...choicesFor(
                references.filter((entry) => entry.kind === 'item' && entry.category === 'weapon'),
                [...baseline.proficiencies.weapons, ...proficiencies.weapons].filter((id) =>
                  id.startsWith('item.'),
                ),
              ),
            ]}
            selected={proficiencies.weapons}
            onChange={(id, checked) => toggleProficiency('weapons', id, checked)}
          />
        </details>
        <details className="min-w-0">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm text-accent">
            Tool and instrument proficiency ({proficiencies.tools.length} selected)
          </summary>
          <ChoiceList
            label="Tool and instrument proficiency"
            options={tools}
            selected={proficiencies.tools}
            onChange={(id, checked) => toggleProficiency('tools', id, checked)}
          />
        </details>
        <details className="min-w-0">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm text-accent">
            Tool Expertise
          </summary>
          <ChoiceList
            label="Tool Expertise"
            options={toolExpertise}
            selected={proficiencies.expertise}
            disabled={(id) =>
              !proficiencies.tools.includes(id) && !proficiencies.expertise.includes(id)
            }
            onChange={(id, checked) => toggleProficiency('expertise', id, checked)}
          />
        </details>
        <Field label="Languages" htmlFor={`${prefix}-languages`} hint="One language per line.">
          <textarea
            id={`${prefix}-languages`}
            rows={4}
            value={languages}
            onChange={(event) => setLanguages(event.target.value)}
            className={`${inputClass} py-2`}
          />
        </Field>
      </section>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onDone} className={button}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={!hasChanges || baseBlocked}
          className={`${button} bg-accent font-semibold text-bg`}
        >
          Save changes
        </button>
      </div>
    </form>
  );
}
