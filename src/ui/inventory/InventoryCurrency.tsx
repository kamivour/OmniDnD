import { useEffect, useId, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { registry } from '../../data/registry';
import { CURRENCY_UNITS, currencyTotals, type CurrencyUnit } from '../../engine/calc/currency';
import { coinWeight } from '../../engine/calc/inventory-weight';
import { adjustCurrency, runCommand } from '../../engine/commands';
import type { LiveState } from '../../engine/schema';
import { characterStore } from '../../state/character-store';
import { storageStatusStore } from '../../state/persistence';
import { useCommand } from '../commands/command-context';
import { Field, inputClass } from '../components/fields';
import { Preview } from '../components/Preview';
import { Sheet } from '../components/Sheet';
import { useCharacter } from '../hooks/useCharacter';
import { parseWholeCount } from './whole-count';

const button = 'min-h-11 rounded-btn border border-border px-3 text-sm disabled:opacity-40';

function CurrencyValueDetails({ currency }: { currency: LiveState['currency'] }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <h3 className="font-semibold">Currency value</h3>
      <dl className="flex flex-col gap-2">
        {CURRENCY_UNITS.map((unit) => {
          const part = currencyTotals({
            cp: 0,
            sp: 0,
            ep: 0,
            gp: 0,
            pp: 0,
            [unit]: currency[unit],
          });
          return (
            <div key={unit} className="flex min-w-0 justify-between gap-3">
              <dt className="wrap-anywhere">
                {currency[unit]} {unit}
              </dt>
              <dd className="text-right tabular-nums wrap-anywhere">{part.gold} gp</dd>
            </div>
          );
        })}
      </dl>
      <p className="text-text-muted">
        Value is calculated from the recorded denominations. Spending uses the selected coins.
      </p>
    </div>
  );
}

/** Actual coin counts stay separate; only their value and physical weight are combined. */
export function InventoryCurrency() {
  const { state } = useCharacter();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const conflict = useStore(storageStatusStore, (status) => status.conflict);
  const totals = currencyTotals(state.live.currency);
  return (
    <section
      aria-label="Currency"
      className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Currency</h2>
        <button
          ref={opener}
          type="button"
          disabled={conflict}
          onClick={() => setOpen(true)}
          className={`${button} text-accent`}
        >
          Adjust currency
        </button>
      </div>
      <dl className="grid grid-cols-5 gap-2 text-center text-sm">
        {CURRENCY_UNITS.map((unit) => (
          <div key={unit} className="min-w-0">
            <dt className="text-xs text-text-muted">{unit}</dt>
            <dd className="tabular-nums wrap-anywhere">{state.live.currency[unit]}</dd>
          </div>
        ))}
      </dl>
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <dt className="text-text-muted">Total value</dt>
          <dd className="min-w-0 text-right">
            <Preview
              title="Currency value"
              content={<CurrencyValueDetails currency={state.live.currency} />}
            >
              {({ ref, props }) => (
                <button
                  ref={ref}
                  {...props}
                  type="button"
                  aria-label="Show currency value breakdown"
                  className="min-h-11 min-w-11 rounded-btn px-2 text-right font-semibold tabular-nums wrap-anywhere hover:bg-surface-2"
                >
                  {totals.gold} gp
                </button>
              )}
            </Preview>
          </dd>
        </div>
        <div className="flex min-w-0 justify-between gap-3">
          <dt className="text-text-muted">Coins carried</dt>
          <dd className="text-right tabular-nums wrap-anywhere">{totals.coins.toString()}</dd>
        </div>
      </dl>
      {open && (
        <CurrencyDialog onClose={() => setOpen(false)} returnFocusTo={() => opener.current} />
      )}
    </section>
  );
}

