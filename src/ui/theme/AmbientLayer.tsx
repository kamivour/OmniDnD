import { useCallback, useState, type CSSProperties } from 'react';
import type { ThemeId } from '../../theme/themes';
import { useActiveTheme, useFxLevel } from '../hooks/useTheme';
import { SHADERS } from './shaders';
import { ShaderLayer } from './ShaderLayer';

/** Enough pieces for a varied field; each theme's CSS spreads them with --i. */
const PIECES = 14;

/**
 * The theme's moving background, only at the full effect level. Themes with a GPU shader draw
 * it on a canvas; if WebGL is missing or lost, the CSS pieces take over. At lite and off the
 * theme's still --omni-bg-image shows instead.
 */
export function AmbientLayer() {
  const theme = useActiveTheme();
  const fx = useFxLevel();
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);
  if (fx !== 'full') return null;
  const shader = SHADERS[theme.id as ThemeId];
  if (shader && !failed) return <ShaderLayer key={theme.id} spec={shader} onFail={fail} />;
  if (!theme.ambient) return null;
  return (
    <div aria-hidden className="omni-ambient" data-ambient={theme.ambient}>
      {Array.from({ length: PIECES }, (_, i) => (
        <span key={i} style={{ '--i': i } as CSSProperties} />
      ))}
    </div>
  );
}
