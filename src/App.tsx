import { BrowserRouter, Route, Routes } from 'react-router';
import { ToastProvider } from './ui/components/ToastProvider';
import { AppFrame } from './ui/layout/AppFrame';
import { HubFrame } from './ui/layout/HubFrame';
import { NAV } from './ui/layout/nav';
import { CampaignSetupScreen } from './ui/screens/CampaignSetupScreen';
import { CampaignsScreen } from './ui/screens/CampaignsScreen';
import { CombatScreen } from './ui/screens/CombatScreen';
import { DashboardScreen } from './ui/screens/DashboardScreen';
import { NewCharacterScreen } from './ui/screens/NewCharacterScreen';
import { PlaceholderScreen } from './ui/screens/PlaceholderScreen';
import { SpellbookScreen } from './ui/screens/SpellbookScreen';
import { ReferenceScreen } from './ui/screens/ReferenceScreen';
import { CreditsScreen } from './ui/screens/CreditsScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { MotionPreference } from './ui/components/MotionPreference';
import { StorageGate } from './ui/storage/StorageGate';

const BUILT = new Set(['', 'combat', 'spells', 'reference', 'settings']);

/** Hub routes (no character open) and character routes under `/characters/:characterId`. */
export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <StorageGate>
          <MotionPreference />
          <Routes>
            <Route element={<HubFrame />}>
              <Route index element={<CampaignsScreen />} />
              <Route path="campaigns/new" element={<CampaignSetupScreen />} />
              <Route path="campaigns/:campaignId/settings" element={<CampaignSetupScreen />} />
              <Route path="campaigns/:campaignId/characters/new" element={<NewCharacterScreen />} />
              <Route path="reference" element={<ReferenceScreen />} />
              <Route path="settings" element={<SettingsScreen />} />
              <Route path="reference/credits" element={<CreditsScreen />} />
              <Route path="*" element={<PlaceholderScreen title="Not found" />} />
            </Route>
            <Route path="characters/:characterId" element={<AppFrame />}>
              <Route index element={<DashboardScreen />} />
              <Route path="combat" element={<CombatScreen />} />
              <Route path="spells" element={<SpellbookScreen />} />
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
              <Route path="*" element={<PlaceholderScreen title="Not found" />} />
            </Route>
          </Routes>
        </StorageGate>
      </ToastProvider>
    </BrowserRouter>
  );
}
