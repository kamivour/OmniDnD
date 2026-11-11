import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { Link, useNavigate } from 'react-router';
import { ZodError } from 'zod';
import { registry } from '../../data/registry';
import { ABILITIES, abilityModifier, type Ability } from '../../engine/calc/abilities';
import { averageHpRoll, levelHp, maxHp, type HitDie } from '../../engine/calc/hp';
import { addCharacter } from '../../engine/commands/management';
import { createCharacter, POINT_BUY_COSTS, STANDARD_ARRAY } from '../../engine/creation';
import {
  SCHEMA_VERSION,
  type Campaign,
  type CharacterBuild,
  type ExportFile,
} from '../../engine/schema';
import { useCampaign } from '../hooks/useCampaign';
import { useManagement } from '../commands/useManagement';
import { Field, inputClass } from '../components/fields';
import { guidanceFor } from '../../data/guidance';
import { suggestAbilityBases, synergyNotes } from '../../engine/calc/suggestions';
import { OptionGuide } from '../components/OptionGuide';
import { AbilityBaseInput } from '../components/AbilityBaseInput';
import { SectionLabel } from '../components/SectionLabel';
import { ALIGNMENTS, alignmentLabel } from '../fixtures/new-character';
import { signed } from '../format';
import { computeSheet } from '../../engine/calc/sheet';
import { GuidedChoicesSection } from './GuidedChoicesSection';
import { emptyGuided, toGuidedChoices, type GuidedState } from './guided-state';
import { PlaceholderScreen } from './PlaceholderScreen';
import { deviceStore, type CreationMode } from '../../state/device-settings';
import { clearDraft, loadDraft, saveDraft } from './new-character-draft';
import { LevelChoicesSection } from './LevelChoicesSection';
import { PlayedByDialog } from '../roles/RoleDialogs';
import { useAskRoles } from '../roles/useAskRoles';
import { PLAYED_BY_OPTIONS } from '../campaignOptions';
import { Caution } from '../components/Caution';
import { focusNextOnEnter } from '../components/focus-next';
import { levelPickRows, STEPS, stepProblems, type StepId } from './new-character-steps';
import { emptyPicks, picksToPayload, type LevelPicks } from '../level/level-up-model';

type PerAbility<T> = Record<Ability, T>;
const perAbility = <T,>(value: T) =>
  Object.fromEntries(ABILITIES.map((a) => [a, value])) as PerAbility<T>;

const cell = 'px-2 py-1.5';
const small = 'min-h-11 w-16 rounded-btn border border-border bg-surface px-2 text-text';

/**
 * New character (SPEC §5 Characters). The campaign's methods decide which inputs appear (D14).
 * The user types choices and dice results; scores, modifiers, and max HP are computed.
 */
export function NewCharacterScreen() {
  const campaign = useCampaign();
  const [fresh, setFresh] = useState(0);
  if (!campaign) return <PlaceholderScreen title="Campaign not found" />;
  return (
    <NewCharacterForm
      key={`${campaign.id}:${fresh}`}
      campaign={campaign}
      onStartOver={() => {
        clearDraft(campaign.id);
        setFresh((count) => count + 1);
      }}
    />
  );
}

