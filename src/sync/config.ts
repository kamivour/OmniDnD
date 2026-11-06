/**
 * Account sync is off unless this copy of the app was built with a sync provider.
 * Set both values in `.env.local` (never committed) to turn accounts on:
 *
 *   VITE_SUPABASE_URL=https://<project>.supabase.co
 *   VITE_SUPABASE_ANON_KEY=<public anon key>
 *
 * The anon key is public by design; row-level security protects each account's rows.
 */
export interface SyncConfig {
  url: string;
  anonKey: string;
}

export function readSyncConfig(env: Record<string, unknown>): SyncConfig | null {
  const url = typeof env.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL.trim() : '';
  const anonKey =
    typeof env.VITE_SUPABASE_ANON_KEY === 'string' ? env.VITE_SUPABASE_ANON_KEY.trim() : '';
  if (!url || !anonKey) return null;
  try {
    const parsed = new URL(url);
    const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) return null;
  } catch {
    return null;
  }
  return { url: url.replace(/\/+$/, ''), anonKey };
}

export const syncConfig = readSyncConfig(import.meta.env);
