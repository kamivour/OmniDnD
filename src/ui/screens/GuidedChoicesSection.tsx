import { registry } from '../../data/registry';
import { CLASS_START, SLOT_LABELS, slotChoices } from '../../engine/calc/class-start';
import { levelSpellGains } from '../../engine/calc/level-spells';
import {
  spellSelectionDetails,
  type SpellSelectionContext,
} from '../../engine/calc/spell-selections';
import { SKILLS, type Skill } from '../../engine/rules2014';
import type { GuidedState } from './guided-state';
import { inputClass } from '../components/fields';
import { SectionLabel } from '../components/SectionLabel';

const nameOf = (id: string) => registry.entries.get(id)?.name ?? id;
const skillName = (skill: string) =>
  skill.replace(/-/g, ' ').replace(/^./, (letter) => letter.toUpperCase());

/** Class skills, starting kit and spells for a guided new character (SPEC §5 Characters). */
export function GuidedChoicesSection({
  classId,
  level,
  taken,
  state,
  onChange,
  spellContext,
}: {
  classId: string;
  level: number;
  /** Skills the character already has from race and background. */
  taken: Skill[];
  state: GuidedState;
  onChange: (next: GuidedState) => void;
  /** The character without class choices; absent until the basics are complete. */
  spellContext?: SpellSelectionContext;
}) {
  const start = CLASS_START[classId];
  if (!start) return <p className="text-sm text-text-muted">No guided choices for this class.</p>;
  const skillList = start.skills.from === 'any' ? undefined : start.skills.from;
  const skillOptions = (skillList ?? [...SKILLS]).filter((skill) => !taken.includes(skill));
  const toggle = <T,>(list: T[], value: T, limit: number) =>
    list.includes(value)
      ? list.filter((entry) => entry !== value)
      : list.length < limit
        ? [...list, value]
        : list;

  const details = spellContext ? spellSelectionDetails(spellContext, classId) : undefined;
  const gains = spellContext ? levelSpellGains(spellContext, classId, true) : undefined;
  const cantripsWanted = gains?.cantrips ?? 0;
  const spellsWanted =
    gains === undefined
      ? 0
      : gains.mode === 'spellbook'
        ? gains.spells + 2 * (level - 1)
        : gains.spells;
  const isCantrip = (id: string) => {
    const entry = registry.entries.get(id);
    return entry?.kind === 'spell' && entry.level === 0;
  };
  const pickedCantrips = state.spells.filter(isCantrip);
  const pickedSpells = state.spells.filter((id) => !isCantrip(id));

  return (
    <section aria-labelledby="nc-guided" className="flex flex-col gap-4">
      <SectionLabel>
        <span id="nc-guided">Class choices</span>
      </SectionLabel>

      <fieldset className="rounded-card border border-border bg-surface p-3">
        <legend className="px-1 text-sm text-text">
          Class skills: choose {start.skills.count} ({state.skills.length} chosen)
        </legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {skillOptions.map((skill) => (
            <label key={skill} className="flex min-h-11 items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={state.skills.includes(skill)}
                disabled={
                  !state.skills.includes(skill) && state.skills.length >= start.skills.count
                }
                onChange={() =>
                  onChange({ ...state, skills: toggle(state.skills, skill, start.skills.count) })
                }
                className="size-4 accent-(--omni-accent)"
              />
              {skillName(skill)}
            </label>
          ))}
        </div>
      </fieldset>

      {start.instruments > 0 && (
        <fieldset className="rounded-card border border-border bg-surface p-3">
          <legend className="px-1 text-sm text-text">
            Instruments: choose {start.instruments} ({state.instruments.length} chosen)
          </legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {slotChoices('instrument', registry).map((id) => (
              <label key={id} className="flex min-h-11 items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={state.instruments.includes(id)}
                  disabled={
                    !state.instruments.includes(id) && state.instruments.length >= start.instruments
                  }
                  onChange={() =>
                    onChange({
                      ...state,
                      instruments: toggle(state.instruments, id, start.instruments),
                    })
                  }
                  className="size-4 accent-(--omni-accent)"
                />
                {nameOf(id)}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-text">Starting equipment</h2>
        <p className="text-xs text-text-muted">
          Or take {start.goldInstead} instead and buy gear yourself: leave this kit and add items
          later in the inventory.
        </p>
        {start.equipment.map((step, index) => {
          const pick = state.equipment[index] ?? { option: 0, slots: [] };
          const option = step.options[pick.option] ?? step.options[0]!;
          const open = option.items.filter((entry) => entry.slot);
          const setPick = (next: { option: number; slots: string[] }) =>
            onChange({
              ...state,
              equipment: state.equipment.map((row, at) => (at === index ? next : row)),
            });
          return (
            <fieldset key={index} className="rounded-card border border-border bg-surface p-3">
              <legend className="px-1 text-sm text-text">{step.label}</legend>
              {step.options.length > 1 ? (
                <select
                  aria-label={step.label}
                  value={pick.option}
                  onChange={(event) => setPick({ option: Number(event.target.value), slots: [] })}
                  className={inputClass}
                >
                  {step.options.map((entry, at) => (
                    <option key={at} value={at}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-text">{option.label}</p>
              )}
              {open.map((entry, at) => (
                <select
                  key={`${pick.option}-${at}`}
                  aria-label={`${step.label}: ${SLOT_LABELS[entry.slot!]} ${at + 1}`}
                  value={pick.slots[at] ?? ''}
                  onChange={(event) => {
                    const slots = [...pick.slots];
                    slots[at] = event.target.value;
                    setPick({ ...pick, slots });
                  }}
                  className={`${inputClass} mt-2`}
                >
                  <option value="">Choose {SLOT_LABELS[entry.slot!].toLowerCase()}…</option>
                  {slotChoices(entry.slot!, registry).map((id) => (
                    <option key={id} value={id}>
                      {nameOf(id)}
                    </option>
                  ))}
                </select>
              ))}
            </fieldset>
          );
        })}
      </div>

      {details && gains && gains.mode !== 'unsupported' && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-text">Spells</h2>
          {gains.mode === 'prepared' && (
            <p className="text-xs text-text-muted">
              {details.name} prepares spells after creation, from the sheet.
            </p>
          )}
          <SpellPicker
            label={`Cantrips: choose ${cantripsWanted} (${pickedCantrips.length} chosen)`}
            ids={details.candidates.cantrips}
            picked={pickedCantrips}
            limit={cantripsWanted}
            onToggle={(id) =>
              onChange({
                ...state,
                spells: [...toggle(pickedCantrips, id, cantripsWanted), ...pickedSpells],
              })
            }
          />
          {spellsWanted > 0 && (
            <SpellPicker
              label={`${gains.mode === 'spellbook' ? 'Spellbook' : 'Spells known'}: choose ${spellsWanted} (${pickedSpells.length} chosen)`}
              ids={details.candidates.known}
              picked={pickedSpells}
              limit={spellsWanted}
              onToggle={(id) =>
                onChange({
                  ...state,
                  spells: [...pickedCantrips, ...toggle(pickedSpells, id, spellsWanted)],
                })
              }
            />
          )}
        </div>
      )}
      {!spellContext && (
        <p className="text-xs text-text-muted">
          Spells appear once race, class, background and ability scores are filled in.
        </p>
      )}
    </section>
  );
}

function SpellPicker({
  label,
  ids,
  picked,
  limit,
  onToggle,
}: {
  label: string;
  ids: string[];
  picked: string[];
  limit: number;
  onToggle: (id: string) => void;
}) {
  if (limit === 0) return null;
  const sorted = [...ids].sort((a, b) => {
    const left = registry.entries.get(a);
    const right = registry.entries.get(b);
    const levels =
      (left?.kind === 'spell' ? left.level : 0) - (right?.kind === 'spell' ? right.level : 0);
    return levels || nameOf(a).localeCompare(nameOf(b));
  });
  return (
    <fieldset className="rounded-card border border-border bg-surface p-3">
      <legend className="px-1 text-sm text-text">{label}</legend>
      <div className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">
        {sorted.map((id) => {
          const entry = registry.entries.get(id);
          const spellLevel = entry?.kind === 'spell' ? entry.level : 0;
          return (
            <label key={id} className="flex min-h-11 items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={picked.includes(id)}
                disabled={!picked.includes(id) && picked.length >= limit}
                onChange={() => onToggle(id)}
                className="size-4 accent-(--omni-accent)"
              />
              {nameOf(id)}
              {spellLevel > 0 && <span className="text-xs text-text-muted">L{spellLevel}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
