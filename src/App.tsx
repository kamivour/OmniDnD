import { lazy, Suspense } from 'react';
import { syncConfig } from './sync/config';
import { PrintScreen } from './ui/screens/PrintScreen';
import { TodoScreen } from './ui/todo/TodoScreen';
import { BrowserRouter, Route, Routes } from 'react-router';
import { ToastProvider } from './ui/components/ToastProvider';
import { AppFrame } from './ui/layout/AppFrame';
import { HubFrame } from './ui/layout/HubFrame';
import { NAV } from './ui/layout/nav';
import { CampaignSetupScreen } from './ui/screens/CampaignSetupScreen';
import { CampaignsScreen } from './ui/screens/CampaignsScreen';
import { CombatScreen } from './ui/screens/CombatScreen';
import { CharacterSheetScreen } from './ui/screens/CharacterSheetScreen';
import { DashboardScreen } from './ui/screens/DashboardScreen';
import { ExplorationScreen } from './ui/screens/ExplorationScreen';
import { FeaturesScreen } from './ui/screens/FeaturesScreen';
import { InventoryScreen } from './ui/screens/InventoryScreen';
import { CompanionsScreen } from './ui/screens/CompanionsScreen';
import { JournalScreen } from './ui/screens/JournalScreen';
import { NewCharacterScreen } from './ui/screens/NewCharacterScreen';
import { PlaceholderScreen } from './ui/screens/PlaceholderScreen';
import { SpellbookScreen } from './ui/screens/SpellbookScreen';
import { ReferenceScreen } from './ui/screens/ReferenceScreen';
import { CreditsScreen } from './ui/screens/CreditsScreen';
import { ToolsScreen } from './ui/screens/ToolsScreen';
import { JoinScreen } from './ui/screens/JoinScreen';
import { ResetPasswordScreen } from './ui/screens/ResetPasswordScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { MotionPreference } from './ui/components/MotionPreference';
import { TourHost } from './ui/tutorial/TourHost';
import { StorageGate } from './ui/storage/StorageGate';

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
              <Route path="campaigns/:campaignId/characters/new" element={<NewCharacterScreen />} />
              <Route path="reference" element={<ReferenceScreen />} />
              <Route path="settings" element={<SettingsScreen />} />
              <Route path="reset-password" element={<ResetPasswordScreen />} />
              <Route path="join/:code" element={<JoinScreen />} />
              <Route path="reference/credits" element={<CreditsScreen />} />
              <Route path="reference/tools" element={<ToolsScreen />} />
              <Route path="*" element={<PlaceholderScreen title="Not found" />} />
            </Route>
            <Route path="characters/:characterId/print" element={<PrintScreen />} />
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
