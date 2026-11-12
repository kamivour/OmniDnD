import { Check, Monitor } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ThemeChoice } from '../../state/device-settings';
import { THEME_GROUPS, THEMES, type ThemeId } from '../../theme/themes';
import { cx } from '../cx';

/** A small sample painted with the theme's own colours (each theme's CSS also matches data-theme). */
function Swatch({ id, compact = false }: { id: ThemeId; compact?: boolean }) {
  return (
    <span
      aria-hidden
      data-theme={id}
      className="flex min-w-0 flex-1 items-center justify-between gap-1 bg-bg bg-cover px-2 text-text"
      style={{ backgroundImage: 'var(--omni-bg-image)' }}
    >
      <span className="truncate font-display text-base text-accent">Omni</span>
      <span
        className={cx(
          'shrink-0 gap-1 rounded-btn border border-border bg-surface p-1',
          compact ? 'hidden' : 'flex',
        )}
      >
        <span className="size-2 rounded-full bg-magic" />
        <span className="size-2 rounded-full bg-danger" />
        <span className="size-2 rounded-full bg-heal" />
      </span>
    </span>
  );
}

function Card({
  value,
  checked,
  label,
  hint,
  preview,
  onChange,
}: {
  value: ThemeChoice;
  checked: boolean;
  label: ReactNode;
  hint: string;
  preview: ReactNode;
  onChange: (value: ThemeChoice) => void;
}) {
  return (
    <label
      className={cx(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-btn border bg-surface',
        'border-border transition-colors duration-(--omni-motion-hover) hover:border-text-muted',
        'has-checked:border-accent has-checked:bg-surface-2 has-focus-visible:outline-2 has-focus-visible:outline-accent',
      )}
    >
      <input
        type="radio"
        name="theme"
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        // Invisible but covering the card, so a tap anywhere picks it.
        className="absolute inset-0 z-10 cursor-pointer appearance-none opacity-0"
      />
      <span className="flex flex-1 items-start gap-1 p-2">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold text-text">{label}</span>
          <span className="text-xs text-text-muted">{hint}</span>
        </span>
        <Check aria-hidden className="hidden size-4 shrink-0 text-accent group-has-checked:block" />
      </span>
      <span className="flex h-11 border-t border-border">{preview}</span>
    </label>
  );
}

/** Theme choice as preview cards, grouped (docs/PLAN.md M39). */
export function ThemePicker({
  value,
  onChange,
}: {
  value: ThemeChoice;
  onChange: (value: ThemeChoice) => void;
}) {
  const grid = 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4';
  return (
    <fieldset id="settings-theme" className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-semibold text-text">Theme</legend>
      <div className={grid}>
        <Card
          value="system"
          checked={value === 'system'}
          label={
            <span className="flex items-center gap-1">
              System <Monitor aria-hidden className="size-3.5 text-text-muted" />
            </span>
          }
          hint="Dark, or Parchment when your device is light."
          preview={
            <>
              <Swatch id="dark" compact />
              <Swatch id="parchment" compact />
            </>
          }
          onChange={onChange}
        />
      </div>
      {THEME_GROUPS.map((group) => {
        const themes = THEMES.filter((theme) => theme.group === group.id);
        if (themes.length === 0) return null;
        return (
          <div key={group.id} className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-text-muted">{group.label}</p>
            <div className={grid}>
              {themes.map((theme) => (
                <Card
                  key={theme.id}
                  value={theme.id}
                  checked={value === theme.id}
                  label={theme.name}
                  hint={theme.hint}
                  preview={<Swatch id={theme.id} />}
                  onChange={onChange}
                />
              ))}
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
