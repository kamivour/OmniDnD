import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Static guard for the account database schema. It cannot run Postgres here, so it checks
// the parts that keep one account from reading or writing another account's rows.
const folder = join(import.meta.dirname, '..', 'supabase', 'migrations');
const sql = readdirSync(folder)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => readFileSync(join(folder, name), 'utf8'))
  .join('\n')
  .toLowerCase();

const tables = [...sql.matchAll(/create table if not exists public\.(\w+)/g)].map(
  (match) => match[1],
);

describe('Supabase schema', () => {
  it('defines the sync and profile tables', () => {
    expect(tables).toEqual(['sync_entities', 'profiles']);
  });

  it.each(tables)('locks %s to its owner with row-level security', (table) => {
    expect(sql).toContain(`alter table public.${table} enable row level security`);
    expect(sql).toContain(`alter table public.${table} force row level security`);
    const policies = [
      ...sql.matchAll(new RegExp(`create policy[^;]+on public\\.${table}[^;]+;`, 'g')),
    ].map((match) => match[0]);
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy).toContain('to authenticated');
      const clauses = [...policy.matchAll(/(using|with check) \(([^;]+?)\)\s*(?=with check|;|$)/g)];
      expect(clauses.length).toBeGreaterThan(0);
      for (const clause of clauses) expect(clause[2]).toContain('auth.uid()) = user_id');
    }
    expect(sql).toContain(`revoke all on public.${table} from anon`);
    expect(sql).not.toMatch(new RegExp(`grant [^;]*on public\\.${table} to (anon|public)`));
    expect(sql).not.toMatch(
      new RegExp(`for delete[^;]*on public\\.${table}|on public\\.${table} for (all|delete)`),
    );
  });

  it('assigns revisions on the server', () => {
    expect(sql).toContain('new.revision := old.revision + 1');
    expect(sql).toContain('before insert or update on public.sync_entities');
  });
});
