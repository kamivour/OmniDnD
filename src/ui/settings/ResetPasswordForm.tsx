import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { SyncConfig } from '../../sync/config';
import type { SyncProvider } from '../../sync/provider';
import { Field, inputClass } from '../components/fields';

const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-btn border border-border px-3 text-sm hover:bg-surface-2 disabled:opacity-40';

type Phase = 'loading' | 'ready' | 'invalid' | 'done';

/** Sets a new password after the reset email link signed the person in. */
export default function ResetPasswordForm({ config }: { config: SyncConfig }) {
  const [provider, setProvider] = useState<SyncProvider | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const { createSupabaseProvider } = await import('../../sync/supabase-provider');
        const created = await createSupabaseProvider(config);
        // The library reads the link's tokens from the address on creation; give it a moment.
        let account = await created.currentAccount();
        for (let wait = 0; !account && wait < 10; wait += 1) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          account = await created.currentAccount();
        }
        if (!live) return;
        setProvider(created);
        setPhase(account ? 'ready' : 'invalid');
      } catch {
        if (live) setPhase('invalid');
      }
    })();
    return () => {
      live = false;
    };
  }, [config]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!provider) return;
    if (password !== again) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    provider
      .updatePassword(password)
      .then(() => setPhase('done'))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setBusy(false));
  };

  if (phase === 'loading') return <p className="text-text-muted">Checking your link…</p>;
  if (phase === 'invalid')
    return (
      <>
        <p role="alert" className="text-danger">
          This reset link is not valid any more. Ask for a new one in Settings.
        </p>
        <Link to="/settings" className="inline-flex min-h-11 items-center text-accent">
          Go to Settings
        </Link>
      </>
    );
  if (phase === 'done')
    return (
      <>
        <p role="status">Password changed. You are signed in.</p>
        <Link to="/settings" className="inline-flex min-h-11 items-center text-accent">
          Go to Settings
        </Link>
      </>
    );
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="New password" htmlFor="reset-password-new">
        <input
          id="reset-password-new"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Repeat new password" htmlFor="reset-password-again">
        <input
          id="reset-password-again"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={again}
          onChange={(event) => setAgain(event.target.value)}
          className={inputClass}
        />
      </Field>
      <button type="submit" disabled={busy} className={`${button} self-start`}>
        Set new password
      </button>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
