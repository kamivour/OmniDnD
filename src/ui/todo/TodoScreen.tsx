import { useState } from 'react';
import { Link } from 'react-router';
import { useStore } from 'zustand';
import { registry } from '../../data/registry';
import { chooseFeatSpells, featSpellCandidates, resolveChoices } from '../../engine/commands';
import type { Ability } from '../../engine/calc/abilities';
import type { PendingChoice } from '../../engine/calc/pending-choices';
import { computeSheet, type CharacterState } from '../../engine/calc/sheet';
import type { Skill } from '../../engine/rules2014';
import { deviceStore } from '../../state/device-settings';
import { OptionGuide } from '../components/OptionGuide';
import { SectionLabel } from '../components/SectionLabel';
import { useCommand } from '../commands/command-context';
import { AsiPick, SubclassPick } from '../level/LevelUpChoices';
import {
  emptyPicks,
  featOptions,
  picksToPayload,
  subclassOptions,
  type LevelPicks,
} from '../level/level-up-model';
import { ProficiencyPicksForm } from './ProficiencyPicksForm';
import { useTodo } from './useTodo';

const btn = 'min-h-11 rounded-btn border border-border bg-surface px-3 text-sm text-text';
const nameOf = (id: string) => registry.entries.get(id)?.name ?? id;

