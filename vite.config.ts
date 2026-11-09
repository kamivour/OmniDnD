import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      disable: command !== 'build',
      strategies: 'generateSW',
      injectRegister: 'script-defer',
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'OmniDnD',
        short_name: 'OmniDnD',
        description: 'D&D 5e (2014) character companion',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#101521',
        background_color: '#101521',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,woff2,woff,svg,png,webmanifest}'],
        // The app bundle carries SRD data and must be precached to work offline.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Updates wait for all old tabs to close, preserving an ongoing session.
        skipWaiting: false,
        clientsClaim: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        // Reference data and libraries change less often than app code, so an app update
        // re-downloads only the app chunks. Supabase stays out of `vendor` to keep it lazy.
        codeSplitting: {
          groups: [
            { name: 'data', test: /[\\/]data[\\/](srd|content|mechanics)[\\/]/ },
            { name: 'vendor', test: /[\\/]node_modules[\\/](?!@supabase[\\/])/ },
          ],
        },
      },
    },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
}));
