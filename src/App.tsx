import { lazy, Suspense, type ComponentType } from 'react';
import { syncConfig } from './sync/config';
import { BrowserRouter, Route, Routes } from 'react-router';
import { ToastProvider } from './ui/components/ToastProvider';
import { AppFrame } from './ui/layout/AppFrame';
import { HubFrame } from './ui/layout/HubFrame';
import { NAV } from './ui/layout/nav';
import { CampaignsScreen } from './ui/screens/CampaignsScreen';
import { DashboardScreen } from './ui/screens/DashboardScreen';
import { PlaceholderScreen } from './ui/screens/PlaceholderScreen';
import { MotionPreference } from './ui/components/MotionPreference';
import { AmbientLayer } from './ui/theme/AmbientLayer';
import { PressEffects } from './ui/theme/PressEffects';
import { TourHost } from './ui/tutorial/TourHost';
import { StorageGate } from './ui/storage/StorageGate';

/**
 * Load a screen's code the first time it opens; the service worker precaches every chunk.
 * Warming every screen on idle was tried and dropped: it left the next full page load blank
 * for seconds on mobile emulation (m6 acceptance spec).
 */
function screen<K extends string>(
  load: () => Promise<Record<K, ComponentType>>,
  name: K,
): ComponentType {
  return lazy(async () => ({ default: (await load())[name] as ComponentType }));
}

const PrintScreen = screen(() => import('./ui/screens/PrintScreen'), 'PrintScreen');
const TodoScreen = screen(() => import('./ui/todo/TodoScreen'), 'TodoScreen');
const CampaignSetupScreen = screen(
  () => import('./ui/screens/CampaignSetupScreen'),
  'CampaignSetupScreen',
);
const CombatScreen = screen(() => import('./ui/screens/CombatScreen'), 'CombatScreen');
const CharacterSheetScreen = screen(
  () => import('./ui/screens/CharacterSheetScreen'),
  'CharacterSheetScreen',
);
const ExplorationScreen = screen(
  () => import('./ui/screens/ExplorationScreen'),
  'ExplorationScreen',
);
const FeaturesScreen = screen(() => import('./ui/screens/FeaturesScreen'), 'FeaturesScreen');
const InventoryScreen = screen(() => import('./ui/screens/InventoryScreen'), 'InventoryScreen');
const CompanionsScreen = screen(() => import('./ui/screens/CompanionsScreen'), 'CompanionsScreen');
const JournalScreen = screen(() => import('./ui/screens/JournalScreen'), 'JournalScreen');
const NewCharacterScreen = screen(
  () => import('./ui/screens/NewCharacterScreen'),
  'NewCharacterScreen',
);
const SpellbookScreen = screen(() => import('./ui/screens/SpellbookScreen'), 'SpellbookScreen');
const ReferenceScreen = screen(() => import('./ui/screens/ReferenceScreen'), 'ReferenceScreen');
const CreditsScreen = screen(() => import('./ui/screens/CreditsScreen'), 'CreditsScreen');
const ToolsScreen = screen(() => import('./ui/screens/ToolsScreen'), 'ToolsScreen');
const PartyScreen = screen(() => import('./ui/party/PartyScreen'), 'PartyScreen');
const JoinScreen = screen(() => import('./ui/screens/JoinScreen'), 'JoinScreen');
const ResetPasswordScreen = screen(
  () => import('./ui/screens/ResetPasswordScreen'),
  'ResetPasswordScreen',
);
const SettingsScreen = screen(() => import('./ui/screens/SettingsScreen'), 'SettingsScreen');

const SyncHost = syncConfig ? lazy(() => import('./ui/settings/SyncHost')) : null;

const BUILT = new Set([
  '',
  'sheet',
  'combat',
  'spells',
  'explore',
  'inventory',
  'features',
  'journal',
  'companions',
  'reference',
  'settings',
]);

/** Hub routes (no character open) and character routes under `/characters/:characterId`. */
export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <StorageGate>
          <MotionPreference />
          <AmbientLayer />
          <PressEffects />
          {SyncHost && syncConfig && (
            <Suspense fallback={null}>
              <SyncHost config={syncConfig} />
            </Suspense>
          )}
          <TourHost />
          <Routes>
            <Route element={<HubFrame />}>
              <Route index element={<CampaignsScreen />} />
              <Route path="campaigns/new" element={<CampaignSetupScreen />} />
              <Route path="campaigns/:campaignId/settings" element={<CampaignSetupScreen />} />
              <Route path="campaigns/:campaignId/party" element={<PartyScreen />} />
              <Route path="campaigns/:campaignId/characters/new" element={<NewCharacterScreen />} />
              <Route path="reference" element={<ReferenceScreen />} />
              <Route path="settings" element={<SettingsScreen />} />
              <Route path="reset-password" element={<ResetPasswordScreen />} />
              <Route path="join/:code" element={<JoinScreen />} />
              <Route path="reference/credits" element={<CreditsScreen />} />
              <Route path="reference/tools" element={<ToolsScreen />} />
              <Route path="*" element={<PlaceholderScreen title="Not found" />} />
            </Route>
            <Route
              path="characters/:characterId/print"
              element={
                <Suspense fallback={null}>
                  <PrintScreen />
                </Suspense>
              }
            />
            <Route path="characters/:characterId" element={<AppFrame />}>
              <Route index element={<DashboardScreen />} />
              <Route path="sheet" element={<CharacterSheetScreen />} />
              <Route path="combat" element={<CombatScreen />} />
              <Route path="spells" element={<SpellbookScreen />} />
              <Route path="explore" element={<ExplorationScreen />} />
              <Route path="inventory" element={<InventoryScreen />} />
              <Route path="features" element={<FeaturesScreen />} />
              <Route path="journal" element={<JournalScreen />} />
              <Route path="todo" element={<TodoScreen />} />
              <Route path="companions" element={<CompanionsScreen />} />
              <Route path="reference" element={<ReferenceScreen />} />
              <Route path="settings" element={<SettingsScreen />} />
              {NAV.filter((n) => !BUILT.has(n.to)).map((n) => (
                <Route
                  key={n.to}
                  path={n.to}
                  element={
                    <PlaceholderScreen
                      title={n.label}
                      milestone={n.milestone ?? 'later'}
                      phase={n.phase}
                    />
                  }
                />
              ))}
              <Route path="reference/credits" element={<CreditsScreen />} />
              <Route path="reference/tools" element={<ToolsScreen />} />
              <Route path="*" element={<PlaceholderScreen title="Not found" />} />
            </Route>
          </Routes>
        </StorageGate>
      </ToastProvider>
    </BrowserRouter>
  );
}
