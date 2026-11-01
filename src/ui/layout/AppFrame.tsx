import { Link, Outlet, useParams } from 'react-router';
import { useStore } from 'zustand';
import { characterStore } from '../../state/character-store';
import { CommandNotes, CommandProvider } from '../commands/CommandProvider';
import { PlaceholderScreen } from '../screens/PlaceholderScreen';
import { BottomNav } from './BottomNav';
import { HudBar } from './HudBar';
import { SideNav } from './SideNav';
import { DetailPanel, DetailProvider, DetailToggle } from './DetailPanel';

/** Character screens: sidebar (≥ 640 px) or bottom nav (< 640 px), sticky HUD, screen in the middle. */
export function AppFrame() {
  const { characterId } = useParams();
  const character = useStore(characterStore, (store) =>
    characterId && Object.hasOwn(store.characters, characterId)
      ? store.characters[characterId]
      : undefined,
  );
  if (!character)
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
    <DetailProvider key={characterId}>
      <CommandProvider characterId={character.build.id}>
        <div className="flex min-h-dvh">
          <SideNav />
          <div className="flex min-w-0 flex-1 flex-col">
            <HudBar />
            <DetailToggle />
            <div className="flex min-w-0 flex-1">
              <main
                id="character-workspace"
                tabIndex={-1}
                className="@container min-w-0 flex-1 pb-20 sm:pb-0"
              >
                <CommandNotes />
                <Outlet />
              </main>
              <DetailPanel />
            </div>
          </div>
        </div>
        <BottomNav />
      </CommandProvider>
    </DetailProvider>
  );
}
