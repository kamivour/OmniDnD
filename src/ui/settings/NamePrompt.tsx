import { useState, type FormEvent } from 'react';
import { Dialog } from 'radix-ui';
import { LogOut } from 'lucide-react';
import { nameProblem } from '../../sync/display-name';
import { saveDisplayName, setAccount, useAccountSession } from '../../sync/service';
import { nameReady, useNameCheck } from './name-check';
import { NameField } from './NameField';

const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-btn border border-border px-3 text-sm hover:bg-surface-2 disabled:opacity-40';

/**
 * Required for signed-in accounts that have no display name, or one from before names had
 * to be 3 to 24 characters. Only saving a name or signing out closes it.
 */
export function NamePrompt() {
  const { status, provider, displayName } = useAccountSession();
  const needed =
    status === 'signed-in' &&
    (displayName === null || (typeof displayName === 'string' && !!nameProblem(displayName)));
  const [draft, setDraft] = useState('');
  const check = useNameCheck(needed ? provider : null, draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await saveDisplayName(draft);
      setDraft('');
    });
  };
  const signOut = () =>
    void run(async () => {
      await provider?.signOut();
      setAccount(null);
    });

  return (
    <Dialog.Root open={needed}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-bg/70" />
        <Dialog.Content
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-card border-t border-border bg-surface-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-pop sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-96 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-card sm:border"
        >
          <Dialog.Title className="text-base font-semibold text-text">
            Choose your display name
          </Dialog.Title>
          <Dialog.Description className="mb-3 text-sm text-text-muted">
            {displayName
              ? `Names now need 3 to 24 characters, and "${displayName}" does not fit. Pick a new one for your party to see.`
              : 'Your party sees this name next to your characters. Each account needs its own.'}
          </Dialog.Description>
          <form className="flex flex-col gap-3" onSubmit={save}>
            <NameField id="name-prompt" value={draft} onChange={setDraft} check={check} />
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy || !nameReady(check)} className={button}>
                Save name
              </button>
              <button type="button" disabled={busy} onClick={signOut} className={button}>
                <LogOut size={16} aria-hidden />
                Sign out
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
