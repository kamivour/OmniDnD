import { useId } from 'react';
import { ABILITIES, type Ability } from '../../engine/calc/abilities';
import type { Registry } from '../../engine/registry';
import type { FeatureDef } from '../../engine/schema';
import { SKILLS } from '../../engine/rules2014';
import { Field, inputClass } from '../components/fields';
import { optionName, type LevelPicks, type NewClassOption } from './level-up-model';

interface PickProps {
  picks: LevelPicks;
  set: (patch: Partial<LevelPicks>) => void;
}

/** A feat the wizard can offer, with what it grants. */
export interface FeatOption {
  id: string;
  name: string;
  summary?: string;
  grants?: FeatureDef['grants'];
}

const group = 'flex min-w-0 flex-col gap-2 rounded-card border border-border p-3';
const radio = 'flex min-h-11 items-center gap-2 text-sm text-text';

/** Skill and tool picks a new class grants (PHB multiclassing). */
export function NewClassPicks({
  option,
  picks,
  set,
  registry,
}: PickProps & { option: NewClassOption; registry: Registry }) {
  const id = useId();
  const { skill, tool } = option.rule;
  const skills = skill === 'any' ? SKILLS : skill;
  return (
    <div className={group}>
      <p className="text-sm text-text-muted">
        Starting {option.name} needs 13+ in the right ability. It adds the armor and weapon training
        of a multiclass.
      </p>
      {skill && (
        <Field label={`Skill from ${option.name}`} htmlFor={`${id}-skill`}>
          <select
            id={`${id}-skill`}
            value={picks.skill}
            onChange={(event) => set({ skill: event.target.value })}
            className={inputClass}
          >
            <option value="">Choose a skill</option>
            {skills?.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </Field>
      )}
      {tool === 'instrument' && (
        <Field label="Musical instrument" htmlFor={`${id}-tool`}>
          <select
            id={`${id}-tool`}
            value={picks.tool}
            onChange={(event) => set({ tool: event.target.value })}
            className={inputClass}
          >
            <option value="">Choose an instrument</option>
            {[...registry.entries.values()]
              .filter((entry) => entry.kind === 'item' && entry.category === 'instrument')
              .map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
          </select>
        </Field>
      )}
    </div>
  );
}

export function SubclassPick({
  options,
  picks,
  set,
}: PickProps & { options: { id: string; name: string }[] }) {
  const id = useId();
  return (
    <div className={group}>
      <Field label="Subclass" htmlFor={`${id}-subclass`} hint="Choose now, or leave it for later.">
        <select
          id={`${id}-subclass`}
          value={picks.subclassId}
          onChange={(event) => set({ subclassId: event.target.value })}
          className={inputClass}
        >
          <option value="">Decide later</option>
          {options.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

export function AsiPick({ feats, picks, set }: PickProps & { feats: FeatOption[] }) {
  const id = useId();
  const feat = feats.find((entry) => entry.id === picks.featId);
  const abilitySelect = (label: string, key: 'ability1' | 'ability2') => (
    <Field label={label} htmlFor={`${id}-${key}`}>
      <select
        id={`${id}-${key}`}
        value={picks[key]}
        onChange={(event) => set({ [key]: event.target.value } as Partial<LevelPicks>)}
        className={inputClass}
      >
        {ABILITIES.map((ability) => (
          <option key={ability} value={ability}>
            {ability}
          </option>
        ))}
      </select>
    </Field>
  );
  return (
    <fieldset className={group}>
      <legend className="px-1 text-sm font-semibold text-text">Ability score improvement</legend>
      {asiModes(feats.length > 0).map(([value, label]) => (
        <label key={value} className={radio}>
          <input
            type="radio"
            name={`${id}-asi`}
            checked={picks.asiMode === value}
            onChange={() => set({ asiMode: value })}
            className="size-4 accent-(--omni-accent)"
          />
          {label}
        </label>
      ))}
      {picks.asiMode === 'abilities' && (
        <>
          <label className={radio}>
            <input
              type="radio"
              name={`${id}-split`}
              checked={picks.asiSplit === 'one'}
              onChange={() => set({ asiSplit: 'one' })}
              className="size-4 accent-(--omni-accent)"
            />
            +2 to one ability
          </label>
          <label className={radio}>
            <input
              type="radio"
              name={`${id}-split`}
              checked={picks.asiSplit === 'two'}
              onChange={() => set({ asiSplit: 'two' })}
              className="size-4 accent-(--omni-accent)"
            />
            +1 to two abilities
          </label>
          {abilitySelect(picks.asiSplit === 'one' ? 'Ability' : 'First ability', 'ability1')}
          {picks.asiSplit === 'two' && abilitySelect('Second ability', 'ability2')}
        </>
      )}
      {picks.asiMode === 'feat' && (
        <>
          <Field label="Feat" htmlFor={`${id}-feat`}>
            <select
              id={`${id}-feat`}
              value={picks.featId}
              onChange={(event) =>
                set({ featId: event.target.value, featAbility: '', featSkills: [] })
              }
              className={inputClass}
            >
              <option value="">Choose a feat</option>
              {feats.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </Field>
          {feat?.grants?.ability && feat.grants.ability.length > 1 && (
            <Field label={`Ability ${feat.name} raises by 1`} htmlFor={`${id}-feat-ability`}>
              <select
                id={`${id}-feat-ability`}
                value={picks.featAbility}
                onChange={(event) => set({ featAbility: event.target.value as Ability })}
                className={inputClass}
              >
                <option value="">Choose an ability</option>
                {feat.grants.ability.map((ability) => (
                  <option key={ability} value={ability}>
                    {ability}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {feat?.grants?.skills && (
            <fieldset className="flex min-w-0 flex-col gap-1">
              <legend className="mb-1 text-sm font-semibold text-text">
                Skills ({picks.featSkills.length} / {feat.grants.skills})
              </legend>
              <div className="flex max-h-60 flex-col overflow-y-auto">
                {SKILLS.map((skill) => {
                  const on = picks.featSkills.includes(skill);
                  return (
                    <label key={skill} className={radio}>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!on && picks.featSkills.length >= (feat.grants?.skills ?? 0)}
                        onChange={() =>
                          set({
                            featSkills: on
                              ? picks.featSkills.filter((entry) => entry !== skill)
                              : [...picks.featSkills, skill],
                          })
                        }
                        className="size-4 accent-(--omni-accent)"
                      />
                      {skill}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
          {feat && <p className="text-sm text-text-muted">{feat.summary}</p>}
        </>
      )}
    </fieldset>
  );
}

function asiModes(withFeats: boolean): [LevelPicks['asiMode'], string][] {
  return [
    ['later', 'Decide later'],
    ['abilities', 'Raise ability scores'],
    ...(withFeats ? [['feat', 'Take a feat'] as [LevelPicks['asiMode'], string]] : []),
  ];
}

function SpellChecks({
  legend,
  ids,
  chosen,
  limit,
  registry,
  onChange,
}: {
  legend: string;
  ids: string[];
  chosen: string[];
  limit: number;
  registry: Registry;
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="mb-1 text-sm font-semibold text-text">
        {legend} ({chosen.length} / {limit})
      </legend>
      <div className="flex max-h-60 flex-col overflow-y-auto">
        {ids.map((spell) => {
          const on = chosen.includes(spell);
          return (
            <label key={spell} className={radio}>
              <input
                type="checkbox"
                checked={on}
                disabled={!on && chosen.length >= limit}
                onChange={() =>
                  onChange(on ? chosen.filter((entry) => entry !== spell) : [...chosen, spell])
                }
                className="size-4 accent-(--omni-accent)"
              />
              {optionName(registry, spell)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SpellPicks({
  info,
  picks,
  set,
  registry,
}: PickProps & {
  registry: Registry;
  info: {
    gains: { mode: string; cantrips: number; spells: number; canSwap: boolean };
    cantrips: string[];
    spells: string[];
    knownSpells: string[];
  };
}) {
  const id = useId();
  const { gains } = info;
  const wizard = gains.mode === 'spellbook';
  return (
    <div className={group}>
      <p className="text-sm font-semibold text-text">New spells</p>
      <p className="text-sm text-text-muted">
        Pick now or add them later on the Spells screen. Prepared spells are set there too.
      </p>
      {gains.cantrips > 0 && (
        <SpellChecks
          legend="Cantrips"
          ids={info.cantrips}
          chosen={picks.cantrips}
          limit={gains.cantrips}
          registry={registry}
          onChange={(cantrips) => set({ cantrips })}
        />
      )}
      {gains.spells > 0 && (
        <SpellChecks
          legend={wizard ? 'Spells to copy into your spellbook' : 'Spells known'}
          ids={info.spells}
          chosen={picks.spells}
          limit={gains.spells}
          registry={registry}
          onChange={(spells) => set({ spells })}
        />
      )}
      {gains.canSwap && info.knownSpells.length > 0 && (
        <>
          <Field label="Swap out a known spell" htmlFor={`${id}-out`}>
            <select
              id={`${id}-out`}
              value={picks.swapOut}
              onChange={(event) => set({ swapOut: event.target.value })}
              className={inputClass}
            >
              <option value="">Keep all</option>
              {info.knownSpells.map((spell) => (
                <option key={spell} value={spell}>
                  {optionName(registry, spell)}
                </option>
              ))}
            </select>
          </Field>
          {picks.swapOut && (
            <Field label="Learn instead" htmlFor={`${id}-in`}>
              <select
                id={`${id}-in`}
                value={picks.swapIn}
                onChange={(event) => set({ swapIn: event.target.value })}
                className={inputClass}
              >
                <option value="">Choose a spell</option>
                {info.spells
                  .filter((spell) => !picks.spells.includes(spell))
                  .map((spell) => (
                    <option key={spell} value={spell}>
                      {optionName(registry, spell)}
                    </option>
                  ))}
              </select>
            </Field>
          )}
        </>
      )}
    </div>
  );
}
