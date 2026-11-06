import { useEffect, useId, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { registry } from '../../data/registry';
import { equalData } from '../../engine/commands/management';
import {
  addInventoryItem,
  editInventoryItem,
  removeInventoryItem,
  type InventoryItemBaseline,
} from '../../engine/commands/inventory';
import type { ItemDef } from '../../engine/schema';
import { storageStatusStore } from '../../state/persistence';
import { characterStore } from '../../state/character-store';
import { useCommand } from '../commands/command-context';
import { Field, inputClass } from '../components/fields';
import { Sheet } from '../components/Sheet';
import { useCharacter } from '../hooks/useCharacter';
import { catalogueItems, containerOptions } from './inventory-editor-model';
import { parseWholeCount } from './whole-count';

export type InventoryEditorRequest =
  { kind: 'add'; instanceId: string } | { kind: 'edit'; instanceId: string };

const button = 'min-h-11 rounded-btn border border-border px-3 text-sm disabled:opacity-40';
const categories: ItemDef['category'][] = [
  'weapon',
  'armor',
  'gear',
  'tool',
  'instrument',
  'container',
  'consumable',
  'magic',
];

/** Draft choices stay local; the engine owns creation, edits, removal and their Undo. */
export function InventoryEditor({
  request,
  onClose,
  returnFocusTo,
}: {
  request: InventoryEditorRequest;
  onClose: () => void;
  returnFocusTo: () => HTMLElement | null | undefined;
}) {
  const { state, sheet } = useCharacter();
  const { run, warningOpen } = useCommand();
  const conflict = useStore(storageStatusStore, (status) => status.conflict);
  const automation = useStore(characterStore, (store) => store.automation);
  const { instanceId } = request;
  const currentItem = state.build.items.find((item) => item.instanceId === instanceId);
  const currentLive = Object.hasOwn(state.live.items, instanceId)
    ? state.live.items[instanceId]
    : undefined;
  const [baseline, setBaseline] = useState<InventoryItemBaseline | null>(() =>
    request.kind === 'edit' && currentItem && currentLive
      ? structuredClone({ item: currentItem, live: currentLive })
      : null,
  );
  const [selectedId, setSelectedId] = useState(baseline?.item.itemId ?? '');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ItemDef['category'] | ''>('');
  const [otherSources, setOtherSources] = useState(false);
  const [choosing, setChoosing] = useState(request.kind === 'add');
  const [quantity, setQuantity] = useState(String(baseline?.live.qty ?? 1));
  const quantityTouched = useRef(false);
  const [container, setContainer] = useState(baseline?.item.container ?? '');
  const [notes, setNotes] = useState(baseline?.item.notes ?? '');
  const [removing, setRemoving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const attempted = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const quantityInput = useRef<HTMLInputElement>(null);
  const removalIntro = useRef<HTMLParagraphElement>(null);
  const prefix = useId();
  const selected = selectedId ? registry.get('item', selectedId) : undefined;
  const stale =
    request.kind === 'edit' &&
    (!baseline ||
      !currentItem ||
      !currentLive ||
      !equalData(baseline, { item: currentItem, live: currentLive }));
  const quantityValue = parseWholeCount(quantity) ?? NaN;
  const quantityValid = Number.isSafeInteger(quantityValue) && quantityValue >= 0;
  const options = containerOptions(
    state,
    registry,
    request.kind === 'edit' ? { movingInstanceId: instanceId } : {},
  );
  const retainedLocation = !!container && !options.some((option) => option.value === container);
  const catalogue = catalogueItems(registry, {
    search,
    ...(category ? { category } : {}),
    ...(otherSources ? {} : { sources: state.campaign.sources }),
  });
  const edited = baseline
    ? {
        instanceId,
        quantity: quantityValue,
        expected: baseline,
        ...(container === (baseline.item.container ?? '') ? {} : { container: container || null }),
        ...(notes === (baseline.item.notes ?? '') ? {} : { notes: notes || null }),
      }
    : null;
  const added = {
    instanceId,
    itemId: selectedId,
    quantity: quantityValue,
    ...(container ? { container } : {}),
    ...(notes ? { notes } : {}),
  };
  const context = { ...state, sheet, registry };
  const checks = removing
    ? (removeInventoryItem.check?.(context, {
        instanceId,
        ...(baseline ? { expected: baseline } : {}),
      }) ?? [])
    : request.kind === 'edit' && edited
      ? (editInventoryItem.check?.(context, edited) ?? [])
      : request.kind === 'add' && selected && quantityValid
        ? (addInventoryItem.check?.(context, added) ?? [])
        : [];
  const changed =
    baseline &&
    (quantityValue !== baseline.live.qty ||
      container !== (baseline.item.container ?? '') ||
      notes !== (baseline.item.notes ?? ''));
  const visibleChecks = checks.filter(
    (check) => automation === 'assisted' || check.level !== 'warn',
  );
  const canApply =
    !stale &&
    !conflict &&
    !warningOpen &&
    !checks.some((check) => check.level === 'block') &&
    (removing ||
      (quantityValid &&
        !!selected &&
        (request.kind === 'edit' || !choosing) &&
        (request.kind === 'add' || !!changed)));
  const children = state.build.items.filter(
    (item) => item.instanceId !== instanceId && item.container === instanceId,
  );

  useEffect(() => {
    if (!warningOpen) attempted.current = false;
  }, [warningOpen]);
  useEffect(() => {
    if (!removing) return;
    const intro = removalIntro.current;
    intro?.focus({ preventScroll: true });
    intro?.closest('[role="dialog"]')?.scrollTo({ top: 0 });
  }, [removing]);

  const refresh = () => {
    if (!currentItem || !currentLive) return;
    setBaseline(structuredClone({ item: currentItem, live: currentLive }));
    setSelectedId(currentItem.itemId);
    setQuantity(String(currentLive.qty));
    setContainer(currentItem.container ?? '');
    setNotes(currentItem.notes ?? '');
    setRemoving(false);
    setErrors([]);
    attempted.current = false;
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={removing ? 'Remove item?' : request.kind === 'add' ? 'Add item' : 'Edit item'}
      description={
        removing
          ? 'Review this item record and its contents before removing it.'
          : 'Record owned items, quantities, notes and locations.'
      }
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        (request.kind === 'add' ? searchInput.current : quantityInput.current)?.focus({
          preventScroll: true,
        });
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        returnFocusTo()?.focus();
      }}
    >
      <form
        noValidate
        aria-label={
          removing
            ? 'Remove inventory item'
            : request.kind === 'add'
              ? 'Add inventory item'
              : 'Edit inventory item'
        }
        className="flex min-w-0 flex-col gap-4"
        onChange={() => errors.length > 0 && setErrors([])}
        onSubmit={(event) => {
          event.preventDefault();
          if (!canApply || attempted.current) return;
          attempted.current = true;
          const result = removing
            ? run(
                removeInventoryItem,
                { instanceId, ...(baseline ? { expected: baseline } : {}) },
                returnFocusTo,
                onClose,
              )
            : request.kind === 'edit' && edited
              ? run(editInventoryItem, edited, returnFocusTo, onClose)
              : run(addInventoryItem, added, returnFocusTo, onClose);
          if (result.result === 'blocked') {
            attempted.current = false;
            setErrors(result.reasons);
          }
        }}
      >
        {stale && (
          <div role="alert" className="flex flex-col gap-2 text-sm text-warn">
            <p>
              This item changed after you opened the editor. Review the current record before
              saving.
            </p>
            {currentItem && currentLive ? (
              <button type="button" onClick={refresh} className={button}>
                Reload item
              </button>
            ) : (
              <p>The item is no longer recorded.</p>
            )}
          </div>
        )}
        {conflict && (
          <p role="alert" className="text-sm text-warn">
            Reload this window before editing; another window saved changes.
          </p>
        )}
        {removing ? (
          <>
            <p ref={removalIntro} tabIndex={-1} className="text-sm">
              Remove the entire {selected?.name ?? 'item'} record ({baseline?.live.qty ?? 0}{' '}
              recorded)? To reduce its count, edit Quantity instead.
            </p>
            {baseline?.item.notes && (
              <p className="whitespace-pre-line text-sm wrap-anywhere">{baseline.item.notes}</p>
            )}
            {children.length > 0 ? (
              <div className="text-sm">
                <p className="mb-2">
                  These direct contents move to Carried. Their own contents keep their container
                  links.
                </p>
                <ul className="list-disc space-y-2 pl-4">
                  {children.map((item) => (
                    <li key={item.instanceId} className="wrap-anywhere">
                      {registry.get('item', item.itemId).name}
                      {item.notes ? ` · ${item.notes}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-text-muted">This record has no direct contents.</p>
            )}
            {(baseline?.live.equipped || baseline?.live.attuned) && (
              <p className="text-sm text-warn">
                This item is marked {baseline.live.equipped ? 'equipped' : 'attuned'}. Review the
                shared equipment values after removal.
              </p>
            )}
          </>
        ) : (
          <>
            {request.kind === 'add' && choosing ? (
              <>
                <Field label="Search items" htmlFor={`${prefix}-search`}>
                  <input
                    ref={searchInput}
                    id={`${prefix}-search`}
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Category" htmlFor={`${prefix}-category`}>
                  <select
                    id={`${prefix}-category`}
                    value={category}
                    onChange={(event) =>
                      setCategory(event.target.value as ItemDef['category'] | '')
                    }
                    className={inputClass}
                  >
                    <option value="">All categories</option>
                    {categories.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={otherSources}
                    onChange={(event) => setOtherSources(event.target.checked)}
                    className="size-4 accent-(--omni-accent)"
                  />
                  Include other sources
                </label>
                <ul
                  aria-label="Catalogue items"
                  className="flex max-h-56 flex-col gap-2 overflow-y-auto"
                >
                  {catalogue.map((def) => (
                    <li key={def.id}>
                      <button
                        type="button"
                        aria-label={`Select ${def.name}`}
                        className={`${button} flex w-full items-center justify-between gap-2 text-left`}
                        onClick={() => {
                          setSelectedId(def.id);
                          if (!quantityTouched.current) setQuantity(String(def.bundle ?? 1));
                          setChoosing(false);
                          setErrors([]);
                          requestAnimationFrame(() => quantityInput.current?.focus());
                        }}
                      >
                        <span className="min-w-0 wrap-anywhere">{def.name}</span>
                        <span className="shrink-0 text-xs text-text-muted">{def.source}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {catalogue.length === 0 && (
                  <p className="text-sm text-text-muted">No items match these choices.</p>
                )}
              </>
            ) : (
              selected && (
                <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3">
                  <h3 className="font-semibold">{selected.name}</h3>
                  <p className="text-xs text-text-muted">
                    {selected.category} · {selected.source}
                  </p>
                  {selected.summary?.effect && <p className="text-sm">{selected.summary.effect}</p>}
                  {selected.bundle && (
                    <p className="text-sm text-text-muted">
                      Purchase bundle: {selected.bundle}. Quantity counts individual items.
                    </p>
                  )}
                  {request.kind === 'add' && (
                    <button
                      type="button"
                      onClick={() => {
                        setChoosing(true);
                        requestAnimationFrame(() => searchInput.current?.focus());
                      }}
                      className={button}
                    >
                      Change item
                    </button>
                  )}
                </div>
              )
            )}
            {(request.kind === 'edit' || (selected && !choosing)) && (
              <>
                <Field
                  label="Quantity"
                  htmlFor={`${prefix}-quantity`}
                  hint="Record a whole number of individual items, including zero."
                >
                  <input
                    ref={quantityInput}
                    id={`${prefix}-quantity`}
                    type="number"
                    min={0}
                    step={1}
                    value={quantity}
                    onChange={(event) => {
                      quantityTouched.current = true;
                      setQuantity(event.target.value);
                    }}
                    className={inputClass}
                  />
                </Field>
                {!quantityValid && (
                  <p role="alert" className="text-sm text-warn">
                    Enter a safe whole quantity of zero or more.
                  </p>
                )}
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
                    {retainedLocation && (
                      <option value={container}>Recorded location (review needed)</option>
                    )}
                  </select>
                </Field>
                {retainedLocation && (
                  <p className="text-sm text-warn">
                    The recorded location needs review. Keep it while editing notes, or choose a
                    valid container to move this item.
                  </p>
                )}
                <Field label="Notes" htmlFor={`${prefix}-notes`}>
                  <textarea
                    id={`${prefix}-notes`}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                    className={`${inputClass} py-2`}
                  />
                </Field>
              </>
            )}
          </>
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
            onClick={removing ? () => setRemoving(false) : onClose}
            className={button}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canApply}
            className={`${button} ${removing ? 'text-danger' : 'text-accent'}`}
          >
            {removing ? 'Remove item' : request.kind === 'add' ? 'Add item' : 'Save item'}
          </button>
        </div>
        {request.kind === 'edit' && !removing && (
          <button
            type="button"
            disabled={stale || conflict || warningOpen}
            onClick={() => {
              setRemoving(true);
              setErrors([]);
            }}
            className={`${button} text-danger`}
          >
            Remove item
          </button>
        )}
      </form>
    </Sheet>
  );
}
