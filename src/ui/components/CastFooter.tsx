import { useState, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { cx } from '../cx';
import type { SpellView } from '../fixtures/the-fool';

interface Slot {
  level: number;
  max: number;
  used: number;
}

/** A feat or racial trait's casting without a slot. */
export interface FreeCasting {
  /** "1/long rest", "1/short rest" or "At will". */
  label: string;
  /** Castings left; Infinity at will. */
  left: number;
  /** Spell level of the free casting. */
  level: number;
}

/**
 * Mobile sheet footer: slot-level picker (lowest available first) + big Cast button.
 * The picked level is UI state only; casting goes through the engine (M4).
 */
export function CastFooter({
  spell,
  slots,
  onCast,
  allowRitual = false,
  upcastText,
  renderChoices,
  free,
}: {
  spell: SpellView;
  slots: readonly Slot[];
  onCast: (level: number, ritual?: boolean, free?: boolean) => void;
  allowRitual?: boolean;
  upcastText?: string;
  renderChoices?: (selection: { level: number; ritual: boolean; free: boolean }) => ReactNode;
  free?: FreeCasting;
}) {
  const options =
    spell.level === 0
      ? []
      : slots.filter((s) => s.level >= spell.level).sort((a, b) => a.level - b.level);
  const available = options.filter((s) => s.max - s.used > 0);
  const [requestedLevel, setRequestedLevel] = useState<number | 'free'>();
  const [requestedRitual, setRequestedRitual] = useState(false);
  const ritual = spell.level > 0 && allowRitual && requestedRitual;
  const freeReady = !ritual && spell.level > 0 && free !== undefined && free.left > 0;
  const slotPicked = available.find((s) => s.level === requestedLevel)?.level;
  const useFree = freeReady && slotPicked === undefined;
  const level = ritual
    ? spell.level
    : useFree
      ? free.level
      : (slotPicked ?? available[0]?.level ?? spell.level);
  const canCast = ritual || spell.level === 0 || useFree || available.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {allowRitual && spell.level > 0 && (
        <label className="flex min-h-11 items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={ritual}
            onChange={(event) => setRequestedRitual(event.target.checked)}
            className="size-4 accent-(--omni-accent)"
          />
          Cast as ritual (+10 minutes)
        </label>
      )}
      {ritual && <p className="text-xs text-text-muted">Ritual casting uses no spell slot.</p>}
      {!ritual && (options.length > 0 || (free && spell.level > 0)) && (
        <fieldset>
          <legend className="mb-1.5 text-xs text-text-muted">Slot level</legend>
          <div className="flex flex-wrap gap-2">
            {free && spell.level > 0 && (
              <button
                type="button"
                aria-pressed={useFree}
                disabled={free.left <= 0}
                onClick={() => setRequestedLevel('free')}
                className={cx(
                  'flex min-h-12 min-w-14 flex-1 flex-col items-center justify-center rounded-btn border disabled:opacity-40',
                  useFree ? 'border-magic text-text' : 'border-border text-text-muted',
                )}
              >
                <span className="font-semibold">Free</span>
                <span className="text-xs">{free.left > 0 ? free.label : 'Used'}</span>
              </button>
            )}
            {options.map((s) => {
              const left = s.max - s.used;
              return (
                <button
                  key={s.level}
                  type="button"
                  aria-pressed={!useFree && level === s.level}
                  disabled={left <= 0}
                  onClick={() => setRequestedLevel(s.level)}
                  className={cx(
                    'flex min-h-12 min-w-14 flex-1 flex-col items-center justify-center rounded-btn border disabled:opacity-40',
                    !useFree && level === s.level
                      ? 'border-magic text-text'
                      : 'border-border text-text-muted',
                  )}
                >
                  <span className="font-semibold">L{s.level}</span>
                  <span className="text-xs">{left} left</span>
                </button>
              );
            })}
          </div>
          {!useFree && level > spell.level && (
            <p className="mt-1.5 text-xs text-magic">
              Upcast to L{level}:{' '}
              {upcastText || "review the spell's higher-level effects in the full reference."}
            </p>
          )}
        </fieldset>
      )}
      {useFree && (
        <p className="text-xs text-text-muted">
          Free casting uses no spell slot{level > spell.level ? `; it is cast at L${level}` : ''}.
        </p>
      )}
      {!canCast && (
        <p className="text-xs text-text-muted">No available spell slots at this level or higher.</p>
      )}
      {renderChoices?.({ level, ritual, free: useFree })}
      <button
        type="button"
        disabled={!canCast}
        onClick={(event) => {
          event.currentTarget.focus();
          onCast(level, ritual, useFree);
        }}
        className="min-h-14 rounded-btn bg-accent text-base font-semibold text-bg disabled:opacity-40"
      >
        Cast {spell.name}
        {ritual ? ' (ritual)' : useFree ? ' (free)' : spell.level > 0 && ` (L${level})`}
      </button>
      <a
        href={spell.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-11 items-center gap-1 self-center text-xs text-accent"
      >
        Full spell reference <ExternalLink size={14} aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </div>
  );
}
