import { useId, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { registry } from '../../data/registry';
import {
  rechargeItem,
  setItemCharges,
  skipItemRecharge,
  spendItemCharges,
  type Command,
} from '../../engine/commands';
import { storageStatusStore } from '../../state/persistence';
import { useCommand } from '../commands/command-context';
import { inputClass } from '../components/fields';
import { useCharacter } from '../hooks/useCharacter';
import { inventoryGroups, inventoryItem, regainText, type InventoryItem } from './inventory-model';
import { parseWholeCount } from './whole-count';

const button = 'min-h-11 rounded-btn border border-border px-3 text-sm disabled:opacity-40';

/** Run a charge command and keep focus inside the controls when the clicked button disables. */
function useChargeRun(container: React.RefObject<HTMLElement | null>) {
  const { run } = useCommand();
  const fallback = () =>
    container.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)');
  return <P,>(command: Command<P>, payload: P, done?: () => void) => {
    const focused = document.activeElement;
    run(command, payload, fallback, () => {
      done?.();
      requestAnimationFrame(() => {
        if (
          focused instanceof HTMLElement &&
          (!focused.isConnected || focused.matches(':disabled')) &&
          (document.activeElement === document.body || document.activeElement === focused)
        )
          fallback()?.focus();
      });
    });
  };
}

/** Spend and correct one item's charges. Effects of the charge stay manual. */
export function ItemChargeControls({ instanceId }: { instanceId: string }) {
  const { state } = useCharacter();
  const item = inventoryItem(state, registry, instanceId);
  const conflict = useStore(storageStatusStore, (status) => status.conflict);
  const container = useRef<HTMLDivElement>(null);
  const apply = useChargeRun(container);
  const [setting, setSetting] = useState<string | null>(null);
  const prefix = useId();
  if (!item?.def.charges || item.charges === undefined) return null;
  const { max } = item.def.charges;
  const current = item.charges;
  const parsed = setting === null ? undefined : parseWholeCount(setting);
  return (
    <div ref={container} className="flex min-w-0 flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <output
          aria-label={`Charges: ${item.def.name}`}
          className="min-w-16 font-semibold tabular-nums"
        >
          {current}/{max} charges
        </output>
        <button
          type="button"
          aria-label={`Use 1 charge: ${item.def.name}`}
          disabled={conflict || current === 0 || item.quantity === 0}
          onClick={() => apply(spendItemCharges, { instanceId, count: 1, expected: current })}
          className={`${button} text-accent`}
        >
          Use 1
        </button>
        {setting === null && (
          <button
            type="button"
            aria-label={`Set charges: ${item.def.name}`}
            disabled={conflict}
            onClick={() => setSetting(String(current))}
            className={button}
          >
            Set
          </button>
        )}
      </div>
      <p className="text-xs text-text-muted">{regainText(item.def.charges)}</p>
      {setting !== null && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (parsed === undefined || parsed > max) return;
            apply(setItemCharges, { instanceId, charges: parsed }, () => setSetting(null));
          }}
        >
          <label htmlFor={`${prefix}-set`} className="sr-only">
            Charges for {item.def.name}
          </label>
          <input
            id={`${prefix}-set`}
            inputMode="numeric"
            value={setting}
            onChange={(event) => setSetting(event.target.value)}
            className={`${inputClass} w-24`}
          />
          <button
            type="submit"
            disabled={conflict || parsed === undefined || parsed > max}
            className={`${button} text-accent`}
          >
            Save
          </button>
          <button type="button" onClick={() => setSetting(null)} className={button}>
            Cancel
          </button>
          {parsed !== undefined && parsed > max && (
            <p className="w-full text-xs text-warn">At most {max} charges.</p>
          )}
        </form>
      )}
      {item.rechargePending && <RechargePrompt item={item} />}
    </div>
  );
}

/** Enter the regain roll; the app adds any bonus and caps at the maximum (D117). */
function RechargePrompt({ item }: { item: InventoryItem }) {
  const conflict = useStore(storageStatusStore, (status) => status.conflict);
  const container = useRef<HTMLDivElement>(null);
  const apply = useChargeRun(container);
  const [roll, setRoll] = useState('');
  const prefix = useId();
  const regain = item.def.charges?.regain;
  const instanceId = item.instanceId;
  const dice = regain === undefined || regain === 'all' ? undefined : regain;
  const value = parseWholeCount(roll);
  return (
    <div
      ref={container}
      role="group"
      aria-label={`Recharge: ${item.def.name}`}
      className="flex min-w-0 flex-col gap-2 rounded-card border border-accent p-2"
    >
      <p className="text-sm">
        Recharge due{dice ? `: roll ${dice.dice}${dice.bonus ? ` + ${dice.bonus}` : ''}` : ''}.
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (dice && value === undefined) return;
          apply(rechargeItem, { instanceId, ...(dice && { roll: value }) });
        }}
      >
        {dice && (
          <>
            <label htmlFor={`${prefix}-roll`} className="text-xs text-text-muted">
              {dice.dice} roll
            </label>
            <input
              id={`${prefix}-roll`}
              inputMode="numeric"
              value={roll}
              onChange={(event) => setRoll(event.target.value)}
              className={`${inputClass} w-20`}
            />
          </>
        )}
        <button
          type="submit"
          disabled={conflict || (dice !== undefined && value === undefined)}
          className={`${button} text-accent`}
        >
          Apply
        </button>
        <button
          type="button"
          disabled={conflict}
          onClick={() => apply(skipItemRecharge, { instanceId })}
          className={button}
        >
          Skip
        </button>
      </form>
    </div>
  );
}

/** Names items with a regain roll waiting, so the prompt is not lost in a long inventory. */
export function InventoryRechargesDue() {
  const { state } = useCharacter();
  const due = inventoryGroups(state, registry)
    .flatMap((group) => group.items)
    .filter((item) => item.rechargePending);
  if (due.length === 0) return null;
  return (
    <section
      aria-label="Recharges due"
      className="rounded-card border border-accent bg-surface p-3 text-sm"
    >
      <h2 className="font-semibold">Recharges due</h2>
      <p className="wrap-anywhere">
        {due.map((item) => item.def.name).join(', ')}. Enter each roll on the item below.
      </p>
    </section>
  );
}
