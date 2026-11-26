import '@fontsource-variable/inter';
import '@fontsource-variable/cinzel';
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadMonsterPack } from './state/monster-pack';
import { startThemeSync } from './state/theme';
import { installNumericInputGuard } from './ui/numeric-input-guard';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
startThemeSync();
installNumericInputGuard();
// The dev server can supply the developer's local pack; a production build never has one.
void loadMonsterPack(
  import.meta.env.DEV
    ? () => import('virtual:dev-monster-pack').then((module) => module.default)
    : undefined,
);

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
