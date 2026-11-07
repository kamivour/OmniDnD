import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ABILITIES } from '../../engine/calc/abilities';
import { addCompanion, updateCompanion } from '../../engine/commands';
import { DAMAGE_TYPES, type DamageType } from '../../engine/rules2014';
import { COMPANION_TYPES, type Companion, type CompanionType } from '../../engine/schema';
import { useCommand } from '../commands/command-context';
import { Field, inputClass } from '../components/fields';
import { Sheet } from '../components/Sheet';
import { COMPANION_TEMPLATES } from './templates';
import {
  SPEED_KINDS,
  emptyAttack,
  emptyForm,
  fromForm,
  toForm,
  type CompanionForm,
  type NumberInput,
} from './companion-form';

const smallButton =
  'inline-flex min-h-11 items-center justify-center gap-1 rounded-btn border border-border px-3 text-sm hover:bg-surface disabled:opacity-40';
const RECHARGES = [
  { value: 'short', label: 'Short or long rest' },
  { value: 'long', label: 'Long rest' },
  { value: 'dawn', label: 'Dawn' },
  { value: 'none', label: 'Does not recharge' },
] as const;

/** Add a companion (from a template or from scratch) or edit an existing one. */
export function CompanionEditor({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent: add a new companion. */
  editing?: Companion;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${editing.name}` : 'Add companion'}
      description={editing ? 'Change any detail.' : 'Start from a template or enter your own.'}
      className="sm:w-xl"
    >
      {open && (
        <EditorForm
          key={editing?.id ?? 'new'}
          editing={editing}
          onDone={() => onOpenChange(false)}
        />
      )}
    </Sheet>
  );
}

function EditorForm({ editing, onDone }: { editing?: Companion; onDone: () => void }) {
  const { run } = useCommand();
  const [form, setForm] = useState<CompanionForm>(() => (editing ? toForm(editing) : emptyForm()));
  const [template, setTemplate] = useState('');
  const [base, setBase] = useState<Omit<Companion, 'id'>>();
  const [error, setError] = useState<string | null>(null);
  const prefix = editing ? `edit-${editing.id}` : 'comp';
  const set = (patch: Partial<CompanionForm>) => {
    setError(null);
    setForm((current) => ({ ...current, ...patch }));
  };

  const pick = (label: string) => {
    setTemplate(label);
    const chosen = COMPANION_TEMPLATES.find((entry) => entry.label === label)?.companion;
    setError(null);
    setBase(chosen);
    setForm(chosen ? toForm(chosen) : emptyForm());
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = fromForm(form, editing?.id ?? crypto.randomUUID(), editing ?? base);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    run(
      editing ? updateCompanion : addCompanion,
      { companion: result.companion },
      undefined,
      onDone,
    );
  };

  const setAttack = (index: number, patch: Partial<CompanionForm['attacks'][number]>) =>
    set({
      attacks: form.attacks.map((attack, at) => (at === index ? { ...attack, ...patch } : attack)),
    });
  const setUse = (index: number, patch: Partial<CompanionForm['uses'][number]>) =>
    set({ uses: form.uses.map((use, at) => (at === index ? { ...use, ...patch } : use)) });

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {!editing && (
        <Field label="Template" htmlFor="comp-template">
          <select
            id="comp-template"
            className={inputClass}
            value={template}
            onChange={(event) => pick(event.target.value)}
          >
            <option value="">Custom</option>
            {[...new Set(COMPANION_TEMPLATES.map((entry) => entry.group))].map((group) => (
              <optgroup key={group} label={group}>
                {COMPANION_TEMPLATES.filter((entry) => entry.group === group).map((entry) => (
                  <option key={entry.label} value={entry.label}>
                    {entry.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor={`${prefix}-name`}>
          <input
            id={`${prefix}-name`}
            className={inputClass}
            value={form.name}
            onChange={(event) => set({ name: event.target.value })}
          />
        </Field>
        <Field label="Type" htmlFor={`${prefix}-type`}>
          <select
            id={`${prefix}-type`}
            className={inputClass}
            value={form.type}
            onChange={(event) => set({ type: event.target.value as CompanionType })}
          >
            {COMPANION_TYPES.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="What it is" htmlFor={`${prefix}-kind`} hint="For example: Medium beast">
        <input
          id={`${prefix}-kind`}
          className={inputClass}
          value={form.kind}
          onChange={(event) => set({ kind: event.target.value })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          id={`${prefix}-ac`}
          label="AC"
          value={form.ac}
          onChange={(ac) => set({ ac })}
        />
        <NumberField
          id={`${prefix}-hp`}
          label="Max HP"
          value={form.maxHp}
          onChange={(maxHp) => set({ maxHp })}
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-text">Speed (ft.)</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {SPEED_KINDS.map((kind) => (
            <Field
              key={kind}
              label={kind[0]!.toUpperCase() + kind.slice(1)}
              htmlFor={`${prefix}-speed-${kind}`}
            >
              <input
                id={`${prefix}-speed-${kind}`}
                inputMode="numeric"
                className={inputClass}
                value={form.speed[kind]}
                onChange={(event) => set({ speed: { ...form.speed, [kind]: event.target.value } })}
              />
            </Field>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-text">Ability scores</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ABILITIES.map((ability) => (
            <Field key={ability} label={ability} htmlFor={`${prefix}-${ability}`}>
              <input
                id={`${prefix}-${ability}`}
                inputMode="numeric"
                className={inputClass}
                value={form.abilities[ability]}
                onChange={(event) =>
                  set({ abilities: { ...form.abilities, [ability]: event.target.value } })
                }
              />
            </Field>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold text-text">Attacks</legend>
        {form.attacks.map((attack, index) => {
          const id = `${prefix}-attack-${index}`;
          const label = attack.name.trim() || `attack ${index + 1}`;
          return (
            <div
              key={index}
              role="group"
              aria-label={`Attack ${index + 1}`}
              className="grid grid-cols-2 gap-2 rounded-card border border-border p-3 sm:grid-cols-3"
            >
              <Field
                label="Attack name"
                htmlFor={`${id}-name`}
                className="col-span-2 sm:col-span-1"
              >
                <input
                  id={`${id}-name`}
                  className={inputClass}
                  value={attack.name}
                  onChange={(event) => setAttack(index, { name: event.target.value })}
                />
              </Field>
              <NumberField
                id={`${id}-bonus`}
                label="To hit"
                value={attack.bonus}
                onChange={(bonus) => setAttack(index, { bonus })}
              />
              <Field label="Damage dice" htmlFor={`${id}-dice`}>
                <input
                  id={`${id}-dice`}
                  placeholder="1d6"
                  className={inputClass}
                  value={attack.dice}
                  onChange={(event) => setAttack(index, { dice: event.target.value })}
                />
              </Field>
              <NumberField
                id={`${id}-dmg`}
                label="Damage bonus"
                value={attack.damageBonus}
                onChange={(damageBonus) => setAttack(index, { damageBonus })}
              />
              <Field label="Damage type" htmlFor={`${id}-type`}>
                <select
                  id={`${id}-type`}
                  className={inputClass}
                  value={attack.type}
                  onChange={(event) =>
                    setAttack(index, { type: event.target.value as DamageType | '' })
                  }
                >
                  <option value="">None</option>
                  {DAMAGE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Range" htmlFor={`${id}-range`}>
                <input
                  id={`${id}-range`}
                  placeholder="5 ft."
                  className={inputClass}
                  value={attack.range}
                  onChange={(event) => setAttack(index, { range: event.target.value })}
                />
              </Field>
              <Field label="Note" htmlFor={`${id}-note`} className="col-span-2">
                <input
                  id={`${id}-note`}
                  className={inputClass}
                  value={attack.note}
                  onChange={(event) => setAttack(index, { note: event.target.value })}
                />
              </Field>
              <button
                type="button"
                aria-label={`Remove ${label}`}
                className={`${smallButton} self-end text-danger`}
                onClick={() => set({ attacks: form.attacks.filter((_, at) => at !== index) })}
              >
                <Trash2 size={16} aria-hidden />
                Remove
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className={`${smallButton} self-start`}
          onClick={() => set({ attacks: [...form.attacks, emptyAttack()] })}
        >
          <Plus size={16} aria-hidden />
          Add attack
        </button>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold text-text">Limited uses</legend>
        {form.uses.map((use, index) => {
          const id = `${prefix}-use-${index}`;
          const label = use.name.trim() || `use ${index + 1}`;
          return (
            <div
              key={use.id}
              role="group"
              aria-label={`Limited use ${index + 1}`}
              className="grid grid-cols-2 gap-2 rounded-card border border-border p-3 sm:grid-cols-3"
            >
              <Field label="Use name" htmlFor={`${id}-name`} className="col-span-2 sm:col-span-1">
                <input
                  id={`${id}-name`}
                  className={inputClass}
                  value={use.name}
                  onChange={(event) => setUse(index, { name: event.target.value })}
                />
              </Field>
              <Field label="Uses" htmlFor={`${id}-max`}>
                <input
                  id={`${id}-max`}
                  inputMode="numeric"
                  className={inputClass}
                  value={use.max}
                  onChange={(event) => setUse(index, { max: event.target.value })}
                />
              </Field>
              <Field label="Recharge" htmlFor={`${id}-recharge`}>
                <select
                  id={`${id}-recharge`}
                  className={inputClass}
                  value={use.recharge}
                  onChange={(event) =>
                    setUse(index, {
                      recharge: event.target.value as CompanionForm['uses'][number]['recharge'],
                    })
                  }
                >
                  {RECHARGES.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                type="button"
                aria-label={`Remove ${label}`}
                className={`${smallButton} self-end text-danger`}
                onClick={() => set({ uses: form.uses.filter((_, at) => at !== index) })}
              >
                <Trash2 size={16} aria-hidden />
                Remove
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className={`${smallButton} self-start`}
          onClick={() =>
            set({
              uses: [
                ...form.uses,
                { id: crypto.randomUUID(), name: '', max: '1', recharge: 'long' },
              ],
            })
          }
        >
          <Plus size={16} aria-hidden />
          Add limited use
        </button>
      </fieldset>

      <Field label="Traits" htmlFor={`${prefix}-traits`} hint="One per line, in your own words.">
        <textarea
          id={`${prefix}-traits`}
          rows={3}
          className={`${inputClass} py-2`}
          value={form.traits}
          onChange={(event) => set({ traits: event.target.value })}
        />
      </Field>
      <Field label="Notes" htmlFor={`${prefix}-notes`}>
        <textarea
          id={`${prefix}-notes`}
          rows={3}
          className={`${inputClass} py-2`}
          value={form.notes}
          onChange={(event) => set({ notes: event.target.value })}
        />
      </Field>

      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="min-h-11 rounded-btn bg-accent px-4 font-semibold text-bg disabled:opacity-40"
      >
        {editing ? 'Save companion' : 'Add companion'}
      </button>
    </form>
  );
}

/** A number box, or a note when the value is worked out from the owner. */
function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: NumberInput;
  onChange: (value: NumberInput) => void;
}) {
  if (typeof value !== 'string')
    return (
      <Field label={label} htmlFor={id}>
        <button id={id} type="button" className={smallButton} onClick={() => onChange('')}>
          From owner · enter own
        </button>
      </Field>
    );
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        inputMode="numeric"
        className={inputClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
