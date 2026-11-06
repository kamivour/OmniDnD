import { useId, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { registry } from '../../data/registry';
import { attunedItems } from '../../engine/calc/attunement';
import { setItemAttunement } from '../../engine/commands';
import { ATTUNEMENT_LIMIT } from '../../engine/rules2014';
import { storageStatusStore } from '../../state/persistence';
import { useCommand } from '../commands/command-context';
import { Field, inputClass } from '../components/fields';
import { Sheet } from '../components/Sheet';
import { useCharacter } from '../hooks/useCharacter';
import { inventoryGroups } from './inventory-model';

const button = 'min-h-11 rounded-btn border border-border px-3 text-sm disabled:opacity-40';

/** A recorded bond remains separate from equipment, quantity and elapsed rest time. */
export function InventoryAttunement() {
  const { state } = useCharacter();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const conflict = useStore(storageStatusStore, (status) => status.conflict);
  const attuned = attunedItems(state);
  return (
    <section
      aria-label="Attunement"
      className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Attunement</h2>
          <p className="text-sm tabular-nums text-text-muted">
            {attuned.length}/{ATTUNEMENT_LIMIT} attuned
          </p>
        </div>
        <button
          ref={opener}
          type="button"
          disabled={conflict || state.build.items.length === 0}
          onClick={() => setOpen(true)}
          className={`${button} text-accent`}
        >
          Manage attunement
        </button>
      </div>
      {attuned.length > ATTUNEMENT_LIMIT && (
        <p role="note" className="text-sm text-warn">
          More than three bonds are recorded. Review and end a bond before recording another.
        </p>
      )}
      {attuned.length > 0 && (
        <ul className="list-disc space-y-1 pl-4 text-sm">
          {attuned.map((item) => (
            <li key={item.instanceId} className="wrap-anywhere">
              {registry.get('item', item.itemId).name}
              {item.notes ? ` · ${item.notes}` : ''}
              {state.live.items[item.instanceId]?.qty === 0 ? ' · quantity 0' : ''}
            </li>
          ))}
        </ul>
      )}
      {state.build.items.length === 0 && (
        <p className="text-sm text-text-muted">Add an item to record a bond.</p>
      )}
      {open && (
        <AttunementDialog onClose={() => setOpen(false)} returnFocusTo={() => opener.current} />
      )}
    </section>
  );
}

function AttunementDialog({
  onClose,
  returnFocusTo,
}: {
  onClose: () => void;
  returnFocusTo: () => HTMLElement | null;
}) {
  const { state, sheet } = useCharacter();
  const { run, warningOpen } = useCommand();
  const conflict = useStore(storageStatusStore, (status) => status.conflict);
  const [search, setSearch] = useState('');
  const [others, setOthers] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const done = useRef<HTMLButtonElement>(null);
  const prefix = useId();
  const attuned = attunedItems(state);
  const items = inventoryGroups(state, registry).flatMap((group) =>
    group.items.map((item) => ({ ...item, location: group.name })),
  );
  const matching = items.filter(
    (item) =>
      (others || item.attuned || item.def.attunement === true) &&
      `${item.def.name} ${item.notes ?? ''} ${item.location}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title="Manage attunement"
      description="Record completed bonds and ended bonds. Changes save immediately."
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        searchInput.current?.focus({ preventScroll: true });
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        returnFocusTo()?.focus();
      }}
    >
      <div className="flex min-w-0 flex-col gap-4">
        <p className="font-semibold tabular-nums">
          {attuned.length}/{ATTUNEMENT_LIMIT} attuned
        </p>
        <p className="text-sm text-text-muted">
          Attuning or voluntarily ending a bond normally needs a focused short rest. Check contact,
          prerequisites, curses and magical benefits with your DM; record elapsed time with the Game
          Clock.
        </p>
        <Field label="Search items" htmlFor={`${prefix}-search`}>
          <input
            ref={searchInput}
            id={`${prefix}-search`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={inputClass}
          />
        </Field>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={others}
            onChange={(event) => setOthers(event.target.checked)}
            className="size-4 accent-(--omni-accent)"
          />
          Show other items
        </label>
        {matching.length === 0 && (
          <p className="text-sm text-text-muted">
            No matching attunement records. Show other items to record a DM ruling, or change the
            search.
          </p>
        )}
        {matching.map((item) => {
          const payload = {
            instanceId: item.instanceId,
            attuned: !item.attuned,
            expected: item.attuned,
          };
          const blocks =
            setItemAttunement
              .check?.({ ...state, sheet, registry }, payload)
              .filter((check) => check.level === 'block') ?? [];
          const copies = items.filter((entry) => entry.def.id === item.def.id);
          const copy = copies.findIndex((entry) => entry.instanceId === item.instanceId) + 1;
          return (
            <article
              key={item.instanceId}
              aria-label={item.def.name}
              data-instance-id={item.instanceId}
              className="flex min-w-0 flex-col gap-2 rounded-card border border-border bg-surface p-3 text-sm"
            >
              <h3 className="font-semibold wrap-anywhere">
                {item.def.name}
                {copies.length > 1 ? ` · copy ${copy}` : ''}
              </h3>
              {item.notes && <p className="whitespace-pre-line wrap-anywhere">{item.notes}</p>}
              <p className="text-xs text-text-muted wrap-anywhere">
                {item.location} · quantity {item.quantity}
              </p>
              {item.def.attunement !== true && (
                <p className="text-xs text-warn">
                  No attunement requirement is recorded for this item. Mark only with your DM's
                  ruling.
                </p>
              )}
              <label className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  aria-label={`Attuned: ${item.def.name}`}
                  checked={item.attuned}
                  disabled={conflict || warningOpen || blocks.length > 0}
                  onChange={(event) => {
                    const target = event.currentTarget;
                    const fallback = () =>
                      target.isConnected && !target.disabled ? target : done.current;
                    run(setItemAttunement, payload, fallback, () => {
                      requestAnimationFrame(() => {
                        if (
                          (!target.isConnected || target.disabled) &&
                          (document.activeElement === document.body ||
                            document.activeElement === target)
                        )
                          done.current?.focus();
                      });
                    });
                  }}
                  className="size-4 accent-(--omni-accent)"
                />
                Attuned
              </label>
              {blocks.map((check) => (
                <p key={check.reason} className="text-xs text-warn">
                  {check.reason}
                </p>
              ))}
            </article>
          );
        })}
        <button ref={done} type="button" onClick={onClose} className={button}>
          Done
        </button>
      </div>
    </Sheet>
  );
}
