import { cx } from '../cx';

export interface Economy {
  action: boolean;
  bonus: boolean;
  reaction: boolean;
}

type Slot = keyof Economy;

const SLOTS: { key: Slot; label: string }[] = [
  { key: 'action', label: 'Action' },
  { key: 'bonus', label: 'Bonus' },
  { key: 'reaction', label: 'React' },
];

interface EconomyBarProps {
  /** true = still available this turn. */
  economy: Economy;
  movement: { left: number; max: number };
  onToggle: (slot: Slot) => void;
  onMove: (delta: number) => void;
}

/** Action / Bonus / Reaction chips + movement. Spent = dim empty ring + readable status text. */
export function EconomyBar({ economy, movement, onToggle, onMove }: EconomyBarProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        {SLOTS.map(({ key, label }) => {
          const available = economy[key];
          return (
            <button
              key={key}
              type="button"
              aria-pressed={!available}
              onClick={() => onToggle(key)}
              className={cx(
                'flex min-h-11 flex-col items-center justify-center gap-1 rounded-btn border py-2 font-semibold',
                available ? 'border-accent text-text' : 'border-border text-text-muted',
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cx(
                    'size-2.5 rounded-full border transition-opacity duration-(--omni-motion-dim)',
                    available ? 'border-accent bg-accent' : 'border-text-muted opacity-40',
                  )}
                />
                {label}
              </span>
              <span className="text-xs font-normal">{available ? 'available' : 'used'}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <p className="flex-1">
          <span className="text-text-muted">Move </span>
          <span className="font-semibold text-text">{movement.left}</span>
          <span className="text-text-muted"> / {movement.max} ft left</span>
        </p>
        {[-5, 5].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onMove(d)}
            aria-label={d < 0 ? 'Use 5 ft of movement' : 'Give back 5 ft of movement'}
            className="hover-lift min-h-11 min-w-12 rounded-btn border border-border bg-surface px-2 text-text"
          >
            {d < 0 ? '−5' : '+5'}
          </button>
        ))}
      </div>
    </div>
  );
}
