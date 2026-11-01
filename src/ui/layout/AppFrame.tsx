import { Link, Outlet, useParams } from 'react-router';
import { findCharacter } from '../fixtures/campaigns';
import { PlaceholderScreen } from '../screens/PlaceholderScreen';
import { BottomNav } from './BottomNav';
import { HudBar } from './HudBar';
import { SideNav } from './SideNav';

/** Character screens: sidebar (≥ 640 px) or bottom nav (< 640 px), sticky HUD, screen in the middle. */
export function AppFrame() {
  if (!findCharacter(useParams().characterId))
    return (
      <main>
        <PlaceholderScreen title="Character not found" />
        <p className="text-center">
          <Link to="/" className="text-accent">
            All campaigns
          </Link>
        </p>
      </main>
    );
  return (
    <>
      <div className="flex min-h-dvh">
        <SideNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <HudBar />
          <main className="min-w-0 flex-1 pb-20 sm:pb-0">
            <Outlet />
          </main>
        </div>
      </div>
      <BottomNav />
    </>
  );
}