export function TodoScreen() {
  const { characterId, state, open, hidden, dismiss, restore } = useTodo();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
      <header>
        <h1 className="font-display text-xl text-text">To do</h1>
        <p className="text-xs text-text-muted">
          Choices this character still has to make. Each item clears when it is done.
        </p>
      </header>
      {open.length === 0 && (
        <p className="rounded-card border border-border bg-surface p-3 text-sm text-text">
          Nothing left to decide.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {open.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-sm text-text">
                {item.label}
                {item.optional && <span className="ml-2 text-xs text-text-muted">Optional</span>}
              </p>
              {item.area === 'spells' ? (
                <Link to={`/characters/${characterId}/spells`} className={btn}>
                  Open Spellbook
                </Link>
              ) : (
                <button
                  type="button"
                  aria-expanded={editing === item.id}
                  onClick={() => setEditing(editing === item.id ? null : item.id)}
                  className={btn}
                >
                  {editing === item.id ? 'Close' : 'Choose'}
                </button>
              )}
              {item.optional && (
                <button type="button" onClick={() => dismiss(item.id)} className={btn}>
                  Hide
                </button>
              )}
            </div>
            {editing === item.id &&
              (item.kind === 'feat-spells' && item.featureId ? (
                <FeatSpellsForm
                  featureId={item.featureId}
                  state={state}
                  onDone={() => setEditing(null)}
                />
              ) : item.kind === 'proficiencies' && item.featureId ? (
                <ProficiencyPicksForm
                  featureId={item.featureId}
                  state={state}
                  onDone={() => setEditing(null)}
                />
              ) : (
                <ChoiceForm item={item} state={state} onDone={() => setEditing(null)} />
              ))}
          </li>
        ))}
      </ul>
      {hidden.length > 0 && (
        <section aria-label="Hidden items" className="flex flex-col gap-2">
          <SectionLabel>Hidden</SectionLabel>
          {hidden.map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-sm text-text-muted">
              <span className="min-w-0 flex-1">{item.label}</span>
              <button type="button" onClick={() => restore(item.id)} className={btn}>
                Show again
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function ChoiceForm({
  item,
  state,
  onDone,
}: {
  item: PendingChoice;
  state: CharacterState;
  onDone: () => void;
}) {
  const { run } = useCommand();
  const hints = useStore(deviceStore, (settings) => settings.beginnerHints);
  const [picks, setPicks] = useState<LevelPicks>(emptyPicks);
  const [chosen, setChosen] = useState<string[]>([]);
  const set = (patch: Partial<LevelPicks>) => setPicks({ ...picks, ...patch });
  const toggle = (id: string) =>
    setChosen(
      chosen.includes(id)
        ? chosen.filter((row) => row !== id)
        : chosen.length < item.count
          ? [...chosen, id]
          : chosen,
    );

  const subclasses = subclassOptions(state, registry, item.classId);
  const feats = featOptions(state, registry);
  const sheet = computeSheet(state, registry);
  const owned = new Set(state.build.featureIds);
  const options =
    item.kind === 'option'
      ? (item.optionIds ?? [])
          .filter((id) => !owned.has(id))
          .map((id) => ({ id, name: registry.get('feature', id).name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : item.kind === 'expertise'
        ? [...sheet.proficiencies.skills, ...sheet.proficiencies.tools]
            .filter((id) => !sheet.proficiencies.expertise.includes(id as Skill))
            .map((id) => ({ id, name: nameOf(id).replace(/-/g, ' ') }))
        : [];

  const choices =
    item.kind === 'subclass'
      ? picksToPayload(picks, { subclass: true, asi: false }, false, false).choices
      : item.kind === 'asi'
        ? picksToPayload(picks, { subclass: false, asi: true }, false, false).choices
        : chosen.length === 0
          ? undefined
          : item.kind === 'option'
            ? { features: chosen }
            : { expertise: chosen as Skill[] };

  return (
    <div className="flex flex-col gap-3">
      {item.kind === 'subclass' && (
        <>
          <SubclassPick options={subclasses} picks={picks} set={set} />
          {hints && (
            <OptionGuide
              noun="subclasses"
              options={subclasses}
              value={picks.subclassId}
              onChange={(id) => set({ subclassId: id })}
            />
          )}
        </>
      )}
      {item.kind === 'asi' && (
        <AsiPick feats={feats} picks={picks} set={set} campaign={state.campaign} />
      )}
      {options.length > 0 && (
        <fieldset className="flex flex-col">
          <legend className="mb-1 text-sm text-text">
            Pick {item.count} ({chosen.length} chosen)
          </legend>
          <div className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">
            {options.map((option) => (
              <label
                key={option.id}
                className="flex min-h-11 items-center gap-2 text-sm capitalize text-text"
              >
                <input
                  type="checkbox"
                  checked={chosen.includes(option.id)}
                  disabled={!chosen.includes(option.id) && chosen.length >= item.count}
                  onChange={() => toggle(option.id)}
                  className="size-4 accent-(--omni-accent)"
                />
                {option.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div>
        <button
          type="button"
          disabled={!choices}
          onClick={() => {
            if (choices) run(resolveChoices, { classId: item.classId, choices }, undefined, onDone);
          }}
          className="min-h-11 rounded-btn bg-accent px-4 font-semibold text-bg disabled:opacity-40"
        >
          Save choice
        </button>
      </div>
    </div>
  );
}

const ABILITY_NAMES: Record<Ability, string> = {
  STR: 'Strength',
  DEX: 'Dexterity',
  CON: 'Constitution',
  INT: 'Intelligence',
  WIS: 'Wisdom',
  CHA: 'Charisma',
};

/** Spells, class and casting ability for a feat or racial trait such as Magic Initiate. */
function FeatSpellsForm({
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
  const grant = def.spells;
  const stored = state.build.featSpells?.[featureId];
  const [classId, setClassId] = useState(stored?.classId ?? grant?.classOptions?.[0]);
  const raisedOptions = def.grants?.ability ?? [];
  const raised = state.build.abilityScores.bonuses.find(
    (bonus) => bonus.source === `Feat: ${def.name}`,
  )?.ability;
  const askAbility = grant?.ability === 'raised' && !raised && raisedOptions.length > 0;
  const [ability, setAbility] = useState<Ability | undefined>(stored?.ability ?? raisedOptions[0]);
  const [chosen, setChosen] = useState<string[]>(stored?.spellIds ?? []);
  if (!grant) return null;

  const picks = (grant.picks ?? []).map((pick) => ({
    pick,
    options: featSpellCandidates(registry, state.campaign, pick, classId),
  }));
  const inPick = (options: { id: string }[]) =>
    chosen.filter((id) => options.some((option) => option.id === id));
  const complete = picks.every(({ pick, options }) => inPick(options).length === pick.count);

  return (
    <div className="flex flex-col gap-3">
      {grant.classOptions && (
        <label className="flex flex-col gap-1 text-sm text-text">
          Spell list
          <select
            value={classId}
            onChange={(event) => {
              setClassId(event.target.value);
              setChosen([]);
            }}
            className="min-h-11 rounded-btn border border-border bg-surface px-2 text-sm text-text"
          >
            {grant.classOptions.map((id) => (
              <option key={id} value={id}>
                {nameOf(id)}
              </option>
            ))}
          </select>
        </label>
      )}
      {askAbility && (
        <label className="flex flex-col gap-1 text-sm text-text">
          Spellcasting ability
          <select
            value={ability}
            onChange={(event) => setAbility(event.target.value as Ability)}
            className="min-h-11 rounded-btn border border-border bg-surface px-2 text-sm text-text"
          >
            {raisedOptions.map((id) => (
              <option key={id} value={id}>
                {ABILITY_NAMES[id]}
              </option>
            ))}
          </select>
        </label>
      )}
      {picks.map(({ pick, options }) => {
        const taken = inPick(options);
        const noun = pick.level === 0 ? 'cantrip' : `level ${pick.level} spell`;
        return (
          <fieldset key={pick.level} className="flex flex-col">
            <legend className="mb-1 text-sm text-text">
              Pick {pick.count} {noun}
              {pick.count > 1 ? 's' : ''} ({taken.length} chosen)
            </legend>
            <div className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">
              {options.map((option) => {
                const checked = chosen.includes(option.id);
                return (
                  <label
                    key={option.id}
                    className="flex min-h-11 items-center gap-2 text-sm text-text"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && taken.length >= pick.count}
                      onChange={() =>
                        setChosen(
                          checked
                            ? chosen.filter((id) => id !== option.id)
                            : [...chosen, option.id],
                        )
                      }
                      className="size-4 accent-(--omni-accent)"
                    />
                    {option.name}
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
          onClick={() =>
            run(
              chooseFeatSpells,
              {
                featureId,
                ...(grant.classOptions && classId ? { classId } : {}),
                ...(askAbility && ability ? { ability } : {}),
                spellIds: chosen,
              },
              undefined,
              onDone,
            )
          }
          className="min-h-11 rounded-btn bg-accent px-4 font-semibold text-bg disabled:opacity-40"
        >
          Save choice
        </button>
      </div>
    </div>
  );
}
