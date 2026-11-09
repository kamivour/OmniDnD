import { Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router';
import { useStore } from 'zustand';
import { characterStore } from '../../state/character-store';
import { CommandNotes, CommandProvider } from '../commands/CommandProvider';
import { PlaceholderScreen } from '../screens/PlaceholderScreen';
import { ConcentrationSaveBanner } from '../health/ConcentrationSaveBanner';
import { RestProvider } from '../rest/RestProvider';
import { BottomNav } from './BottomNav';
import { HudBar } from './HudBar';
import { SideNav } from './SideNav';
import { DetailPanel, DetailProvider } from './DetailPanel';
import { CharacterToolbar } from '../log/CharacterLog';
import { DiceTray } from '../dice/DiceTray';
import { useTourAutostart } from '../tutorial/useTour';
import { ViewOnlyBanner } from '../party/ViewOnlyBanner';

/** Character screens: sidebar (≥ 640 px) or bottom nav (< 640 px), sticky HUD, screen in the middle. */
export function AppFrame() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const character = useStore(characterStore, (store) =>
    characterId && Object.hasOwn(store.characters, characterId)
      ? store.characters[characterId]
      : undefined,
  );
  const previous = useRef({ id: characterId, existed: !!character });
  const frame = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLDivElement>(null);
  const characterExists = character !== undefined;
  useLayoutEffect(() => {
    if (!frame.current || !header.current) return;
    const update = () =>
      frame.current?.style.setProperty(
        '--character-header-height',
        `${header.current?.getBoundingClientRect().height ?? 0}px`,
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header.current);
    return () => observer.disconnect();
  }, [characterId, characterExists]);
  useEffect(() => {
    if (previous.current.id === characterId && previous.current.existed && !character)
      navigate('/');
    previous.current = { id: characterId, existed: !!character };
  }, [characterId, character, navigate]);
  useTourAutostart('character', characterExists);
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
        <RestProvider>
          <div className="flex min-h-dvh">
            <SideNav />
            <div ref={frame} className="flex min-w-0 flex-1 flex-col">
              <div ref={header} className="sticky top-0 z-20 bg-bg">
                <HudBar />
                <ConcentrationSaveBanner />
                <CharacterToolbar />
              </div>
              <div className="flex min-w-0 flex-1">
                <main
                  id="character-workspace"
                  tabIndex={-1}
                  className="@container min-w-0 flex-1 pb-20 sm:pb-0"
                >
                  {character.build.partyOwner && (
                    <ViewOnlyBanner
                      characterId={character.build.id}
                      characterName={character.build.name}
                      ownerName={character.build.partyOwner.name}
                    />
                  )}
                  <CommandNotes />
                  <Suspense fallback={null}>
                    <Outlet />
                  </Suspense>
                </main>
                <DetailPanel />
              </div>
            </div>
          </div>
          <BottomNav />
          <DiceTray />
        </RestProvider>
      </CommandProvider>
    </DetailProvider>
  );
}
