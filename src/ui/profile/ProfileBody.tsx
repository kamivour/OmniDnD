import type { SyncConfig } from '../../sync/config';
import AccountSection from '../settings/AccountSection';
import { AvatarPicker } from './AvatarPicker';

/** Loaded only in builds with accounts, so guests never download the account code. */
export default function ProfileBody({ config }: { config: SyncConfig }) {
  return (
    <>
      <section
        aria-label="Profile picture"
        className="rounded-card border border-border bg-surface p-4"
      >
        <AvatarPicker />
      </section>
      <AccountSection config={config} />
    </>
  );
}