function CurrencyDialog({
  onClose,
  returnFocusTo,
}: {
  onClose: () => void;
  returnFocusTo: () => HTMLElement | null;
}) {
  const { state } = useCharacter();
  const { run, warningOpen } = useCommand();
  const automation = useStore(characterStore, (store) => store.automation);
  const conflict = useStore(storageStatusStore, (status) => status.conflict);
  const [reviewed, setReviewed] = useState(() => ({ ...state.live.currency }));
  const [operation, setOperation] = useState<'add' | 'spend'>('add');
  const [unit, setUnit] = useState<CurrencyUnit>('gp');
  const [amount, setAmount] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const attempted = useRef(false);
  const amountInput = useRef<HTMLInputElement>(null);
  const prefix = useId();
  const amountValue = parseWholeCount(amount) ?? NaN;
  const validAmount = Number.isSafeInteger(amountValue) && amountValue > 0;
  const stale = state.live.currency[unit] !== reviewed[unit];
  const payload = { unit, operation, amount: amountValue, expected: reviewed[unit] };
  const preview = validAmount
    ? runCommand(adjustCurrency, state, payload, registry, {
        eventId: 'preview.currency',
        realTime: '1970-01-01T00:00:00.000Z',
        automation,
      })
    : null;
  const canApply = !stale && !conflict && !warningOpen && preview?.result === 'ok';
  const before = currencyTotals(state.live.currency);
  const after = preview?.result === 'ok' ? currencyTotals(preview.next.live.currency) : null;
  useEffect(() => {
    if (!warningOpen) attempted.current = false;
  }, [warningOpen]);
  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title="Adjust currency"
      description="Choose the actual denomination received or spent."
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        amountInput.current?.focus({ preventScroll: true });
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        returnFocusTo()?.focus();
      }}
    >
      <form
        noValidate
        aria-label="Adjust character currency"
        className="flex min-w-0 flex-col gap-4"
        onChange={() => errors.length > 0 && setErrors([])}
        onSubmit={(event) => {
          event.preventDefault();
          if (!canApply || attempted.current) return;
          attempted.current = true;
          const result = run(adjustCurrency, payload, returnFocusTo, onClose);
          if (result.result === 'blocked') {
            attempted.current = false;
            setErrors(result.reasons);
          }
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Operation" htmlFor={`${prefix}-operation`}>
            <select
              id={`${prefix}-operation`}
              value={operation}
              onChange={(event) => setOperation(event.target.value as 'add' | 'spend')}
              className={inputClass}
            >
              <option value="add">Add</option>
              <option value="spend">Spend</option>
            </select>
          </Field>
          <Field label="Coin" htmlFor={`${prefix}-coin`}>
            <select
              id={`${prefix}-coin`}
              value={unit}
              onChange={(event) => setUnit(event.target.value as CurrencyUnit)}
              className={inputClass}
            >
              {CURRENCY_UNITS.map((coin) => (
                <option key={coin} value={coin}>
                  {coin}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Amount" htmlFor={`${prefix}-amount`} hint="A positive whole number of coins.">
          <input
            ref={amountInput}
            id={`${prefix}-amount`}
            type="number"
            min={1}
            step={1}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={inputClass}
          />
        </Field>
        {amount !== '' && !validAmount && (
          <p role="alert" className="text-sm text-warn">
            Enter a positive safe whole number of coins.
          </p>
        )}
        {stale && (
          <div role="alert" className="flex flex-col gap-2 text-sm text-warn">
            <p>The recorded {unit} count changed. Refresh the preview before applying.</p>
            <button
              type="button"
              onClick={() => {
                setReviewed({ ...state.live.currency });
                setErrors([]);
                attempted.current = false;
              }}
              className={button}
            >
              Refresh preview
            </button>
          </div>
        )}
        {conflict && (
          <p role="alert" className="text-sm text-warn">
            Reload this window before editing; another window saved changes.
          </p>
        )}
        <section
          aria-label="Currency preview"
          className="rounded-card border border-border bg-surface p-3 text-sm"
        >
          <h3 className="mb-3 font-semibold">Currency preview</h3>
          {preview?.result === 'ok' && after ? (
            <dl className="flex flex-col gap-3">
              <div>
                <dt className="text-text-muted">Selected coins</dt>
                <dd className="tabular-nums wrap-anywhere">
                  {state.live.currency[unit]} {unit} → {preview.next.live.currency[unit]} {unit}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">Total value</dt>
                <dd className="tabular-nums wrap-anywhere">
                  {before.gold} gp → {after.gold} gp
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">Coin weight</dt>
                <dd className="tabular-nums wrap-anywhere">
                  {coinWeight(state.live.currency)} lb → {coinWeight(preview.next.live.currency)} lb
                </dd>
              </div>
            </dl>
          ) : preview ? (
            <ul role="alert" className="list-disc space-y-1 pl-4 text-warn">
              {preview.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : (
            <p className="text-text-muted">Enter an amount to review the change.</p>
          )}
        </section>
        {errors.length > 0 && (
          <p role="alert" className="text-sm text-warn">
            {errors.join(' · ')}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className={button}>
            Cancel
          </button>
          <button type="submit" disabled={!canApply} className={`${button} text-accent`}>
            Apply currency
          </button>
        </div>
      </form>
    </Sheet>
  );
}
