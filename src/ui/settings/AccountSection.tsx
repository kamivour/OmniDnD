import { useEffect, useState, type FormEvent } from 'react';
import { CloudUpload, LogIn, LogOut, RefreshCw, UserPlus } from 'lucide-react';
import type { SyncConfig } from '../../sync/config';
import type { ConflictChoice, SyncConflict } from '../../sync/engine';
import type { Account, SignInResult, SyncProvider } from '../../sync/provider';
import type { SyncReport } from '../../sync/runner';
import { Field, inputClass } from '../components/fields';

const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-btn border border-border px-3 text-sm hover:bg-surface-2 disabled:opacity-40';

type Status = 'loading' | 'unavailable' | 'signed-out' | 'signed-in';

function message(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return /fetch|network/i.test(text)
    ? 'Could not reach the account server. Check your connection and try again.'
    : text;
}

function reportText(report: SyncReport): string {
  const parts = [`Uploaded ${report.uploaded}, downloaded ${report.downloaded}.`];
  if (report.skipped > 0)
    parts.push(
      `${report.skipped} cloud item(s) came from a different app version and were left alone.`,
    );
  if (report.deferred) parts.push('Something changed during the sync. Sync again to finish.');
  return parts.join(' ');
}

/**
 * Optional account sign-in and sync. Only rendered when this build has a sync provider;
 * the provider library loads on first render so guests never download it.
 */
