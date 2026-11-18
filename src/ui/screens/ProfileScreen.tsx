import { lazy, Suspense } from 'react';
import { syncConfig } from '../../sync/config';

const ProfileBody = syncConfig ? lazy(() => import('../profile/ProfileBody')) : null;

/** Account picture, display name, sign-in and sync. Settings links here. */
export function ProfileScreen() {
  return (
    <section className="mx-auto flex min-w-0 max-w-2xl flex-col gap-4">
      <h1 className="font-display text-xl">Profile</h1>
      {ProfileBody && syncConfig ? (
        <Suspense fallback={<p className="text-sm text-text-muted">Loading…</p>}>
          <ProfileBody config={syncConfig} />
        </Suspense>
      ) : (
        <p className="text-sm text-text-muted">
          Accounts are not turned on in this copy of the app. Everything stays on this device.
        </p>
      )}
    </section>
  );
}
