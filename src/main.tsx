import '@fontsource-variable/inter';
import '@fontsource-variable/cinzel';
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startThemeSync } from './state/theme';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
startThemeSync();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