export default function AccountSection({ config }: { config: SyncConfig }) {
  const [provider, setProvider] = useState<SyncProvider | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [account, setAccount] = useState<Account | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [choices, setChoices] = useState<Map<string, ConflictChoice>>(new Map());

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const { createSupabaseProvider } = await import('../../sync/supabase-provider');
        const created = await createSupabaseProvider(config);
        const current = await created.currentAccount();
        if (!live) return;
        setProvider(created);
        setAccount(current);
        setStatus(current ? 'signed-in' : 'signed-out');
      } catch (cause) {
        if (!live) return;
        setStatus('unavailable');
        setError(`Accounts are unavailable right now: ${message(cause)}`);
      }
    })();
    return () => {
      live = false;
    };
  }, [config]);

  // `undefined`: not loaded yet. `null`: signed in but no name chosen.
  const [savedName, setSavedNameState] = useState<string | null | undefined>(undefined);
  const [nameDraft, setNameDraft] = useState('');
  const setSavedName = (name: string | null) => {
    setSavedNameState(name);
    setNameDraft(name ?? '');
  };

  useEffect(() => {
    if (status !== 'signed-in' || !provider) return;
    let live = true;
    provider
      .getDisplayName()
      .then((name) => {
        if (live) setSavedName(name);
      })
      .catch(() => {
        if (live) setSavedName(null);
      });
    return () => {
      live = false;
    };
  }, [status, provider]);

  const sync = async (active: SyncProvider, settled = new Map<string, ConflictChoice>()) => {
    const { runSync } = await import('../../sync/runner');
    const report = await runSync(active, settled);
    setConflicts(report.conflicts);
    setChoices(new Map());
    setNotice(
      report.conflicts.length > 0
        ? `${reportText(report)} Some items changed both here and in the cloud. Choose which to keep.`
        : reportText(report),
    );
  };

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (cause) {
      setError(`Sync failed: ${message(cause)}`);
    } finally {
      setBusy(false);
    }
  };

  const enter = (mode: 'sign-in' | 'sign-up') => (event?: FormEvent) => {
    event?.preventDefault();
    if (!provider) return;
    void act(async () => {
      const result: SignInResult =
        mode === 'sign-in'
          ? await provider.signIn(email.trim(), password)
          : await provider.signUp(email.trim(), password);
      if (result.result === 'error') {
        setError(message(result.message));
        return;
      }
      if (result.result === 'confirm-email') {
        setNotice('Check your email to confirm the account, then sign in.');
        return;
      }
      setPassword('');
      setAccount(result.account);
      setStatus('signed-in');
      await sync(provider);
    });
  };

  const signOut = () => {
    if (!provider) return;
    void act(async () => {
      await provider.signOut();
      setAccount(null);
      setConflicts([]);
      setStatus('signed-out');
      setNotice('Signed out. Campaigns and characters stay on this device.');
    });
  };

  const choose = (id: string, choice: ConflictChoice) =>
    setChoices((previous) => new Map(previous).set(id, choice));

  return (
    <section
      aria-labelledby="settings-account"
      aria-busy={busy || status === 'loading'}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <h2 id="settings-account" className="text-base font-semibold">
        Account
      </h2>
      <p className="text-sm text-text-muted">
        Optional. Sign in to keep campaigns and characters in step across devices. Without an
        account, everything stays on this device.
      </p>
      {status === 'loading' && <p className="text-sm text-text-muted">Checking sign-in…</p>}
      {status === 'signed-out' && (
        <form onSubmit={enter('sign-in')} className="flex flex-col gap-3">
          <Field label="Email" htmlFor="account-email">
            <input
              id="account-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Password" htmlFor="account-password">
            <input
              id="account-password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className={button}>
              <LogIn size={16} aria-hidden />
              Sign in
            </button>
            <button
              type="button"
              disabled={busy || !email.trim() || password.length < 8}
              onClick={() => enter('sign-up')()}
              className={button}
            >
              <UserPlus size={16} aria-hidden />
              Create account
            </button>
          </div>
        </form>
      )}
      {status === 'signed-in' && account && provider && (
        <>
          <p className="text-sm">
            Signed in as <span className="font-semibold break-all">{account.email}</span>
          </p>
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void act(async () => {
                await provider.setDisplayName(nameDraft);
                setSavedName(nameDraft.trim());
                setNotice('Display name saved.');
              });
            }}
          >
            <Field
              label="Display name"
              htmlFor="account-display-name"
              hint={
                savedName === null
                  ? 'Choose a name. Your party will see it later; your email is never shown.'
                  : 'Your party will see this name, never your email.'
              }
            >
              <input
                id="account-display-name"
                type="text"
                maxLength={40}
                autoComplete="nickname"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                className={inputClass}
              />
            </Field>
            <button
              type="submit"
              disabled={busy || !nameDraft.trim() || nameDraft.trim() === savedName}
              className={`${button} self-start`}
            >
              Save name
            </button>
          </form>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(() => sync(provider))}
              className={button}
            >
              <RefreshCw size={16} aria-hidden />
              Sync now
            </button>
            <button type="button" disabled={busy} onClick={signOut} className={button}>
              <LogOut size={16} aria-hidden />
              Sign out
            </button>
          </div>
          {conflicts.length > 0 && (
            <div className="flex flex-col gap-3">
              {conflicts.map((conflict) => (
                <fieldset
                  key={conflict.id}
                  className="flex flex-col gap-2 rounded-card border border-border p-3"
                >
                  <legend className="px-1 text-sm font-semibold">
                    {conflict.name}{' '}
                    <span className="font-normal text-text-muted">
                      ({conflict.kind === 'campaign' ? 'campaign' : 'character'})
                    </span>
                  </legend>
                  {(
                    [
                      ['this-device', 'Keep this device’s version'],
                      [
                        'cloud',
                        conflict.remote.deleted
                          ? 'Keep the cloud’s deletion'
                          : 'Keep the cloud version',
                      ],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value} className="flex min-h-11 items-center gap-3 text-sm">
                      <input
                        type="radio"
                        name={`conflict-${conflict.id}`}
                        checked={choices.get(conflict.id) === value}
                        onChange={() => choose(conflict.id, value)}
                        className="size-4 accent-(--omni-accent)"
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
              ))}
              <button
                type="button"
                disabled={busy || conflicts.some((conflict) => !choices.has(conflict.id))}
                onClick={() => void act(() => sync(provider, choices))}
                className={`${button} self-start`}
              >
                <CloudUpload size={16} aria-hidden />
                Apply choices
              </button>
            </div>
          )}
        </>
      )}
      {notice && (
        <p role="status" className="text-sm text-text-muted">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
