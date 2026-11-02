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
import { StorageGate } from './ui/storage/StorageGate';

const BUILT = new Set(['', 'combat', 'spells']);

/** Hub routes (no character open) and character routes under `/characters/:characterId`. */
export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <StorageGate>
          <Routes>
            <Route element={<HubFrame />}>
              <Route index element={<CampaignsScreen />} />
              <Route path="campaigns/new" element={<CampaignSetupScreen />} />
              <Route path="campaigns/:campaignId/settings" element={<CampaignSetupScreen />} />
              <Route path="campaigns/:campaignId/characters/new" element={<NewCharacterScreen />} />
              <Route
                path="reference"
                element={<PlaceholderScreen title="Reference" milestone="M3" />}
              />
              <Route
                path="settings"
                element={<PlaceholderScreen title="Settings" milestone="M3" />}
              />
              <Route
                path="reference/credits"
                element={<PlaceholderScreen title="Credits" milestone="M3" />}
              />
              <Route path="*" element={<PlaceholderScreen title="Not found" />} />
            </Route>
            <Route path="characters/:characterId" element={<AppFrame />}>
              <Route index element={<DashboardScreen />} />
              <Route path="combat" element={<CombatScreen />} />
              <Route path="spells" element={<SpellbookScreen />} />
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
              <Route
                path="reference/credits"
                element={<PlaceholderScreen title="Credits" milestone="M3" />}
              />
              <Route path="*" element={<PlaceholderScreen title="Not found" />} />
            </Route>
          </Routes>
        </StorageGate>
      </ToastProvider>
    </BrowserRouter>
  );
}
