import { useId, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { registry } from '../../data/registry';
import {
  addEffect,
  editEffect,
  EFFECT_TRIGGER_LABEL,
  type EffectEndTrigger,
} from '../../engine/commands';
import { CONDITIONS, DAMAGE_TYPES, type Condition } from '../../engine/rules2014';
import { storageStatusStore } from '../../state/persistence';
import { characterStore } from '../../state/character-store';
import { useCommand } from '../commands/command-context';
import { Field, inputClass } from '../components/fields';
import { Sheet } from '../components/Sheet';
import { useCharacter } from '../hooks/useCharacter';
import {
  buildEffect,
  EDITABLE_TARGETS,
  effectFields,
  emptyEffectFields,
  type DefenseKind,
  type DurationUnit,
  type EffectFormFields,
} from './effect-editor-model';

export type EffectEditorRequest = { kind: 'add' } | { kind: 'edit'; effectId: string };

const button = 'min-h-11 rounded-btn border border-border px-3 text-sm disabled:opacity-40';
const group = 'min-w-0 rounded-card border border-border bg-surface p-3';
const summary = 'flex min-h-11 cursor-pointer items-center text-sm font-semibold text-text';
const units: { value: DurationUnit; label: string }[] = [
  { value: 'none', label: 'No time limit' },
  { value: 'rounds', label: 'Rounds' },
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'seconds', label: 'Seconds' },
];
const triggers: EffectEndTrigger[] = ['turn-start', 'turn-end', 'short-rest', 'long-rest'];
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Record an effect on you, or change one, without retyping what the app already tracks. */
export function EffectEditor({
  request,
  onClose,
  returnFocusTo,
}: {
  request: EffectEditorRequest;
  onClose: () => void;
  returnFocusTo: () => HTMLElement | null | undefined;
}) {
  const { state, sheet } = useCharacter();
  const { run, warningOpen } = useCommand();
  const conflict = useStore(storageStatusStore, (status) => status.conflict);
  const automation = useStore(characterStore, (store) => store.automation);
  const { live } = state;
  const saved =
    request.kind === 'edit' ? live.effects.find(({ id }) => id === request.effectId) : undefined;
  const [original] = useState(saved);
  const [form, setForm] = useState<EffectFormFields>(() =>
    original ? effectFields(original, live) : emptyEffectFields(live.combat !== undefined),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  // Sections start open when they hold values; afterwards the player decides.
  const [initiallyOpen] = useState(() => ({
    conditions: form.conditions.length > 0,
    modifiers: EDITABLE_TARGETS.some(({ target }) => form.modifiers[target] !== ''),
    damage: DAMAGE_TYPES.some((type) => form.damage[type]),
  }));
  const nameInput = useRef<HTMLInputElement>(null);
  const prefix = useId();
  const set = <K extends keyof EffectFormFields>(key: K, value: EffectFormFields[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors([]);
  };

  const built = buildEffect(form, original);
  const context = { ...state, sheet, registry };
  const addPayload =
    request.kind === 'add' && built.fields
      ? { ...built.fields, ...(form.concentration ? { concentration: true } : {}) }
      : undefined;
  const editPayload =
    request.kind === 'edit' && built.fields
      ? { ...built.fields, effectId: request.effectId }
      : undefined;
  const checks = addPayload
    ? (addEffect.check?.(context, addPayload) ?? [])
    : editPayload
      ? (editEffect.check?.(context, editPayload) ?? [])
      : [];
  const visibleChecks = checks.filter(
    (check) => automation === 'assisted' || check.level !== 'warn',
  );
  const missing = request.kind === 'edit' && !saved;
  const blocked = checks.some((check) => check.level === 'block');
  const busy = conflict || warningOpen || missing;
  const concentratingOn = live.concentration
    ? registry.get('spell', live.concentration.spellId).name
    : undefined;
  const damageSet = DAMAGE_TYPES.filter((type) => form.damage[type]).length;

  const submit = () => {
    if (busy) return;
    setShowErrors(true);
    if (!built.fields || blocked) return;
    const result = addPayload
      ? run(addEffect, addPayload, returnFocusTo, onClose)
      : editPayload
        ? run(editEffect, editPayload, returnFocusTo, onClose)
        : undefined;
    if (result?.result === 'blocked') setErrors(result.reasons);
  };

  const toggleCondition = (condition: Condition, on: boolean) =>
    set(
      'conditions',
      on ? [...form.conditions, condition] : form.conditions.filter((value) => value !== condition),
    );

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={request.kind === 'add' ? 'Add effect' : 'Edit effect'}
      description="Something affecting you: an ally's spell, a potion, a DM ruling."
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        nameInput.current?.focus({ preventScroll: true });
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        returnFocusTo()?.focus();
      }}
    >
      <form
        noValidate
        aria-label={request.kind === 'add' ? 'Add effect' : 'Edit effect'}
        className="flex min-w-0 flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {conflict && (
          <p role="alert" className="text-sm text-warn">
            Reload this window before editing; another window saved changes.
          </p>
        )}
        {missing && (
          <p role="alert" className="text-sm text-warn">
            This effect has already ended.
          </p>
        )}
        <Field label="Name" htmlFor={`${prefix}-name`}>
          <input
            ref={nameInput}
            id={`${prefix}-name`}
            value={form.name}
            placeholder="Bless (from Mira)"
            onChange={(event) => set('name', event.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="grid min-w-0 grid-cols-2 gap-3">
          <Field label={request.kind === 'edit' ? 'Time left' : 'Lasts'} htmlFor={`${prefix}-unit`}>
            <select
              id={`${prefix}-unit`}
              value={form.unit}
              onChange={(event) => set('unit', event.target.value as DurationUnit)}
              className={inputClass}
            >
              {units.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {form.unit !== 'none' && (
            <Field label="Amount" htmlFor={`${prefix}-amount`}>
              <input
                id={`${prefix}-amount`}
                inputMode="numeric"
                value={form.amount}
                onChange={(event) => set('amount', event.target.value)}
                className={inputClass}
              />
            </Field>
          )}
        </div>
        <Field
          label="Also ends"
          htmlFor={`${prefix}-ends`}
          hint={live.combat ? undefined : 'Turn timing is available during combat.'}
        >
          <select
            id={`${prefix}-ends`}
            value={form.endsOn}
            onChange={(event) => set('endsOn', event.target.value as EffectEndTrigger | '')}
            className={inputClass}
          >
            <option value="">Only when time runs out or I end it</option>
            {triggers.map((trigger) => (
              <option
                key={trigger}
                value={trigger}
                disabled={!live.combat && trigger.startsWith('turn') && form.endsOn !== trigger}
              >
                {capital(EFFECT_TRIGGER_LABEL[trigger])}
              </option>
            ))}
          </select>
        </Field>
        {request.kind === 'add' && concentratingOn && (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={form.concentration}
              onChange={(event) => set('concentration', event.target.checked)}
              className="size-4 accent-(--omni-accent)"
            />
            Ends when my concentration on {concentratingOn} ends
          </label>
        )}
        <details className={group} open={initiallyOpen.conditions}>
          <summary className={summary}>
            Conditions{form.conditions.length > 0 && ` (${form.conditions.length})`}
          </summary>
          <fieldset className="grid min-w-0 grid-cols-2 gap-x-3 pt-2">
            <legend className="sr-only">Conditions</legend>
            {CONDITIONS.map((condition) => (
              <label key={condition} className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={form.conditions.includes(condition)}
                  onChange={(event) => toggleCondition(condition, event.target.checked)}
                  className="size-4 accent-(--omni-accent)"
                />
                {capital(condition)}
              </label>
            ))}
          </fieldset>
        </details>
        <details className={group} open={initiallyOpen.modifiers}>
          <summary className={summary}>Bonuses and penalties</summary>
          <fieldset className="grid min-w-0 grid-cols-2 gap-3 pt-2">
            <legend className="sr-only">Bonuses and penalties</legend>
            {EDITABLE_TARGETS.map(({ target, label }) => (
              <Field key={target} label={label} htmlFor={`${prefix}-mod-${target}`}>
                <input
                  id={`${prefix}-mod-${target}`}
                  inputMode="numeric"
                  placeholder="+0"
                  value={form.modifiers[target]}
                  onChange={(event) =>
                    set('modifiers', { ...form.modifiers, [target]: event.target.value })
                  }
                  className={inputClass}
                />
              </Field>
            ))}
          </fieldset>
          <p className="pt-2 text-xs text-text-muted">
            Dice bonuses such as Bless stay in the note; add them to your rolls yourself.
          </p>
        </details>
        <details className={group} open={initiallyOpen.damage}>
          <summary className={summary}>
            Damage resistance{damageSet > 0 && ` (${damageSet})`}
          </summary>
          <fieldset className="grid min-w-0 grid-cols-2 gap-3 pt-2">
            <legend className="sr-only">Damage resistance</legend>
            {DAMAGE_TYPES.map((type) => (
              <Field key={type} label={capital(type)} htmlFor={`${prefix}-dmg-${type}`}>
                <select
                  id={`${prefix}-dmg-${type}`}
                  value={form.damage[type]}
                  onChange={(event) =>
                    set('damage', { ...form.damage, [type]: event.target.value as DefenseKind })
                  }
                  className={inputClass}
                >
                  <option value="">Normal</option>
                  <option value="resistances">Resistant</option>
                  <option value="immunities">Immune</option>
                  <option value="vulnerabilities">Vulnerable</option>
                </select>
              </Field>
            ))}
          </fieldset>
          <p className="pt-2 text-xs text-text-muted">
            Shown as a reminder. Enter damage after any resistance.
          </p>
        </details>
        <Field label="Note" htmlFor={`${prefix}-note`}>
          <textarea
            id={`${prefix}-note`}
            rows={2}
            value={form.note}
            onChange={(event) => set('note', event.target.value)}
            className={`${inputClass} py-2`}
          />
        </Field>
        {showErrors && built.errors.length > 0 && (
          <ul role="alert" className="list-disc space-y-1 pl-4 text-sm text-warn">
            {built.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
        {visibleChecks.length > 0 && (
          <ul className="list-disc space-y-1 pl-4 text-sm text-warn">
            {visibleChecks.map(({ reason }) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        {errors.length > 0 && (
          <p role="alert" className="text-sm text-warn">
            {errors.join(' · ')}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className={button}>
            Cancel
          </button>
          <button type="submit" disabled={busy || blocked} className={`${button} text-accent`}>
            {request.kind === 'add' ? 'Add effect' : 'Save effect'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
