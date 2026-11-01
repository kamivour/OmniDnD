import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ABILITIES, abilityModifier, type Ability } from '../../engine/calc/abilities';
import { averageHpRoll, levelHp, maxHp } from '../../engine/calc/hp';
import { Field, inputClass } from '../components/fields';
import { SectionLabel } from '../components/SectionLabel';
import { rulesSummary } from '../campaignOptions';
import { findCampaign, type CampaignView } from '../fixtures/campaigns';
import { ALIGNMENTS, BACKGROUNDS, CLASSES, RACES, STANDARD_ARRAY } from '../fixtures/new-character';
import { useFixtureAction } from '../fixtures/useFixtureAction';
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
  const campaign = findCampaign(useParams().campaignId);
  if (!campaign) return <PlaceholderScreen title="Campaign not found" />;
  return <NewCharacterForm campaign={campaign} />;
}

function NewCharacterForm({ campaign }: { campaign: CampaignView }) {
  const act = useFixtureAction();
  const [name, setName] = useState('');
  const [className, setClassName] = useState('Bard');
  const [level, setLevel] = useState(1);
  const [bases, setBases] = useState<PerAbility<string>>(perAbility(''));
  const [bonuses, setBonuses] = useState<PerAbility<number>>(perAbility(0));
  const [rolls, setRolls] = useState<string[]>([]);

  const die = CLASSES.find((c) => c.name === className)?.die ?? 8;
  const score = (a: Ability) => (bases[a] === '' ? undefined : Number(bases[a]) + bonuses[a]);
  const con = score('CON');
  const conMod = con === undefined ? undefined : abilityModifier(con);

  // Level 1 is the die maximum; later levels are typed rolls or the fixed average.
  const entries: (number | undefined)[] = Array.from({ length: level }, (_, i) => {
    if (i === 0) return die;
    if (campaign.hpMethod === 'average') return averageHpRoll(die);
    return rolls[i] ? Number(rolls[i]) : undefined;
  });
  const complete = entries.every((e) => e !== undefined) && conMod !== undefined;
  const total = complete ? maxHp(entries as number[], conMod, campaign.hpFloor) : undefined;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        act('Create character');
      }}
      className="mx-auto flex max-w-3xl flex-col gap-6"
    >
      <header>
        <h1 className="font-display text-xl text-text">New character</h1>
        <p className="text-xs text-text-muted">
          {campaign.name} · {rulesSummary(campaign)} ·{' '}
          <Link to={`/campaigns/${campaign.id}/settings`} className="text-accent">
            Campaign settings
          </Link>
        </p>
      </header>

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
          <Select id="nc-race" label="Race" options={RACES} />
          <Field label="Class" htmlFor="nc-class" hint={`Hit die d${die}`}>
            <select
              id="nc-class"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              className={inputClass}
            >
              {CLASSES.map((c) => (
                <option key={c.name}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Select id="nc-background" label="Background" options={BACKGROUNDS} />
          <Select id="nc-alignment" label="Alignment" options={ALIGNMENTS} />
        </div>
      </section>

      <section aria-labelledby="nc-abilities" className="flex flex-col gap-3">
        <SectionLabel>
          <span id="nc-abilities">Ability scores</span>
        </SectionLabel>
        <p className="text-xs text-text-muted">{abilityHint(campaign)}</p>
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
                      <BaseInput
                        ability={a}
                        method={campaign.abilityMethod}
                        value={bases[a]}
                        onChange={(v) => setBases((b) => ({ ...b, [a]: v }))}
                      />
                    </td>
                    <td className={cell}>
                      <select
                        aria-label={`${a} bonus`}
                        value={bonuses[a]}
                        onChange={(e) => setBonuses((b) => ({ ...b, [a]: Number(e.target.value) }))}
                        className={small}
                      >
                        {[0, 1, 2].map((n) => (
                          <option key={n} value={n}>
                            {n === 0 ? '—' : signed(n)}
                          </option>
                        ))}
                      </select>
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
            ? `Roll a d${die} for each level after 1st and type the result. Entries lock once saved; a level-up adds one entry.`
            : `Each level after 1st adds the average (${averageHpRoll(die)} for a d${die}).`}{' '}
          {campaign.hpFloor === 'one'
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
                        value={rolls[i] ?? ''}
                        onChange={(e) =>
                          setRolls((r) => {
                            const next = [...r];
                            next[i] = e.target.value;
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
                      : levelHp(entry, conMod, campaign.hpFloor)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <th scope="row" colSpan={3} className={`${cell} text-text-muted`}>
                  Max HP · Hit Dice {level}d{die}
                </th>
                <td className={`${cell} text-base font-semibold text-text`}>{total ?? '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-btn px-4 text-sm text-text-muted hover:text-text"
        >
          Cancel
        </Link>
        <button
          type="submit"
          className="min-h-11 rounded-btn bg-accent px-5 text-sm font-semibold text-bg"
        >
          Create character
        </button>
      </div>
    </form>
  );
}

function abilityHint(c: CampaignView): string {
  if (c.abilityMethod === 'rolled')
    return 'Type each rolled score as Base. Add race bonuses; score and modifier are computed.';
  if (c.abilityMethod === 'standard')
    return `Assign ${STANDARD_ARRAY.join(', ')} as Base, each once. Add race bonuses.`;
  return 'Point buy: Base 8–15 from 27 points. The cost check arrives in milestone M7.';
}

function BaseInput({
  ability,
  method,
  value,
  onChange,
}: {
  ability: Ability;
  method: CampaignView['abilityMethod'];
  value: string;
  onChange: (value: string) => void;
}) {
  if (method === 'standard')
    return (
      <select
        aria-label={`${ability} base`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={small}
      >
        <option value="">—</option>
        {STANDARD_ARRAY.map((n) => (
          <option key={n}>{n}</option>
        ))}
      </select>
    );
  const [min, max] = method === 'pointBuy' ? [8, 15] : [3, 18];
  return (
    <input
      type="number"
      min={min}
      max={max}
      aria-label={`${ability} base`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={small}
    />
  );
}

function Select({ id, label, options }: { id: string; label: string; options: string[] }) {
  return (
    <Field label={label} htmlFor={id}>
      <select id={id} defaultValue="" className={inputClass}>
        <option value="" disabled>
          Choose…
        </option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </Field>
  );
}
