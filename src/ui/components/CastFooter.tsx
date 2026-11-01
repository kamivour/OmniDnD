import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { cx } from '../cx';
import type { SpellView } from '../fixtures/the-fool';

interface Slot {
  level: number;
  max: number;
  used: number;
}

/**
 * Mobile sheet footer: slot-level picker (lowest available first) + big Cast button.
 * The picked level is UI state only; casting goes through the engine (M4).
 */
export function CastFooter({
  spell,
  slots,
  onCast,
}: {
  spell: SpellView;
  slots: readonly Slot[];
  onCast: (level: number) => void;
}) {
  const options = spell.level === 0 ? [] : slots.filter((s) => s.level >= spell.level);
  const firstOpen = options.find((s) => s.max - s.used > 0)?.level ?? spell.level;
  const [level, setLevel] = useState(firstOpen);

  return (
    <div className="flex flex-col gap-3">
      {options.length > 0 && (
        <fieldset>
          <legend className="mb-1.5 text-xs text-text-muted">Slot level</legend>
          <div className="flex gap-2">
            {options.map((s) => {
              const left = s.max - s.used;
              return (
                <button
                  key={s.level}
                  type="button"
                  aria-pressed={level === s.level}
                  disabled={left === 0}
                  onClick={() => setLevel(s.level)}
                  className={cx(
                    'flex min-h-12 flex-1 flex-col items-center justify-center rounded-btn border disabled:opacity-40',
                    level === s.level ? 'border-magic text-text' : 'border-border text-text-muted',
                  )}
                >
                  <span className="font-semibold">L{s.level}</span>
                  <span className="text-xs">{left} left</span>
                </button>
              );
            })}
          </div>
          {level > spell.level && (
            <p className="mt-1.5 text-xs text-magic">
              Upcast to L{level}: see the Upcast line above.
            </p>
          )}
        </fieldset>
      )}
      <button
        type="button"
        onClick={() => onCast(level)}
        className="min-h-14 rounded-btn bg-accent text-base font-semibold text-bg"
      >
        Cast {spell.name}
        {spell.level > 0 && ` (L${level})`}
      </button>
      <a
        href={spell.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-11 items-center gap-1 self-center text-xs text-accent"
      >
        D&amp;D Beyond <ExternalLink size={14} aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </div>
  );
}