function NewCharacterForm({
  campaign,
  onStartOver,
}: {
  campaign: Campaign;
  onStartOver: () => void;
}) {
  const navigate = useNavigate();
  const { run, confirmation, pending } = useManagement();
  const available = [...registry.entries.values()]
    .filter((entry) => campaign.sources.includes(entry.source))
    .sort((a, b) => a.name.localeCompare(b.name));
  const races = available.filter((entry) => entry.kind === 'race');
  const classes = available.filter((entry) => entry.kind === 'class');
  const backgrounds = available.filter((entry) => entry.kind === 'background');
  const [id] = useState(() => crypto.randomUUID());
  const [draft] = useState(() => loadDraft(campaign.id));
  // A draft can outlive a change to the campaign's sources; drop ids the campaign no longer offers.
  const offered = (list: typeof available, value: string | undefined) =>
    value && list.some((entry) => entry.id === value) ? value : undefined;
  const askRoles = useAskRoles();
  const [playedBy, setPlayedBy] = useState<NonNullable<CharacterBuild['playedBy']>>('me');
  const [playedByAsked, setPlayedByAsked] = useState(false);
  const [name, setName] = useState(draft?.name ?? '');
  const [raceId, setRaceId] = useState(offered(races, draft?.raceId) ?? '');
  const [classId, setClassId] = useState(
    offered(classes, draft?.classId) ??
      (classes.some((entry) => entry.id === 'class.bard') ? 'class.bard' : ''),
  );
  const [backgroundId, setBackgroundId] = useState(offered(backgrounds, draft?.backgroundId) ?? '');
  const [alignment, setAlignment] = useState(alignmentLabel(draft?.alignment ?? ''));
  const [racialChoices, setRacialChoices] = useState<Ability[]>(
    (draft?.racialChoices as Ability[] | undefined) ?? [],
  );
  const [level, setLevel] = useState(draft?.level ?? 1);
  // What is typed in the Level box; it may be empty while the player retypes it.
  const [levelText, setLevelText] = useState<string | null>(null);
  const [bases, setBases] = useState<PerAbility<string>>(
    (draft?.bases as PerAbility<string> | undefined) ?? perAbility(''),
  );
  const [rolls, setRolls] = useState<string[]>(draft?.rolls ?? []);
  const [errors, setErrors] = useState<string[]>([]);
  const [guided, setGuided] = useState(draft?.guided ?? false);
  const [guidedState, setGuidedState] = useState<GuidedState>(
    () => (draft?.guidedState as GuidedState | undefined) ?? emptyGuided(classId),
  );
  const hints = useStore(deviceStore, (state) => state.beginnerHints);
  const savedMode = useStore(deviceStore, (state) => state.creationMode);
  const [mode, setMode] = useState<CreationMode>(draft?.mode ?? savedMode);
  const [stepIndex, setStepIndex] = useState(draft?.stepIndex ?? 0);
  const [stepErrors, setStepErrors] = useState<string[]>([]);
  const [levelPicks, setLevelPicks] = useState<Record<number, LevelPicks>>(
    (draft?.levelPicks as Record<number, LevelPicks> | undefined) ?? {},
  );
  useEffect(() => {
    saveDraft(campaign.id, {
      name,
      raceId,
      classId,
      backgroundId,
      alignment,
      racialChoices,
      level,
      bases,
      rolls,
      guided,
      guidedState,
      mode,
      stepIndex,
      levelPicks,
    });
  });
  const pickRows = levelPickRows(registry, classId, level);
  const steps = STEPS.filter((entry) => entry.id !== 'levels' || pickRows.length > 0);
  const at = Math.max(0, Math.min(stepIndex, steps.length - 1));
  const step: StepId = steps[at]!.id;
  const levelChoices = pickRows.flatMap((row) => {
    const { choices } = picksToPayload(levelPicks[row.level] ?? emptyPicks, row, false, false);
    return choices ? [{ level: row.level, choices }] : [];
  });
  const stepped = mode === 'steps';

  const race = races.find((entry) => entry.id === raceId);
  const classDef = classes.find((entry) => entry.id === classId);
  const die = classDef ? (Number(classDef.hitDie.slice(1)) as HitDie) : undefined;
  const average = die === undefined ? undefined : averageHpRoll(die);
  const bonuses = perAbility(0);
  race?.abilityBonuses.forEach(({ ability, value }) => {
    bonuses[ability] += value;
  });
  if (race?.abilityChoices) {
    for (const ability of racialChoices) bonuses[ability] += race.abilityChoices.value;
  }
  const score = (a: Ability) => (bases[a] === '' ? undefined : Number(bases[a]) + bonuses[a]);
  const con = score('CON');
  const conMod = con === undefined ? undefined : abilityModifier(con);
  const pointCost = ABILITIES.reduce(
    (sum, ability) => sum + (POINT_BUY_COSTS[Number(bases[ability])] ?? 0),
    0,
  );

  // Level 1 is the die maximum; later levels are typed rolls or the fixed average.
  const entries: (number | undefined)[] = Array.from({ length: level }, (_, i) => {
    if (die === undefined) return undefined;
    if (i === 0) return die;
    if (campaign.hpMethod === 'average') return average;
    const roll = rolls[i - 1] ? Number(rolls[i - 1]) : undefined;
    return roll !== undefined && Number.isInteger(roll) && roll >= 1 && roll <= die
      ? roll
      : undefined;
  });
  const complete = entries.every((e) => e !== undefined) && conMod !== undefined;
  const total = complete ? maxHp(entries as number[], conMod, campaign.hpLevelFloor) : undefined;

  // Spell choices need the character's numbers, so build the blank version once the basics are valid.
  const spellContext = (() => {
    if (!guided || !complete) return undefined;
    try {
      const draft = createCharacter(
        {
          id,
          name: name || 'Draft',
          campaign,
          raceId,
          classId,
          backgroundId,
          level,
          abilityBases: Object.fromEntries(
            ABILITIES.map((ability) => [ability, Number(bases[ability])]),
          ) as PerAbility<number>,
          racialChoices,
          hpRolls: campaign.hpMethod === 'rolled' ? Array.from({ length: level - 1 }, () => 1) : [],
        },
        registry,
      );
      const state = { campaign, ...draft };
      return { ...state, sheet: computeSheet(state, registry), registry };
    } catch {
      return undefined;
    }
  })();
  const review = (() => {
    if (!stepped || step !== 'review' || !complete) return undefined;
    try {
      const draft = createCharacter(
        {
          id,
          name,
          campaign,
          raceId,
          classId,
          backgroundId,
          alignment,
          level,
          abilityBases: Object.fromEntries(
            ABILITIES.map((ability) => [ability, Number(bases[ability])]),
          ) as PerAbility<number>,
          racialChoices,
          hpRolls: campaign.hpMethod === 'rolled' ? rolls.slice(0, level - 1).map(Number) : [],
          ...(levelChoices.length > 0 ? { levelChoices } : {}),
          ...(guided ? { guided: toGuidedChoices(guidedState) } : {}),
        },
        registry,
      );
      const state = { campaign, ...draft };
      return computeSheet(state, registry);
    } catch {
      return undefined;
    }
  })();
  const problems = stepProblems(step, {
    name,
    raceId,
    classId,
    backgroundId,
    level,
    bases,
    racialChoices,
    race,
    campaign,
    complete,
    pointCost,
  });
  const classGuidance = guidanceFor(classId);
  const synergies = hints
    ? synergyNotes(
        [guidanceFor(raceId), classGuidance, guidanceFor(backgroundId)],
        [raceId, classId, backgroundId],
      )
    : [];
  const nameOfId = (entryId: string) => registry.entries.get(entryId)?.name ?? entryId;
  const pickRace = (id: string) => {
    setRaceId(id);
    setRacialChoices([]);
  };
  const pickClass = (id: string) => {
    setClassId(id);
    setGuidedState(emptyGuided(id));
    setRolls([]);
    setLevelPicks({});
  };
  const show = (id: StepId) => !stepped || step === id;
  const goTo = (index: number) => {
    setStepErrors([]);
    setStepIndex(Math.max(0, Math.min(steps.length - 1, index)));
  };
  const next = () => {
    if (problems.length > 0) setStepErrors(problems);
    else goTo(at + 1);
  };
  const taken = [
    ...(registry.entries.get(backgroundId)?.kind === 'background'
      ? registry.get('background', backgroundId).skills
      : []),
  ];

  return (
    <form
      onChange={() => {
        if (errors.length > 0) setErrors([]);
      }}
      onSubmit={(e) => {
        e.preventDefault();
        if (stepped && step !== 'review') {
          next();
          return;
        }
        setErrors([]);
        try {
          const created = createCharacter(
            {
              id,
              name,
              campaign,
              raceId,
              classId,
              backgroundId,
              alignment,
              level,
              abilityBases: Object.fromEntries(
                ABILITIES.map((ability) => [ability, Number(bases[ability])]),
              ) as PerAbility<number>,
              racialChoices,
              hpRolls: campaign.hpMethod === 'rolled' ? rolls.slice(0, level - 1).map(Number) : [],
              ...(levelChoices.length > 0 ? { levelChoices } : {}),
              ...(guided ? { guided: toGuidedChoices(guidedState) } : {}),
            },
            registry,
          );
          const file: ExportFile = {
            app: 'omnidnd',
            schemaVersion: SCHEMA_VERSION,
            exportedAt: new Date().toISOString(),
            campaign,
            ...created,
            build: { ...created.build, ...(playedBy === 'me' ? {} : { playedBy }) },
          };
          const result = run(addCharacter, { file }, () => {
            clearDraft(campaign.id);
            void navigate(`/characters/${id}`);
          });
          if (result.result === 'blocked') setErrors(result.reasons);
        } catch (error) {
          setErrors(
            error instanceof ZodError
              ? error.issues.map((issue) => `${errorField(issue.path[0])}: ${issue.message}`)
              : [
                  error instanceof Error
                    ? error.message
                    : 'Could not create this character. Check the form and try again.',
                ],
          );
        }
      }}
      className="mx-auto flex max-w-3xl flex-col gap-6"
    >
      <PlayedByDialog
        open={askRoles && !playedByAsked}
        isDm={campaign.role === 'dm'}
        onChoose={(chosen) => {
          setPlayedBy(chosen);
          setPlayedByAsked(true);
        }}
      />
      <header>
        <h1 className="font-display text-xl text-text">New character</h1>
        <p className="text-xs text-text-muted">
          {campaign.name} · {rulesSummary(campaign)} ·{' '}
          <Link
            to={`/campaigns/${encodeURIComponent(campaign.id)}/settings`}
            className="text-accent"
          >
            Campaign settings
          </Link>
        </p>
        <p className="mt-2 text-sm text-text-muted">
          Played by: {PLAYED_BY_OPTIONS.find((option) => option.value === playedBy)?.label}
          <button
            type="button"
            onClick={() => setPlayedByAsked(false)}
            className="ml-2 min-h-11 rounded-btn px-2 text-accent"
          >
            Change
          </button>
        </p>
        {draft && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-text-muted">
            Picked up where you left off.
            <button
              type="button"
              onClick={onStartOver}
              className="min-h-11 rounded-btn border border-border px-3 text-accent"
            >
              Start over
            </button>
          </p>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-text-muted">Mode:</span>
        {(['steps', 'page'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => {
              setMode(value);
              setStepErrors([]);
              deviceStore.getState().setCreationMode(value);
            }}
            className={`min-h-11 rounded-btn border px-3 ${
              mode === value
                ? 'border-accent bg-surface text-accent'
                : 'border-border text-text-muted hover:text-text'
            }`}
          >
            {value === 'steps' ? 'Step by step' : 'One page'}
          </button>
        ))}
      </div>

      {stepped && (
        <nav aria-label="Steps">
          <ol className="flex flex-wrap gap-1 text-xs">
            {steps.map((entry, index) => (
              <li key={entry.id}>
                <button
                  type="button"
                  aria-current={index === at ? 'step' : undefined}
                  disabled={index > at}
                  onClick={() => goTo(index)}
                  className={`min-h-11 rounded-btn px-2 ${
                    index === at
                      ? 'bg-surface font-semibold text-accent'
                      : index < at
                        ? 'text-text'
                        : 'text-text-muted'
                  }`}
                >
                  {index + 1}. {entry.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {stepErrors.length > 0 && (
        <div role="alert" className="rounded-card border border-warn bg-surface p-4">
          <Caution>
            <p className="font-semibold">Finish this step first:</p>
            <ul className="mt-2 list-disc pl-5">
              {stepErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </Caution>
        </div>
      )}

      {errors.length > 0 && (
        <div role="alert" className="rounded-card border border-warn bg-surface p-4">
          <Caution>
            <p className="font-semibold">Check these choices before creating your character:</p>
            <ul className="mt-2 list-disc pl-5">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </Caution>
        </div>
      )}

      <section
        aria-labelledby="nc-basics"
        hidden={stepped && !['name', 'race', 'class', 'background', 'level'].includes(step)}
        className="flex flex-col gap-3"
      >
        {!stepped && (
          <SectionLabel>
            <span id="nc-basics">Basics</span>
          </SectionLabel>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {show('name') && (
            <Field label="Name" htmlFor="nc-name">
              <input
                id="nc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className={inputClass}
              />
            </Field>
          )}
          {show('level') && (
            <Field
              label="Level"
              htmlFor="nc-level"
              hint={
                campaign.leveling === 'milestone'
                  ? 'Milestone: the DM decides when you level up.'
                  : 'XP starts at this level’s threshold.'
              }
            >
              <input
                id="nc-level"
                type="number"
                min={1}
                max={20}
                inputMode="numeric"
                value={levelText ?? level}
                onKeyDown={focusNextOnEnter}
                onBlur={() => setLevelText(null)}
                onChange={(e) => {
                  const text = e.target.value;
                  setLevelText(text);
                  const n = Math.trunc(Number(text));
                  if (text !== '' && Number.isFinite(n)) setLevel(Math.min(20, Math.max(1, n)));
                }}
                className={inputClass}
              />
            </Field>
          )}
          {show('race') && (
            <Select
              id="nc-race"
              label="Race"
              options={races}
              value={raceId}
              onChange={pickRace}
              required
            />
          )}
          {hints && show('race') && (
            <OptionGuide noun="races" options={races} value={raceId} onChange={pickRace} />
          )}
          {show('class') && (
            <Field
              label="Class"
              htmlFor="nc-class"
              hint={die === undefined ? undefined : `Hit die d${die}`}
            >
              <select
                id="nc-class"
                value={classId}
                onChange={(e) => pickClass(e.target.value)}
                required
                className={inputClass}
              >
                <option value="" disabled>
                  Choose…
                </option>
                {classes.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {hints && show('class') && (
            <OptionGuide noun="classes" options={classes} value={classId} onChange={pickClass} />
          )}
          {show('background') && (
            <Select
              id="nc-background"
              label="Background"
              options={backgrounds}
              value={backgroundId}
              onChange={setBackgroundId}
              required
            />
          )}
          {hints && show('background') && (
            <OptionGuide
              noun="backgrounds"
              options={backgrounds}
              value={backgroundId}
              onChange={setBackgroundId}
            />
          )}
          {show('name') && (
            <Select
              id="nc-alignment"
              label="Alignment"
              options={ALIGNMENTS.map((name) => ({ id: name, name }))}
              value={alignment}
              onChange={setAlignment}
            />
          )}
        </div>
      </section>

      {synergies.length > 0 && (!stepped || ['background', 'level', 'review'].includes(step)) && (
        <section
          aria-label="Good together"
          className="rounded-card border border-border bg-surface p-3 text-sm"
        >
          <p className="text-xs font-semibold text-text-muted">Good together</p>
          <ul className="list-disc pl-5 text-text">
            {synergies.map((note) => (
              <li key={`${note.from}|${note.with}`}>
                {nameOfId(note.from)} + {nameOfId(note.with)}: {note.why}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        aria-labelledby="nc-abilities"
        hidden={!show('abilities')}
        className="flex flex-col gap-3"
      >
        <SectionLabel>
          <span id="nc-abilities">Ability scores</span>
        </SectionLabel>
        <p className="text-xs text-text-muted">{abilityHint(campaign)}</p>
        {hints && classGuidance?.mainAbilities && campaign.abilityMethod !== 'rolled' && (
          <div className="flex flex-col items-start gap-1">
            <button
              type="button"
              onClick={() => {
                const suggested = suggestAbilityBases(classGuidance.mainAbilities!);
                setBases(
                  Object.fromEntries(
                    ABILITIES.map((a) => [a, String(suggested[a])]),
                  ) as PerAbility<string>,
                );
              }}
              className="min-h-11 rounded-btn border border-border px-3 text-sm text-accent"
            >
              Suggested scores
            </button>
            <p className="text-xs text-text-muted">
              Puts your best scores in {classGuidance.mainAbilities.join(', ')}. Change them freely.
            </p>
          </div>
        )}
        {campaign.abilityMethod === 'point-buy' && (
          <p className="text-sm text-text" aria-live="polite">
            Points used: {pointCost} / 27
          </p>
        )}
        {race?.abilityChoices && (
          <fieldset className="rounded-card border border-border bg-surface p-3">
            <legend className="px-1 text-sm text-text">
              Choose {race.abilityChoices.count} racial bonus abilities (+
              {race.abilityChoices.value} each)
            </legend>
            <div className="flex flex-wrap gap-3">
              {ABILITIES.filter((ability) => !race.abilityChoices?.exclude?.includes(ability)).map(
                (ability) => (
                  <label
                    key={ability}
                    className="flex min-h-11 items-center gap-2 text-sm text-text"
                  >
                    <input
                      type="checkbox"
                      aria-label={`${ability} racial bonus`}
                      checked={racialChoices.includes(ability)}
                      disabled={
                        !racialChoices.includes(ability) &&
                        racialChoices.length >= race.abilityChoices!.count
                      }
                      onChange={(event) =>
                        setRacialChoices((selected) =>
                          event.target.checked
                            ? [...selected, ability]
                            : selected.filter((value) => value !== ability),
                        )
                      }
                      className="size-4 accent-(--omni-accent)"
                    />
                    {ability}
                  </label>
                ),
              )}
            </div>
          </fieldset>
        )}
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full text-left">
            <thead className="text-xs text-text-muted">
              <tr className="border-b border-border">
                <th className={cell}>Ability</th>
                <th className={cell}>Base</th>
                <th className={cell}>Bonus</th>
                <th className={cell}>Score</th>
                <th className={cell}>Mod</th>
              </tr>
            </thead>
            <tbody>
              {ABILITIES.map((a) => {
                const s = score(a);
                return (
                  <tr key={a} className="border-b border-border last:border-0">
                    <th scope="row" className={`${cell} font-semibold text-text`}>
                      {a}
                    </th>
                    <td className={cell}>
                      <AbilityBaseInput
                        ability={a}
                        method={campaign.abilityMethod}
                        value={bases[a]}
                        onChange={(v) => setBases((b) => ({ ...b, [a]: v }))}
                      />
                    </td>
                    <td className={`${cell} text-text-muted`}>
                      <span aria-label={`${a} bonus`}>
                        {bonuses[a] === 0 ? '—' : signed(bonuses[a])}
                      </span>
                    </td>
                    <td className={`${cell} font-semibold text-text`}>{s ?? '—'}</td>
                    <td className={`${cell} text-text`}>
                      {s === undefined ? '—' : signed(abilityModifier(s))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="nc-hp" hidden={!show('choices')} className="flex flex-col gap-3">
        <SectionLabel>
          <span id="nc-hp">Hit points</span>
        </SectionLabel>
        <p className="text-xs text-text-muted">
          {campaign.hpMethod === 'rolled'
            ? `Roll a d${die ?? '—'} for each level after 1st and type the result. Entries lock once saved; a level-up adds one entry.`
            : `Each level after 1st adds the average (${average ?? '—'} for a d${die ?? '—'}).`}{' '}
          {campaign.hpLevelFloor === 'one'
            ? 'Each level adds at least 1 HP.'
            : 'With a negative CON, a level can add 0 or less.'}
        </p>
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full text-left">
            <thead className="text-xs text-text-muted">
              <tr className="border-b border-border">
                <th className={cell}>Level</th>
                <th className={cell}>Hit die</th>
                <th className={cell}>CON</th>
                <th className={cell}>HP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <th scope="row" className={`${cell} font-semibold text-text`}>
                    {i + 1}
                  </th>
                  <td className={cell}>
                    {i > 0 && campaign.hpMethod === 'rolled' ? (
                      <input
                        type="number"
                        min={1}
                        max={die}
                        aria-label={`Level ${i + 1} roll (d${die})`}
                        value={rolls[i - 1] ?? ''}
                        required
                        onKeyDown={focusNextOnEnter}
                        onChange={(e) =>
                          setRolls((r) => {
                            const next = [...r];
                            next[i - 1] = e.target.value;
                            return next;
                          })
                        }
                        className={small}
                      />
                    ) : (
                      <span className="text-text">
                        {entry}{' '}
                        <span className="text-xs text-text-muted">
                          {i === 0 ? 'maximum' : 'average'}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className={`${cell} text-text-muted`}>
                    {conMod === undefined ? '—' : signed(conMod)}
                  </td>
                  <td className={`${cell} text-text`}>
                    {entry === undefined || conMod === undefined
                      ? '—'
                      : levelHp(entry, conMod, campaign.hpLevelFloor)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <th scope="row" colSpan={3} className={`${cell} text-text-muted`}>
                  Max HP · Hit Dice {level}d{die ?? '—'}
                </th>
                <td className={`${cell} text-base font-semibold text-text`}>{total ?? '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section aria-labelledby="nc-mode" hidden={!show('choices')} className="flex flex-col gap-3">
        <label className="flex min-h-11 items-center gap-2 text-sm text-text">
          <input
            id="nc-mode"
            type="checkbox"
            checked={guided}
            onChange={(event) => setGuided(event.target.checked)}
            className="size-4 accent-(--omni-accent)"
          />
          Guided build: pick class skills, starting equipment and spells
        </label>
        {!guided && (
          <Caution className="text-xs">
            <p>
              Quick create makes a blank character with your race and background's fixed grants.
              Class skills, spells and equipment stay empty; add them on the sheet.
            </p>
          </Caution>
        )}
      </section>

      {guided && classId && show('choices') && (
        <GuidedChoicesSection
          key={classId}
          classId={classId}
          level={level}
          taken={taken}
          state={guidedState}
          onChange={setGuidedState}
          spellContext={spellContext}
          hints={hints}
        />
      )}

      {classId && show('levels') && pickRows.length > 0 && (
        <LevelChoicesSection
          campaign={campaign}
          classId={classId}
          level={level}
          picks={levelPicks}
          onChange={setLevelPicks}
          hints={hints}
        />
      )}

      {stepped && step === 'review' && (
        <section aria-labelledby="nc-review" className="flex flex-col gap-3">
          <SectionLabel>
            <span id="nc-review">Review</span>
          </SectionLabel>
          <p className="text-sm text-text">
            {name || 'Unnamed'}: {race?.name} {classDef?.name}, level {level}
            {registry.entries.get(backgroundId)?.name
              ? `, ${registry.entries.get(backgroundId)?.name}`
              : ''}
            {alignment ? `, ${alignment}` : ''}
          </p>
          {review ? (
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {[
                ['Max HP', review.maxHp.value],
                ['Armor Class', review.ac.value],
                ['Speed', review.speed.value],
                ['Initiative', signed(review.initiative.value)],
                ['Proficiency', signed(review.proficiency)],
                ...ABILITIES.map((a) => [
                  a,
                  `${review.abilities[a].score.value} (${signed(review.abilities[a].mod)})`,
                ]),
              ].map(([label, value]) => (
                <div key={label} className="rounded-card border border-border bg-surface p-2">
                  <dt className="text-xs text-text-muted">{label}</dt>
                  <dd className="font-semibold text-text">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-text-muted">
              The sheet could not be computed yet. Go back and check your choices.
            </p>
          )}
        </section>
      )}

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-btn px-4 text-sm text-text-muted hover:text-text"
        >
          Cancel
        </Link>
        {stepped && at > 0 && (
          <button
            type="button"
            onClick={() => goTo(at - 1)}
            className="min-h-11 rounded-btn border border-border px-4 text-sm text-text"
          >
            Back
          </button>
        )}
        {stepped && step !== 'review' ? (
          <button
            key="next"
            type="button"
            onClick={next}
            className="min-h-11 rounded-btn bg-accent px-5 text-sm font-semibold text-bg"
          >
            Next
          </button>
        ) : (
          <button
            key="create"
            type="submit"
            disabled={pending}
            className="min-h-11 rounded-btn bg-accent px-5 text-sm font-semibold text-bg disabled:opacity-50"
          >
            Create character
          </button>
        )}
      </div>
      {confirmation}
    </form>
  );
}

function abilityHint(c: Campaign): string {
  if (c.abilityMethod === 'rolled')
    return 'Type each rolled score as Base. Race bonuses, scores and modifiers are computed.';
  if (c.abilityMethod === 'standard-array')
    return `Assign ${STANDARD_ARRAY.join(', ')} as Base, each once. Race bonuses are computed.`;
  return 'Point buy: Base 8–15, spending up to 27 points. Race bonuses are computed separately.';
}

function Select({
  id,
  label,
  options,
  value,
  onChange,
  required = false,
}: {
  id: string;
  label: string;
  options: { id: string; name: string }[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className={inputClass}
      >
        <option value="" disabled={required}>
          {required ? 'Choose…' : 'Choose… (optional)'}
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

function rulesSummary(campaign: Campaign): string {
  return [
    '5e 2014',
    campaign.leveling === 'milestone' ? 'Milestone' : 'XP',
    `HP ${campaign.hpMethod}`,
    `Abilities ${campaign.abilityMethod.replace('-', ' ')}`,
    campaign.sources.join(', '),
  ].join(' · ');
}

function errorField(field: PropertyKey | undefined): string {
  const labels: Record<string, string> = {
    name: 'Name',
    raceId: 'Race',
    classId: 'Class',
    backgroundId: 'Background',
    level: 'Level',
    abilityBases: 'Ability scores',
    racialChoices: 'Racial bonuses',
    hpRolls: 'HP rolls',
    guided: 'Class choices',
  };
  return typeof field === 'string' ? (labels[field] ?? 'Character') : 'Character';
}
