import { useState, type KeyboardEvent } from 'react';
import { Delete, Minus, Plus, Shield } from 'lucide-react';
import { cx } from '../cx';
import { HpBar } from './HpBar';
import { Sheet } from './Sheet';

export type HpKind = 'damage' | 'heal' | 'temp';

const KINDS: Record<HpKind, { label: string; tone: string; solid: string }> = {
  damage: { label: 'Damage', tone: 'text-danger border-danger', solid: 'bg-danger' },
  heal: { label: 'Heal', tone: 'text-heal border-heal', solid: 'bg-heal' },
  temp: { label: 'Temp HP', tone: 'text-temp border-temp', solid: 'bg-temp' },
};

const ICON = { damage: Minus, heal: Plus, temp: Shield } as const;

interface HpState {
  current: number;
  max: number;
  temp: number;
}

/** Three big buttons (≥ 56 px on mobile). Each opens the number pad. */
export function HpButtons({ onApply }: { onApply: (kind: HpKind, amount: number) => void }) {
  const [kind, setKind] = useState<HpKind | null>(null);
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(KINDS) as HpKind[]).map((k) => {
          const Glyph = ICON[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cx(
                'hover-lift flex min-h-14 items-center justify-center gap-1.5 rounded-btn border bg-surface font-semibold',
                KINDS[k].tone,
              )}
            >
              <Glyph size={18} aria-hidden />
              {k === 'temp' ? 'Temp' : KINDS[k].label}
            </button>
          );
        })}
      </div>
      <NumberPadSheet
        kind={kind}
        onClose={() => setKind(null)}
        onApply={(k, n) => {
          setKind(null);
          onApply(k, n);
        }}
      />
    </>
  );
}

/** Desktop Combat HP panel: big number, bar, temp, quick damage, then the three buttons. */
export function HpPanel({
  hp,
  onApply,
}: {
  hp: HpState;
  onApply: (kind: HpKind, n: number) => void;
}) {
  return (
    <section aria-label="Hit points" className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-end justify-between gap-3">
        <p>
          <span className="text-hp font-semibold text-text">{hp.current}</span>
          <span className="text-lg text-text-muted"> / {hp.max}</span>
          <span className="sr-only"> hit points</span>
        </p>
        <p className={cx('pb-1 text-sm', hp.temp > 0 ? 'text-temp' : 'text-text-muted')}>
          Temp {hp.temp}
        </p>
      </div>
      <HpBar current={hp.current} max={hp.max} className="mt-2 mb-3 h-2" />
      <div className="mb-2 flex gap-2">
        {[1, 5, 10].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onApply('damage', n)}
            className="hover-lift min-h-11 flex-1 rounded-btn border border-border bg-surface-2 text-danger"
          >
            −{n}
          </button>
        ))}
      </div>
      <HpButtons onApply={onApply} />
    </section>
  );
}

function NumberPadSheet({
  kind,
  onClose,
  onApply,
}: {
  kind: HpKind | null;
  onClose: () => void;
  onApply: (kind: HpKind, amount: number) => void;
}) {
  return (
    <Sheet
      open={kind !== null}
      onOpenChange={(open) => !open && onClose()}
      title={kind ? KINDS[kind].label : ''}
      description="Enter the amount the DM or your dice give you."
    >
      {/* Remount per open so the pad starts empty. */}
      {kind && <NumberPad key={kind} kind={kind} onApply={(n) => onApply(kind, n)} />}
    </Sheet>
  );
}

function NumberPad({ kind, onApply }: { kind: HpKind; onApply: (amount: number) => void }) {
  const [digits, setDigits] = useState('');
  const amount = Number(digits || '0');
  const press = (d: string) => setDigits((s) => (s.length < 3 ? (s + d).replace(/^0+/, '') : s));
  const back = () => setDigits((s) => s.slice(0, -1));

  const onKeyDown = (e: KeyboardEvent) => {
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') back();
    else if (e.key === 'Enter' && amount > 0) onApply(amount);
    else return;
    e.preventDefault();
  };

  const key = 'min-h-14 rounded-btn border border-border bg-surface text-lg text-text hover:bg-bg';
  return (
    <div onKeyDown={onKeyDown}>
      <output
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
          type="button"
          disabled={amount === 0}
          onClick={() => onApply(amount)}
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
