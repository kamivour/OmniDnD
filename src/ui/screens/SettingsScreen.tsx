import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useStore } from 'zustand';
import { Download, Undo2, Upload } from 'lucide-react';
import { updatePreferences } from '../../engine/commands/preferences';
import type { Preferences } from '../../engine/schema';
import { characterStore } from '../../state/character-store';
import { deviceStore, type ThemeChoice } from '../../state/device-settings';
import { useManagement } from '../commands/useManagement';
import { useCharacterTransfer } from '../commands/useCharacterTransfer';
import { ChoiceGroup, Field, inputClass } from '../components/fields';
import { syncConfig } from '../../sync/config';
import { BackupsSection } from '../settings/BackupsSection';
import { ResetCharacterControl } from '../settings/ResetCharacterControl';
import { cx } from '../cx';

// Replaced at build time: guest builds (no provider configured) drop the account code entirely.
const AccountSection = import.meta.env.VITE_SUPABASE_URL
  ? lazy(() => import('../settings/AccountSection'))
  : null;

const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-btn border border-border px-3 text-sm hover:bg-surface-2 disabled:opacity-40';

/** Device preferences and the same validated character transfers offered by the hub. */
export function SettingsScreen() {
  const { characterId } = useParams();
  const { automation, reducedMotion, characters, managementEvents } = useStore(characterStore);
  const diceRoller = useStore(deviceStore, (state) => state.diceRoller);
  const theme = useStore(deviceStore, (state) => state.theme);
  const management = useManagement();
  const { pending, run, undo, confirmation } = management;
  const { openImport, exportCharacter, importControls } = useCharacterTransfer(management);
  const [selectedId, setSelectedId] = useState('');
  const preferenceFocus = useRef<HTMLInputElement | null>(null);
  const exportId =
    characterId ??
    (Object.hasOwn(characters, selectedId) ? selectedId : Object.keys(characters)[0]);
  const last = managementEvents.findLast((event) => event.command !== 'undo' && !event.undoneBy);

  const savePreferences = (preferences: Preferences) => {
    const focused = document.activeElement;
    const result = run(updatePreferences, preferences);
    if (result.result === 'ok' && focused instanceof HTMLInputElement)
      preferenceFocus.current = focused;
  };
  useEffect(() => {
    if (pending) return;
    const focused = preferenceFocus.current;
    preferenceFocus.current = null;
    // Native disabling can blur the input; preserve a later deliberate focus move.
    if (document.activeElement === document.body && focused?.isConnected) focused.focus();
  }, [pending]);

  return (
    <section
      className={cx(
        'mx-auto flex min-w-0 max-w-3xl flex-col gap-6',
        characterId && 'px-4 py-4 lg:px-6',
      )}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-xl">Settings</h1>
        {!characterId && (
          <button
            type="button"
            disabled={!last || pending}
            onClick={() => undo()}
            title={last?.text}
            className={`${button} ml-auto`}
          >
            <Undo2 size={16} aria-hidden />
            Undo management
          </button>
        )}
      </header>
      <p className="text-sm text-text-muted">
        Preferences apply to every character on this device and save automatically.
      </p>
      {pending && (
        <p
          id="settings-saving"
          role="status"
          aria-label="Preference save status"
          className="text-sm text-text-muted"
        >
          Saving changes. Preferences will be available when the save finishes.
        </p>
      )}
      <fieldset
        disabled={pending}
        aria-busy={pending}
        aria-label="Preferences"
        aria-describedby={pending ? 'settings-saving' : undefined}
        className="flex flex-col gap-6 disabled:opacity-60"
      >
        <ChoiceGroup
          legend="Automation"
          name="automation"
          value={automation}
          options={[
            {
              value: 'assisted',
              label: 'Assisted',
              hint: 'Check game actions and warn before rule conflicts.',
            },
            {
              value: 'manual',
              label: 'Manual',
              hint: 'Track game actions without rule warnings. Invalid input stays blocked.',
            },
          ]}
          onChange={(value) => savePreferences({ automation: value, reducedMotion })}
        />
        <section aria-labelledby="settings-motion" className="flex flex-col gap-3">
          <h2 id="settings-motion" className="text-base font-semibold">
            Motion
          </h2>
          <label className="flex min-h-11 items-center gap-3 rounded-card border border-border bg-surface p-3">
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(event) =>
                savePreferences({ automation, reducedMotion: event.target.checked })
              }
              className="size-4 accent-(--omni-accent)"
            />
            Always reduce motion
          </label>
          <p className="text-sm text-text-muted">
            Your system’s reduced motion preference is respected automatically, even when this
            switch is off.
          </p>
        </section>
      </fieldset>
      <ChoiceGroup<ThemeChoice>
        legend="Theme"
        name="theme"
        value={theme}
        options={[
          {
            value: 'system',
            label: 'System',
            hint: 'Dark, or Parchment when your device is light.',
          },
          { value: 'dark', label: 'Dark', hint: 'Deep blue with gold.' },
          { value: 'parchment', label: 'Parchment', hint: 'Warm light paper for bright rooms.' },
        ]}
        onChange={(value) => deviceStore.getState().setTheme(value)}
      />
      <section aria-labelledby="settings-dice" className="flex flex-col gap-3">
        <h2 id="settings-dice" className="text-base font-semibold">
          Dice roller
        </h2>
        <label className="flex min-h-11 items-center gap-3 rounded-card border border-border bg-surface p-3">
          <input
            type="checkbox"
            checked={diceRoller}
            onChange={(event) => deviceStore.getState().setDiceRoller(event.target.checked)}
            className="size-4 accent-(--omni-accent)"
          />
          Show dice roller
        </label>
        <p className="text-sm text-text-muted">
          Adds Roll buttons and a dice tray. Results are only shown to you; nothing is applied to
          your character until you enter it. Stored on this device only.
        </p>
      </section>
      <BackupsSection />
      {AccountSection && syncConfig && (
        <Suspense fallback={null}>
          <AccountSection config={syncConfig} />
        </Suspense>
      )}
      <section
        aria-labelledby="settings-transfer"
        className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
      >
        <h2 id="settings-transfer" className="text-base font-semibold">
          Character JSON
        </h2>
        <p className="text-sm text-text-muted">
          Export one character’s choices, current resources, campaign rules, and game-action
          history. Bookmarks and app preferences stay on this device.
        </p>
        {characterId ? (
          <p className="font-semibold">{characters[characterId]?.build.name}</p>
        ) : Object.keys(characters).length > 0 ? (
          <Field label="Character" htmlFor="settings-character">
            <select
              id="settings-character"
              value={exportId}
              onChange={(event) => setSelectedId(event.target.value)}
              className={inputClass}
            >
              {Object.values(characters).map(({ build }) => (
                <option key={build.id} value={build.id}>
                  {build.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <p className="text-sm text-text-muted">
            No characters to export. Create one from All campaigns or import JSON.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!exportId || pending}
            onClick={() => exportId && exportCharacter(exportId)}
            className={button}
          >
            <Download size={16} aria-hidden />
            Export JSON
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={(event) => openImport(event.currentTarget)}
            className={button}
          >
            <Upload size={16} aria-hidden />
            Import JSON
          </button>
        </div>
        <p className="text-sm text-text-muted">
          Import previews before saving and keeps existing characters and campaign rules.
        </p>
      </section>
      {characterId ? (
        <ResetCharacterControl />
      ) : exportId ? (
        <section
          aria-labelledby="settings-reset"
          className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
        >
          <h2 id="settings-reset" className="text-base font-semibold">
            Reset character
          </h2>
          <p className="text-sm text-text-muted">
            Review and reset current resources from the selected character’s Settings.
          </p>
          <Link
            to={`/characters/${encodeURIComponent(exportId)}/settings`}
            className={`${button} self-start text-danger`}
          >
            Review reset for {characters[exportId]?.build.name}
          </Link>
        </section>
      ) : null}
      <Link to="/" className="inline-flex min-h-11 items-center text-sm text-accent">
        All campaigns
      </Link>
      {importControls}
      {confirmation}
    </section>
  );
}
