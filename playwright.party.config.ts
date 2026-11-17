import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Configured-account browser checks use a fake HTTP backend, never a real Supabase project. */
export default defineConfig({
  ...base,
  testMatch: '**/party-sharing.spec.ts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4174' },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_SUPABASE_URL: 'https://sync.test', VITE_SUPABASE_ANON_KEY: 'test-public-key' },
  },
});
