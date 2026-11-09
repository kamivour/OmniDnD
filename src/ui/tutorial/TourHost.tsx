import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react';
import { useStore } from 'zustand';
import { POPOVER_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { moveStep } from './model';
import { CHAPTERS } from './steps';
import { tour, tourStore } from './store';

const SPOT_PAD = 6;

/** The first element with this `data-tour` id that is actually on screen (phone and desktop differ). */
function findTarget(id: string | undefined): HTMLElement | null {
  if (!id) return null;
  const matches = document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(id)}"]`);
  return [...matches].find((node) => node.getClientRects().length > 0) ?? null;
}

const button =
  'inline-flex min-h-11 items-center justify-center rounded-btn border border-border px-3 text-sm hover:bg-surface disabled:opacity-40';

/** Spotlight and card for the running tour. Renders nothing when no tour is active. */
export function TourHost() {
  const active = useStore(tourStore, (state) => state.active);
  const chapter = active && CHAPTERS.find((entry) => entry.id === active.chapter);
  const step = active && chapter ? chapter.steps[active.index] : undefined;
  if (!active || !chapter || !step) return null;
  return (
    <TourCard
      key={`${chapter.id}-${step.id}`}
      title={step.title}
      body={step.body}
      target={step.target}
      index={active.index}
      count={chapter.steps.length}
    />
  );
}

interface CardProps {
  title: string;
  body: string;
  target: string | undefined;
  index: number;
  count: number;
}

function TourCard({ title, body, target, index, count }: CardProps) {
  const docked = !useMediaQuery(POPOVER_QUERY);
  // The card remounts for each step, so the target is looked up once per card.
  const [element] = useState(() => findTarget(target));
  const [rect, setRect] = useState<DOMRect | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const last = index === count - 1;

  useLayoutEffect(() => {
    element?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, [element]);

  useEffect(() => {
    if (!element) return;
    const measure = () => setRect(element.getBoundingClientRect());
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [element]);

  const { refs, floatingStyles } = useFloating({
    placement: 'bottom',
    elements: { reference: element },
    middleware: [offset(SPOT_PAD + 10), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => nextRef.current?.focus(), [index]);

  const go = (delta: 1 | -1) => {
    const next = moveStep(index, delta, count);
    if (next === 'end') tour.close();
    else tour.goTo(next);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') tour.close();
    else if (event.key === 'ArrowRight') go(1);
    else if (event.key === 'ArrowLeft') go(-1);
    else return;
    event.preventDefault();
  };

  const placed = element !== null && !docked;
  const style = placed
    ? floatingStyles
    : docked
      ? undefined
      : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div className="print:hidden" data-testid="tour">
      {rect && element ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[60] rounded-card"
          style={{
            top: rect.top - SPOT_PAD,
            left: rect.left - SPOT_PAD,
            width: rect.width + SPOT_PAD * 2,
            height: rect.height + SPOT_PAD * 2,
            boxShadow: '0 0 0 9999px color-mix(in srgb, var(--omni-bg) 75%, transparent)',
            outline: '2px solid var(--omni-accent)',
          }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 z-[60] bg-bg/75" />
      )}
      <div aria-hidden className="fixed inset-0 z-[60]" />
      <div
        ref={placed ? refs.setFloating : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        onKeyDown={onKeyDown}
        style={style}
        className={
          docked
            ? 'fixed inset-x-0 bottom-0 z-[70] rounded-t-card border-t border-border bg-surface-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-pop'
            : 'fixed z-[70] w-80 max-w-[calc(100vw-16px)] rounded-card border border-border bg-surface-2 p-4 shadow-pop'
        }
      >
        <p className="text-xs text-text-muted">
          {index + 1} of {count}
        </p>
        <h2 id="tour-title" className="text-base font-semibold">
          {title}
        </h2>
        <p id="tour-body" className="mt-1 text-sm text-text-muted">
          {body}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => go(-1)} disabled={index === 0} className={button}>
            Back
          </button>
          <button
            ref={nextRef}
            type="button"
            onClick={() => go(1)}
            className={`${button} bg-accent text-bg hover:bg-accent`}
          >
            {last ? 'Done' : 'Next'}
          </button>
          <button
            type="button"
            onClick={() => tour.close()}
            className={`${button} ml-auto border-transparent text-text-muted`}
          >
            Skip tutorial
          </button>
        </div>
      </div>
    </div>
  );
}
