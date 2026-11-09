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

const policiesOf = (table: string) =>
  [...sql.matchAll(new RegExp(`create policy[^;]+on public\\.${table}[^;]+;`, 'g'))].map(
    (match) => match[0],
  );

describe('Supabase schema', () => {
  it('defines the sync, profile and party tables', () => {
    expect(tables).toEqual([
      'sync_entities',
      'profiles',
      'shared_campaigns',
      'campaign_members',
      'campaign_invites',
      'party_entities',
    ]);
  });

  it.each(['sync_entities', 'profiles'])(
    'locks %s to its owner with row-level security',
    (table) => {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`alter table public.${table} force row level security`);
      const policies = policiesOf(table);
      expect(policies.length).toBeGreaterThan(0);
      for (const policy of policies) {
        expect(policy).toContain('to authenticated');
        const clauses = [
          ...policy.matchAll(/(using|with check) \(([^;]+?)\)\s*(?=with check|;|$)/g),
        ];
        expect(clauses.length).toBeGreaterThan(0);
        for (const clause of clauses) {
          // Profiles also let party members read each other's names (M24).
          expect(clause[2]).toMatch(/auth\.uid\(\)\) = user_id|shares_campaign_with\(user_id\)/);
        }
      }
      expect(sql).toContain(`revoke all on public.${table} from anon`);
      expect(sql).not.toMatch(new RegExp(`grant [^;]*on public\\.${table} to (anon|public)`));
      expect(sql).not.toMatch(
        new RegExp(`for delete[^;]*on public\\.${table}|on public\\.${table} for (all|delete)`),
      );
    },
  );

  it('lets a user delete only their own account', () => {
    expect(sql).toContain('create or replace function public.delete_my_account()');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain('delete from auth.users where id = (select auth.uid())');
    expect(sql).toContain('revoke all on function public.delete_my_account() from anon');
    expect(sql).toContain('grant execute on function public.delete_my_account() to authenticated');
    expect(sql).not.toMatch(
      /grant execute on function public\.delete_my_account\(\) to (anon|public)/,
    );
  });

  it('assigns revisions on the server', () => {
    expect(sql).toContain('new.revision := old.revision + 1');
    expect(sql).toContain('before insert or update on public.sync_entities');
  });
});

describe('Supabase shared campaigns (M24)', () => {
  const party = ['shared_campaigns', 'campaign_members', 'campaign_invites', 'party_entities'];

  it.each(party)('locks %s with row-level security and no anonymous access', (table) => {
    expect(sql).toContain(`alter table public.${table} enable row level security`);
    expect(sql).toContain(`alter table public.${table} force row level security`);
    expect(sql).toContain(`revoke all on public.${table} from anon`);
    expect(sql).not.toMatch(new RegExp(`grant [^;]*on public\\.${table} to (anon|public)`));
    for (const policy of policiesOf(table)) {
      expect(policy).toContain('to authenticated');
      expect(policy).not.toMatch(/for (all|delete)/);
    }
  });

  it('lets only members read and only a character owner write it', () => {
    for (const policy of policiesOf('party_entities')) {
      expect(policy).toContain('is_campaign_member(campaign_id)');
      if (!policy.includes('for select')) expect(policy).toContain('auth.uid()) = owner_id');
    }
    expect(policiesOf('campaign_invites')).toEqual([]);
    expect(sql).toContain('revoke all on public.campaign_invites from authenticated');
    expect(sql).toContain(
      'revoke insert, update, delete on public.campaign_members from authenticated',
    );
    expect(sql).toContain('revoke insert, delete on public.shared_campaigns from authenticated');
  });

  it('allows one DM and stores invite codes hashed with a 7 day expiry', () => {
    expect(sql).toContain('create unique index if not exists campaign_members_one_dm');
    expect(sql).toContain("where role = 'dm'");
    expect(sql).toContain('code_hash bytea not null unique');
    expect(sql).toContain('sha256(convert_to(');
    expect(sql).toContain("interval '7 days'");
    expect(sql).toContain('revoked_at is null and expires_at > now()');
  });

  it.each([
    'is_campaign_member(text)',
    'can_edit_campaign(text)',
    'shares_campaign_with(uuid)',
    'share_campaign(text, text, integer, timestamptz, jsonb)',
    'create_invite(text)',
    'revoke_invites(text)',
    'preview_invite(text)',
    'join_campaign(text)',
    'leave_campaign(text)',
    'remove_member(text, uuid)',
    'set_dm(text, uuid)',
  ])('keeps %s authenticated-only with a fixed search path', (signature) => {
    expect(sql).toContain(`'${signature}'`);
    const name = signature.split('(')[0]!;
    const start = sql.indexOf(`function public.${name}(`);
    expect(start).toBeGreaterThan(-1);
    expect(sql.slice(start, start + 1500)).toContain("set search_path = ''");
  });

  it('assigns shared revisions on the server', () => {
    expect(sql).toContain('before insert or update on public.party_entities');
    expect(sql).toContain('before insert or update on public.shared_campaigns');
  });
});
