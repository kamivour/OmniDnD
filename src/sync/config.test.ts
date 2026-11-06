import { describe, expect, it } from 'vitest';
import { readSyncConfig } from './config';

describe('sync configuration', () => {
  it('stays off without both values', () => {
    expect(readSyncConfig({})).toBeNull();
    expect(readSyncConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co' })).toBeNull();
    expect(readSyncConfig({ VITE_SUPABASE_ANON_KEY: 'key' })).toBeNull();
    expect(readSyncConfig({ VITE_SUPABASE_URL: '  ', VITE_SUPABASE_ANON_KEY: 'key' })).toBeNull();
  });

  it('accepts HTTPS, or HTTP only for a local development server', () => {
    expect(
      readSyncConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co/', VITE_SUPABASE_ANON_KEY: 'k' }),
    ).toEqual({ url: 'https://x.supabase.co', anonKey: 'k' });
    expect(
      readSyncConfig({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'k' }),
    ).toEqual({ url: 'http://127.0.0.1:54321', anonKey: 'k' });
    expect(
      readSyncConfig({ VITE_SUPABASE_URL: 'http://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' }),
    ).toBeNull();
    expect(
      readSyncConfig({ VITE_SUPABASE_URL: 'not a url', VITE_SUPABASE_ANON_KEY: 'k' }),
    ).toBeNull();
  });
});
