import { useRef, useState, type KeyboardEvent } from 'react';
import { Delete, Minus, Plus, Shield } from 'lucide-react';
import { applyDamage, heal, healthDetails, setTempHp } from '../../engine/commands';
import { useCommand } from '../commands/command-context';
import { cx } from '../cx';
import { DeathSaveTracker } from '../health/DeathSaveTracker';
import { useCharacter } from '../hooks/useCharacter';
import { HpBar } from './HpBar';
import { Sheet } from './Sheet';
import { OverrideMarker } from './StatChip';

export type HpKind = 'damage' | 'heal' | 'temp';

const KINDS: Record<HpKind, { label: string; tone: string; solid: string }> = {
  damage: { label: 'Damage', tone: 'text-danger border-danger', solid: 'bg-danger' },
  heal: { label: 'Heal', tone: 'text-heal border-heal', solid: 'bg-heal' },
  temp: { label: 'Temp HP', tone: 'text-temp border-temp', solid: 'bg-temp' },
};

const ICON = { damage: Minus, heal: Plus, temp: Shield } as const;

/** Three big buttons (≥ 56 px on mobile). Each opens the number pad. */
export function HpButtons({ showSummary = true }: { showSummary?: boolean }) {
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const health = healthDetails({ live: state.live, sheet });
  const container = useRef<HTMLDivElement>(null);
  const lastOpener = useRef<HTMLElement | null>(null);
  const [selection, setSelection] = useState<{ kind: HpKind; opener: HTMLElement } | null>(null);
  return (
    <div ref={container} tabIndex={-1} className="flex min-w-0 flex-col gap-3">
      {showSummary && (
        <p className="text-sm text-text-muted">
          HP {health.hp} / {health.maxHp}
          <OverrideMarker override={sheet.maxHp.override} /> · Temp {health.tempHp}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(KINDS) as HpKind[]).map((k) => {
          const Glyph = ICON[k];
          return (
            <button
              key={k}
              type="button"
              disabled={
                k === 'damage' ? !health.canTakeDamage : k === 'heal' ? !health.canHeal : false
              }
              onClick={(event) => {
                event.currentTarget.focus();
                lastOpener.current = event.currentTarget;
                setSelection({ kind: k, opener: event.currentTarget });
              }}
              className={cx(
                'hover-lift flex min-h-14 items-center justify-center gap-1.5 rounded-btn border bg-surface font-semibold',
                KINDS[k].tone,
                'disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              <Glyph size={18} aria-hidden />
              {k === 'temp' ? 'Temp' : KINDS[k].label}
            </button>
          );
        })}
      </div>
      {health.tempHp > 0 && (
        <button
          type="button"
          className="min-h-11 rounded-btn border border-border px-3 text-temp"
          onClick={(event) => {
            event.currentTarget.focus();
            run(setTempHp, { amount: 0 }, container.current ?? undefined, () => {
              requestAnimationFrame(() => container.current?.focus());
            });
          }}
        >
          Clear temp HP
        </button>
      )}
      <DeathSaveTracker focusFallback={container} />
      <Sheet
        open={selection !== null}
        onOpenChange={(open) => !open && setSelection(null)}
        title={selection ? KINDS[selection.kind].label : ''}
        description="Damage: after applicable reductions, before temporary HP."
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const opener = lastOpener.current;
          (opener?.isConnected && opener.getClientRects().length && !opener.matches(':disabled')
            ? opener
            : container.current
          )?.focus();
        }}
      >
        {selection && (
          <HpAdjustmentBody
            key={selection.kind}
            kind={selection.kind}
            onApplied={() => setSelection(null)}
            returnFocusTo={selection.opener}
          />
        )}
      </Sheet>
    </div>
  );
}

/** Desktop Combat HP panel: big number, bar, temp, quick damage, then the three buttons. */
export function HpPanel() {
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const health = healthDetails({ live: state.live, sheet });
  const container = useRef<HTMLElement>(null);
  return (
    <section
      ref={container}
      tabIndex={-1}
      aria-label="Hit points"
      className="rounded-card border border-border bg-surface p-4"
    >
      <div className="flex items-end justify-between gap-3">
        <p>
          <span className="text-hp font-semibold text-text">{health.hp}</span>
          <span className="text-lg text-text-muted"> / {health.maxHp}</span>
          <span className="sr-only"> hit points</span>
        </p>
        <p className={cx('pb-1 text-sm', health.tempHp > 0 ? 'text-temp' : 'text-text-muted')}>
          Temp {health.tempHp}
        </p>
      </div>
      <HpBar current={health.hp} max={health.maxHp} className="mt-2 mb-3 h-2" />
      <div className="mb-2 flex gap-2">
        {[1, 5, 10].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`Take ${n} damage`}
            disabled={!health.canTakeDamage}
            onClick={(event) => {
              const opener = event.currentTarget;
              opener.focus();
              run(applyDamage, { amount: n }, container.current ?? undefined, () => {
                requestAnimationFrame(() => {
                  if (opener.matches(':disabled')) container.current?.focus();
                });
              });
            }}
            className="hover-lift min-h-11 flex-1 rounded-btn border border-border bg-surface-2 text-danger disabled:cursor-not-allowed disabled:opacity-40"
          >
            −{n}
          </button>
        ))}
      </div>
      {health.hp === 0 && (
        <p className="mb-3 text-xs text-text-muted">
          Quick damage is a normal hit. Open Damage to record a critical hit.
        </p>
      )}
      <HpButtons showSummary={false} />
    </section>
  );
}

