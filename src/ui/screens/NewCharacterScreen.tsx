import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ZodError } from 'zod';
import { registry } from '../../data/registry';
import { ABILITIES, abilityModifier, type Ability } from '../../engine/calc/abilities';
import { averageHpRoll, levelHp, maxHp, type HitDie } from '../../engine/calc/hp';
import { addCharacter } from '../../engine/commands/management';
import { createCharacter, POINT_BUY_COSTS, STANDARD_ARRAY } from '../../engine/creation';
import { SCHEMA_VERSION, type Campaign, type ExportFile } from '../../engine/schema';
import { useCampaign } from '../hooks/useCampaign';
import { useManagement } from '../commands/useManagement';
import { Field, inputClass } from '../components/fields';
import { AbilityBaseInput } from '../components/AbilityBaseInput';
import { SectionLabel } from '../components/SectionLabel';
import { ALIGNMENTS } from '../fixtures/new-character';
import { signed } from '../format';
import { PlaceholderScreen } from './PlaceholderScreen';

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
  if (!campaign) return <PlaceholderScreen title="Campaign not found" />;
  return <NewCharacterForm key={campaign.id} campaign={campaign} />;
}

function NewCharacterForm({ campaign }: { campaign: Campaign }) {
  const navigate = useNavigate();
  const { run, confirmation, pending } = useManagement();
  const available = [...registry.entries.values()]
    .filter((entry) => campaign.sources.includes(entry.source))
    .sort((a, b) => a.name.localeCompare(b.name));
  const races = available.filter((entry) => entry.kind === 'race');
  const classes = available.filter((entry) => entry.kind === 'class');
  const backgrounds = available.filter((entry) => entry.kind === 'background');
  const [id] = useState(() => crypto.randomUUID());
  const [name, setName] = useState('');
  const [raceId, setRaceId] = useState('');
  const [classId, setClassId] = useState(
    classes.some((entry) => entry.id === 'class.bard') ? 'class.bard' : '',
  );
  const [backgroundId, setBackgroundId] = useState('');
  const [alignment, setAlignment] = useState('');
  const [racialChoices, setRacialChoices] = useState<Ability[]>([]);
  const [level, setLevel] = useState(1);
  const [bases, setBases] = useState<PerAbility<string>>(perAbility(''));
  const [rolls, setRolls] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

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

  return (
    <form
      onChange={() => {
        if (errors.length > 0) setErrors([]);
      }}
      onSubmit={(e) => {
        e.preventDefault();
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
            },
            registry,
          );
          const file: ExportFile = {
            app: 'omnidnd',
            schemaVersion: SCHEMA_VERSION,
            exportedAt: new Date().toISOString(),
            campaign,
            ...created,
          };
          const result = run(addCharacter, { file }, () => {
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
      </header>

      {errors.length > 0 && (
        <div
          role="alert"
          className="rounded-card border border-border bg-surface p-4 text-sm text-text"
        >
          <p className="font-semibold">Check these choices before creating your character:</p>
          <ul className="mt-2 list-disc pl-5">
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <section aria-labelledby="nc-basics" className="flex flex-col gap-3">
        <SectionLabel>
          <span id="nc-basics">Basics</span>
        </SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="nc-name">
            <input
              id="nc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={inputClass}
            />
          </Field>
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
              value={level}
              onChange={(e) => setLevel(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
              className={inputClass}
            />
          </Field>
          <Select
            id="nc-race"
            label="Race"
            options={races}
            value={raceId}
            onChange={(id) => {
              setRaceId(id);
              setRacialChoices([]);
            }}
            required
          />
          <Field
            label="Class"
            htmlFor="nc-class"
            hint={die === undefined ? undefined : `Hit die d${die}`}
          >
            <select
              id="nc-class"
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setRolls([]);
              }}
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
          <Select
            id="nc-background"
            label="Background"
            options={backgrounds}
            value={backgroundId}
            onChange={setBackgroundId}
            required
          />
          <Select
            id="nc-alignment"
            label="Alignment"
            options={ALIGNMENTS.map((name) => ({ id: name, name }))}
            value={alignment}
            onChange={setAlignment}
          />
        </div>
      </section>

      <section aria-labelledby="nc-abilities" className="flex flex-col gap-3">
        <SectionLabel>
          <span id="nc-abilities">Ability scores</span>
        </SectionLabel>
        <p className="text-xs text-text-muted">{abilityHint(campaign)}</p>
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

      <section aria-labelledby="nc-hp" className="flex flex-col gap-3">
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

      <p className="text-xs text-text-muted">
        Creates a blank character with your race and background's fixed grants. Class skills, spells
        and equipment stay empty. Full guided choices arrive in Phase 3.
      </p>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-btn px-4 text-sm text-text-muted hover:text-text"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-btn bg-accent px-5 text-sm font-semibold text-bg disabled:opacity-50"
        >
          Create character
        </button>
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
  };
  return typeof field === 'string' ? (labels[field] ?? 'Character') : 'Character';
}
