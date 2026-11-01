import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const ENGINE_PURITY = 'Engine is pure TypeScript: no React, DOM, or storage imports (AGENTS.md).';

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'playwright-report', 'test-results', 'data/private']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
  },
  {
    files: ['vite.config.ts', 'playwright.config.ts', 'scripts/**/*.ts', 'tests/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-*',
                'react/*',
                'dexie',
                'zustand',
                'zustand/*',
                'radix-ui',
                'lucide-react',
                '@floating-ui/*',
                '@/ui/*',
                '@/state/*',
                '@/db/*',
                '**/ui/**',
                '**/state/**',
                '**/db/**',
              ],
              message: ENGINE_PURITY,
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator'].map(
          (name) => ({ name, message: ENGINE_PURITY }),
        ),
      ],
    },
  },
  prettier,
]);
