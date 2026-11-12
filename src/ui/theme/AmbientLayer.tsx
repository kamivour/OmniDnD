import type { CSSProperties } from 'react';
import { useActiveTheme, useFxLevel } from '../hooks/useTheme';

/** Enough pieces for a varied field; each theme's CSS spreads them with --i. */
const PIECES = 14;

/**
 * One fixed, see-through layer behind the app for the theme's moving background. Only at the
 * full effect level; at lite and off the theme's still --omni-bg-image shows instead.
 */
export function AmbientLayer() {
  const theme = useActiveTheme();
  const fx = useFxLevel();
  if (fx !== 'full' || !theme.ambient) return null;
  return (
    <div aria-hidden className="omni-ambient" data-ambient={theme.ambient}>
      {Array.from({ length: PIECES }, (_, i) => (
        <span key={i} style={{ '--i': i } as CSSProperties} />
      ))}
    </div>
  );
}
