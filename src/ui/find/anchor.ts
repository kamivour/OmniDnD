/** An element id, or the aria-label of a section on the screen. */
function findAnchor(anchor: string): HTMLElement | null {
  return (
    document.getElementById(anchor) ??
    Array.from(document.querySelectorAll<HTMLElement>('[aria-label]')).find(
      (element) => element.getAttribute('aria-label') === anchor,
    ) ??
    null
  );
}

/**
 * Scroll to a section and flash it. The screen may still be loading after a route change, so
 * try for about a second. Returns a function that stops the search.
 */
export function scrollToAnchor(anchor: string): () => void {
  let tries = 0;
  let timer: number | undefined;
  const attempt = () => {
    const element = findAnchor(anchor);
    if (element) {
      const target = element.closest('section') ?? element;
      target.style.scrollMarginTop = 'calc(var(--character-header-height, 0px) + 8px)';
      target.scrollIntoView({ block: 'start', behavior: 'auto' });
      target.classList.remove('omni-find-highlight');
      void target.offsetWidth;
      target.classList.add('omni-find-highlight');
      window.setTimeout(() => target.classList.remove('omni-find-highlight'), 1800);
      return;
    }
    if (++tries < 10) timer = window.setTimeout(attempt, 100);
  };
  timer = window.setTimeout(attempt, 50);
  return () => window.clearTimeout(timer);
}
