import { useEffect } from 'react';
import { useActiveTheme, useFxLevel } from '../hooks/useTheme';

/** Cards that catch the glass sheen. */
const SHEEN_TARGET = '.rounded-card';

/**
 * One delegated pointer listener for theme press effects (docs/PLAN.md M39). Glass themes get a
 * soft light that follows the mouse over cards, at the full level only. It sets two CSS
 * variables; nothing animates.
 */
export function PressEffects() {
  const theme = useActiveTheme();
  const fx = useFxLevel();
  const sheen = theme.press === 'sheen' && fx === 'full';

  useEffect(() => {
    if (!sheen) return;
    let current: HTMLElement | null = null;
    let frame = 0;
    let last: PointerEvent | null = null;
    const clear = () => {
      if (!current) return;
      delete current.dataset.sheen;
      current.style.removeProperty('--sheen-x');
      current.style.removeProperty('--sheen-y');
      current = null;
    };
    const paint = () => {
      frame = 0;
      if (!last) return;
      const target = (last.target as Element | null)?.closest<HTMLElement>(SHEEN_TARGET) ?? null;
      if (target !== current) clear();
      if (!target) return;
      const box = target.getBoundingClientRect();
      target.style.setProperty('--sheen-x', `${last.clientX - box.left}px`);
      target.style.setProperty('--sheen-y', `${last.clientY - box.top}px`);
      target.dataset.sheen = '';
      current = target;
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      last = event;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', clear);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', clear);
      cancelAnimationFrame(frame);
      clear();
    };
  }, [sheen]);

  return null;
}
