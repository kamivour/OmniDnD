import { lazy, Suspense } from 'react';
import { syncConfig } from '../../sync/config';

const ResetPasswordForm = syncConfig ? lazy(() => import('../settings/ResetPasswordForm')) : null;

/** Where the password reset email lands. Accounts must be configured for it to do anything. */
export function ResetPasswordScreen() {
  return (
    <section className="mx-auto flex min-w-0 max-w-md flex-col gap-4 text-sm">
      <h1 className="font-display text-xl">Reset password</h1>
      {ResetPasswordForm && syncConfig ? (
        <Suspense fallback={<p className="text-text-muted">Loading…</p>}>
          <ResetPasswordForm config={syncConfig} />
        </Suspense>
      ) : (
        <p className="text-text-muted">Accounts are not turned on in this copy of the app.</p>
      )}
    </section>
  );
}
