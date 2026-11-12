import { useEffect } from 'react';
import { useActiveTheme, useFxLevel } from '../hooks/useTheme';

/** Cards that catch the glass sheen. */
const SHEEN_TARGET = '.rounded-card';

/** Things a tap can press, for the water ripple. */
const RIPPLE_TARGET =
  'button, a[href], [role="button"], [role="tab"], [role="menuitem"], summary, label';

/** Longest ripple; the host is removed after this even if animationend never fires. */
const RIPPLE_MS = 700;

/**
 * Delegated pointer listeners for theme press effects (docs/PLAN.md M39), so no button needs to
 * know about themes.
 * - Sheen (glass themes, full level, mouse only): a soft light follows the pointer over cards.
 * - Ripple (water theme, lite and full): a short ring spreads from the tap point. It draws in its
 *   own fixed layer clipped to the pressed control, so the control's layout never changes.
 */
export function PressEffects() {
  const theme = useActiveTheme();
  const fx = useFxLevel();
  const sheen = theme.press === 'sheen' && fx === 'full';
  const ripple = theme.press === 'ripple' && fx !== 'off';

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

  useEffect(() => {
    if (!ripple) return;
    const hosts = new Set<HTMLElement>();
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = (event.target as Element | null)?.closest<HTMLElement>(RIPPLE_TARGET);
      if (!target || target.matches(':disabled, [aria-disabled="true"]')) return;
      const box = target.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const host = document.createElement('span');
      host.className = 'omni-ripple-host';
      host.setAttribute('aria-hidden', 'true');
      Object.assign(host.style, {
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
        borderRadius: getComputedStyle(target).borderRadius,
      });
      const ring = document.createElement('span');
      ring.className = 'omni-ripple';
      const size = 2 * Math.hypot(box.width, box.height);
      Object.assign(ring.style, {
        left: `${event.clientX - box.left}px`,
        top: `${event.clientY - box.top}px`,
        width: `${size}px`,
        height: `${size}px`,
      });
      host.append(ring);
      // Inside a modal sheet the ripple must join the sheet, or it would draw underneath it.
      (target.closest('dialog, [popover]') ?? document.body).append(host);
      hosts.add(host);
      const remove = () => {
        host.remove();
        hosts.delete(host);
      };
      ring.addEventListener('animationend', remove, { once: true });
      setTimeout(remove, RIPPLE_MS);
    };
    document.addEventListener('pointerdown', down, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', down);
      for (const host of hosts) host.remove();
      hosts.clear();
    };
  }, [ripple]);

  return null;
}
