import { useId, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { registryFor } from '../../data/registry';
import {
  createCustomItem,
  deleteCustomItem,
  editCustomItem,
} from '../../engine/commands/inventory';
import { ItemRaritySchema, type ItemDef } from '../../engine/schema';
import { storageStatusStore } from '../../state/persistence';
import { characterStore } from '../../state/character-store';
import { useCommand } from '../commands/command-context';
import { Field, inputClass } from '../components/fields';
import { Sheet } from '../components/Sheet';
import { useCharacter } from '../hooks/useCharacter';
import {
  baseItemOptions,
  buildCustomItem,
  customItemFields,
  emptyCustomItemFields,
  MAX_DESCRIPTION_WORDS,
  newCustomItemId,
  type CustomItemFields,
} from './custom-item-model';
import { containerOptions } from './inventory-editor-model';
import { parseWholeCount } from './whole-count';

export type CustomItemRequest =
  { kind: 'create'; instanceId: string } | { kind: 'edit'; itemId: string };

const button = 'min-h-11 rounded-btn border border-border px-3 text-sm disabled:opacity-40';
const categories: ItemDef['category'][] = [
  'magic',
  'weapon',
  'armor',
  'consumable',
  'gear',
  'tool',
  'instrument',
  'container',
];
const recharges = [
  { value: 'dawn', label: 'At dawn' },
  { value: 'long', label: 'On a long rest' },
  { value: 'short', label: 'On a short or long rest' },
  { value: 'none', label: 'Never' },
] as const;

/** Define an item the catalogue lacks. It is saved on this character and travels with exports. */
export function CustomItemEditor({
  request,
  onClose,
  returnFocusTo,
}: {
  request: CustomItemRequest;
  onClose: () => void;
  returnFocusTo: () => HTMLElement | null | undefined;
}) {
  const { state, sheet } = useCharacter();
  const registry = registryFor(state.build);
  const { run, warningOpen } = useCommand();
  const conflict = useStore(storageStatusStore, (status) => status.conflict);
  const automation = useStore(characterStore, (store) => store.automation);
  const saved =
    request.kind === 'edit'
      ? state.build.customItems?.find((item) => item.id === request.itemId)
      : undefined;
  const [original] = useState(saved);
  const [fields, setFields] = useState<CustomItemFields>(() =>
    original ? customItemFields(original) : emptyCustomItemFields(),
  );
  const [quantity, setQuantity] = useState('1');
  const [container, setContainer] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const prefix = useId();
  const set = <K extends keyof CustomItemFields>(key: K, value: CustomItemFields[K]) => {
    setFields((current) => ({ ...current, [key]: value }));
    setErrors([]);
  };

  const id = original?.id ?? newCustomItemId(fields.name, (value) => registry.entries.has(value));
  const built = buildCustomItem(fields, id, registry);
  const quantityValue = parseWholeCount(quantity);
  const context = { ...state, sheet, registry };
  const createPayload =
    request.kind === 'create' && built.item && quantityValue !== undefined
      ? {
          item: built.item,
          instanceId: request.instanceId,
          quantity: quantityValue,
          ...(container ? { container } : {}),
        }
      : undefined;
  const editPayload =
    request.kind === 'edit' && built.item && original
      ? { item: built.item, expected: original }
      : undefined;
  const checks = deleting
    ? (deleteCustomItem.check?.(context, { itemId: id }) ?? [])
    : createPayload
      ? (createCustomItem.check?.(context, createPayload) ?? [])
      : editPayload
        ? (editCustomItem.check?.(context, editPayload) ?? [])
        : [];
  const visibleChecks = checks.filter(
    (check) => automation === 'assisted' || check.level !== 'warn',
  );
  const missing = request.kind === 'edit' && !saved;
  const blocked = checks.some((check) => check.level === 'block');
  const busy = conflict || warningOpen || missing;
  const statsFrom = fields.category === 'weapon' || fields.category === 'armor';
  const bases = baseItemOptions(registry, fields.category);
  const hasCharges = fields.charges.trim() !== '';
  const options = containerOptions(state, registry);

  const submit = () => {
    if (busy) return;
    if (deleting) {
      const result = run(deleteCustomItem, { itemId: id }, returnFocusTo, onClose);
      if (result.result === 'blocked') setErrors(result.reasons);
      return;
    }
    setShowErrors(true);
    if (!built.item || blocked) return;
    const result = createPayload
      ? run(createCustomItem, createPayload, returnFocusTo, onClose)
      : editPayload
        ? run(editCustomItem, editPayload, returnFocusTo, onClose)
        : undefined;
    if (result?.result === 'blocked') setErrors(result.reasons);
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={
        deleting
          ? 'Delete custom item?'
          : request.kind === 'create'
            ? 'Create item'
            : 'Edit custom item'
      }
      description="Your own item, saved with this character and included in its exports."
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
        aria-label={request.kind === 'create' ? 'Create custom item' : 'Edit custom item'}
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
            This custom item is no longer saved on the character.
          </p>
        )}
        {deleting ? (
          <p className="text-sm">
            Delete the {original?.name ?? 'custom item'} definition? Undo can restore it.
          </p>
        ) : (
          <>
            <Field label="Name" htmlFor={`${prefix}-name`}>
              <input
                ref={nameInput}
                id={`${prefix}-name`}
                value={fields.name}
                onChange={(event) => set('name', event.target.value)}
                className={inputClass}
              />
            </Field>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <Field label="Type" htmlFor={`${prefix}-category`}>
                <select
                  id={`${prefix}-category`}
                  value={fields.category}
                  onChange={(event) => {
                    set('category', event.target.value as ItemDef['category']);
                    set('baseItemId', '');
                  }}
                  className={inputClass}
                >
                  {categories.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </Field>
              {statsFrom && (
                <Field
                  label="Based on"
                  htmlFor={`${prefix}-base`}
                  hint={`Uses this ${fields.category}'s stats and proficiency.`}
                >
                  <select
                    id={`${prefix}-base`}
                    value={fields.baseItemId}
                    onChange={(event) => set('baseItemId', event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Choose…</option>
                    {bases.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Rarity" htmlFor={`${prefix}-rarity`}>
                <select
                  id={`${prefix}-rarity`}
                  value={fields.rarity}
                  onChange={(event) =>
                    set('rarity', event.target.value as CustomItemFields['rarity'])
                  }
                  className={inputClass}
                >
                  <option value="">None</option>
                  {ItemRaritySchema.options.map((value) => (
                    <option key={value} value={value}>
                      {value.replace('-', ' ')}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Weight (lb)" htmlFor={`${prefix}-weight`}>
                <input
                  id={`${prefix}-weight`}
                  inputMode="decimal"
                  value={fields.weight}
                  placeholder={statsFrom ? 'Same as base' : ''}
                  onChange={(event) => set('weight', event.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Cost (gp)" htmlFor={`${prefix}-cost`}>
                <input
                  id={`${prefix}-cost`}
                  inputMode="decimal"
                  value={fields.cost}
                  onChange={(event) => set('cost', event.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={fields.attunement}
                onChange={(event) => set('attunement', event.target.checked)}
                className="size-4 accent-(--omni-accent)"
              />
              Requires attunement
            </label>
            <Field
              label="Description"
              htmlFor={`${prefix}-description`}
              hint={`Your own words, up to ${MAX_DESCRIPTION_WORDS}.`}
            >
              <textarea
                id={`${prefix}-description`}
                rows={3}
                value={fields.description}
                onChange={(event) => set('description', event.target.value)}
                className={`${inputClass} py-2`}
              />
            </Field>
            <fieldset className="flex min-w-0 flex-col gap-3">
              <legend className="mb-2 text-xs text-text-muted">Charges (optional)</legend>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <Field label="Maximum charges" htmlFor={`${prefix}-charges`}>
                  <input
                    id={`${prefix}-charges`}
                    inputMode="numeric"
                    value={fields.charges}
                    onChange={(event) => set('charges', event.target.value)}
                    className={inputClass}
                  />
                </Field>
                {hasCharges && (
                  <Field label="Recharges" htmlFor={`${prefix}-recharge`}>
                    <select
                      id={`${prefix}-recharge`}
                      value={fields.recharge}
                      onChange={(event) =>
                        set('recharge', event.target.value as CustomItemFields['recharge'])
                      }
                      className={inputClass}
                    >
                      {recharges.map(({ value, label }) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {hasCharges && fields.recharge !== 'none' && (
                  <Field label="Regains" htmlFor={`${prefix}-regain`}>
                    <select
                      id={`${prefix}-regain`}
                      value={fields.regain}
                      onChange={(event) =>
                        set('regain', event.target.value as CustomItemFields['regain'])
                      }
                      className={inputClass}
                    >
                      <option value="dice">A rolled amount</option>
                      <option value="all">All charges</option>
                    </select>
                  </Field>
                )}
                {hasCharges && fields.recharge !== 'none' && fields.regain === 'dice' && (
                  <div className="flex min-w-0 gap-3">
                    <Field
                      label="Dice"
                      htmlFor={`${prefix}-regain-dice`}
                      className="min-w-0 flex-1"
                    >
                      <input
                        id={`${prefix}-regain-dice`}
                        value={fields.regainDice}
                        placeholder="1d6"
                        onChange={(event) => set('regainDice', event.target.value)}
                        className={inputClass}
                      />
                    </Field>
                    <Field
                      label="Plus"
                      htmlFor={`${prefix}-regain-bonus`}
                      className="min-w-0 flex-1"
                    >
                      <input
                        id={`${prefix}-regain-bonus`}
                        inputMode="numeric"
                        value={fields.regainBonus}
                        onChange={(event) => set('regainBonus', event.target.value)}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                )}
              </div>
            </fieldset>
            {fields.category === 'consumable' && (
              <div className="flex min-w-0 gap-3">
                <Field
                  label="Healing dice"
                  htmlFor={`${prefix}-healing-dice`}
                  hint="Leave blank if it does not heal."
                  className="min-w-0 flex-1"
                >
                  <input
                    id={`${prefix}-healing-dice`}
                    value={fields.healingDice}
                    placeholder="2d4"
                    onChange={(event) => set('healingDice', event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Plus" htmlFor={`${prefix}-healing-bonus`} className="min-w-0 flex-1">
                  <input
                    id={`${prefix}-healing-bonus`}
                    inputMode="numeric"
                    value={fields.healingBonus}
                    onChange={(event) => set('healingBonus', event.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
            )}
            {request.kind === 'create' && (
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <Field label="Quantity" htmlFor={`${prefix}-quantity`}>
                  <input
                    id={`${prefix}-quantity`}
                    inputMode="numeric"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Container" htmlFor={`${prefix}-container`}>
                  <select
                    id={`${prefix}-container`}
                    value={container}
                    onChange={(event) => setContainer(event.target.value)}
                    className={inputClass}
                  >
                    {options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            {request.kind === 'create' && quantityValue === undefined && (
              <p role="alert" className="text-sm text-warn">
                Enter a whole quantity of zero or more.
              </p>
            )}
          </>
        )}
        {showErrors && !deleting && built.errors.length > 0 && (
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
          <button
            type="button"
            onClick={deleting ? () => setDeleting(false) : onClose}
            className={button}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || blocked}
            className={`${button} ${deleting ? 'text-danger' : 'text-accent'}`}
          >
            {deleting ? 'Delete item' : request.kind === 'create' ? 'Create item' : 'Save item'}
          </button>
        </div>
        {request.kind === 'edit' && !deleting && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDeleting(true);
              setErrors([]);
            }}
            className={`${button} text-danger`}
          >
            Delete custom item
          </button>
        )}
      </form>
    </Sheet>
  );
}