/** The same saved HP adjustment flow serves the HUD and Combat. */
export function HpAdjustmentBody({
  kind,
  onApplied,
  returnFocusTo,
}: {
  kind: HpKind;
  onApplied: () => void;
  returnFocusTo?: HTMLElement;
}) {
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const container = useRef<HTMLDivElement>(null);
  const health = healthDetails({ live: state.live, sheet });
  const [critical, setCritical] = useState(false);
  const disabled =
    kind === 'damage' ? !health.canTakeDamage : kind === 'heal' ? !health.canHeal : false;
  const [error, setError] = useState<string | null>(null);
  return (
    <div ref={container} tabIndex={-1} className="flex min-w-0 flex-col gap-3">
      <p className="text-sm text-text-muted">
        HP {health.hp}/{health.maxHp}
        <OverrideMarker override={sheet.maxHp.override} /> · Temp {health.tempHp}
      </p>
      {kind === 'damage' && (
        <p className="text-xs text-text-muted">
          Enter damage after applicable reductions, before temporary HP.
        </p>
      )}
      {kind === 'damage' && health.hp === 0 && (
        <label className="flex min-h-11 items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={critical}
            disabled={disabled}
            onChange={(event) => setCritical(event.target.checked)}
            className="size-4 accent-(--omni-accent)"
          />
          Critical hit at 0 HP
        </label>
      )}
      {disabled && (
        <p role="note" className="text-sm text-warn">
          You are dead. This adjustment is unavailable.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}
      <HpNumberPad
        kind={kind}
        disabled={disabled}
        onApply={(amount) => {
          setError(null);
          const payload = { amount, ...(kind === 'damage' && health.hp === 0 ? { critical } : {}) };
          const result = run(
            kind === 'damage' ? applyDamage : kind === 'heal' ? heal : setTempHp,
            payload,
            returnFocusTo ?? container.current ?? undefined,
            onApplied,
          );
          if (result.result === 'blocked') setError(result.reasons.join(' · '));
        }}
      />
      {health.tempHp > 0 && (
        <button
          type="button"
          className="min-h-11 rounded-btn border border-border px-3 text-temp"
          onClick={(event) => {
            event.currentTarget.focus();
            run(
              setTempHp,
              { amount: 0 },
              returnFocusTo ?? container.current ?? undefined,
              onApplied,
            );
          }}
        >
          Clear temp HP
        </button>
      )}
    </div>
  );
}

export function HpNumberPad({
  kind,
  onApply,
  disabled = false,
}: {
  kind: HpKind;
  onApply: (amount: number) => void;
  disabled?: boolean;
}) {
  const [digits, setDigits] = useState('');
  const applyButton = useRef<HTMLButtonElement>(null);
  const amount = Number(digits || '0');
  const press = (d: string) => setDigits((s) => (s.length < 3 ? (s + d).replace(/^0+/, '') : s));
  const back = () => setDigits((s) => s.slice(0, -1));
  const submit = () => {
    if (disabled || amount <= 0) return;
    applyButton.current?.focus();
    onApply(amount);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') back();
    else if (e.key === 'Enter' && amount > 0) submit();
    else return;
    e.preventDefault();
  };

  const key = 'min-h-14 rounded-btn border border-border bg-surface text-lg text-text hover:bg-bg';
  return (
    <div onKeyDown={onKeyDown}>
      <output
        aria-label={`${KINDS[kind].label} amount`}
        aria-live="polite"
        className={cx(
          'mb-3 block rounded-btn border bg-bg px-3 py-2 text-right text-xl',
          KINDS[kind].tone,
        )}
      >
        {digits || '0'}
      </output>
      <div className="mb-3 flex gap-2">
        {[1, 5, 10].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setDigits(String(amount + n))}
            className="min-h-11 flex-1 rounded-btn border border-border text-text-muted hover:text-text"
          >
            +{n}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className={key} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button
          type="button"
          aria-label="Delete digit"
          className={cx(key, 'grid place-items-center')}
          onClick={back}
        >
          <Delete size={20} aria-hidden />
        </button>
        <button type="button" className={key} onClick={() => press('0')}>
          0
        </button>
        <button
          ref={applyButton}
          type="button"
          disabled={disabled || amount === 0}
          onClick={submit}
          className={cx(
            'min-h-14 rounded-btn font-semibold text-bg disabled:opacity-40',
            KINDS[kind].solid,
          )}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
