-- OmniDnD shared campaigns (milestone M24): a DM and players share one campaign.
-- Members read every row of their campaign; only a character's owner writes it; only the DM
-- (or the owner while nobody is DM) writes the campaign record. Membership and invites change
-- only through the functions below, so the app never needs a service key.

create table if not exists public.shared_campaigns (
  id text not null check (char_length(id) between 1 and 200),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  revision bigint not null default 1 check (revision >= 1),
  changed_at timestamptz not null,
  schema_version integer not null check (schema_version >= 1),
  -- The campaign record (name, books, optional rules, role is per member and not stored here).
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (id),
  constraint campaign_payload_size check (octet_length(payload::text) <= 1000000)
);

comment on table public.shared_campaigns is
  'OmniDnD shared campaign records. Written by the DM, or by the owner while there is no DM.';

create table if not exists public.campaign_members (
  campaign_id text not null references public.shared_campaigns (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('dm', 'player')),
  joined_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

-- Exactly one DM per campaign (D171).
create unique index if not exists campaign_members_one_dm
  on public.campaign_members (campaign_id) where role = 'dm';
create index if not exists campaign_members_user on public.campaign_members (user_id);

comment on table public.campaign_members is
  'Who is in a shared campaign. Changed only through the party functions.';

create table if not exists public.campaign_invites (
  id uuid not null default gen_random_uuid(),
  campaign_id text not null references public.shared_campaigns (id) on delete cascade,
  -- Only the SHA-256 of the code is stored, so a leaked table reveals no usable link.
  code_hash bytea not null unique,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (id)
);

comment on table public.campaign_invites is
  'Join links. Hashed codes, 7 day expiry, revocable. Used only through party functions.';

create table if not exists public.party_entities (
  campaign_id text not null references public.shared_campaigns (id) on delete cascade,
  entity_id text not null check (char_length(entity_id) between 1 and 200),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  revision bigint not null default 1 check (revision >= 1),
  deleted boolean not null default false,
  changed_at timestamptz not null,
  schema_version integer not null check (schema_version >= 1),
  -- { build, live, events } for a character. Null for deletion markers.
  payload jsonb,
  updated_at timestamptz not null default now(),
  primary key (campaign_id, entity_id),
  constraint party_payload_matches_deleted check ((payload is null) = deleted),
  constraint party_payload_size check (payload is null or octet_length(payload::text) <= 5000000)
);

comment on table public.party_entities is
  'Characters in a shared campaign. Every member reads them; only the owner writes.';

-- Revisions and timestamps are assigned by the server, never trusted from the client.
create or replace function public.party_next_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
  else
    new.revision := old.revision + 1;
    if tg_table_name = 'party_entities' then
      if new.owner_id <> old.owner_id or new.campaign_id <> old.campaign_id
         or new.entity_id <> old.entity_id then
        raise exception 'party entity identity cannot change';
      end if;
    elsif new.id <> old.id or new.owner_id <> old.owner_id then
      raise exception 'shared campaign identity cannot change';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists shared_campaigns_revision on public.shared_campaigns;
create trigger shared_campaigns_revision
  before insert or update on public.shared_campaigns
  for each row execute function public.party_next_revision();

drop trigger if exists party_entities_revision on public.party_entities;
create trigger party_entities_revision
  before insert or update on public.party_entities
  for each row execute function public.party_next_revision();

-- Helpers used by the policies. They run as the table owner so a policy on one table can
-- look at another without recursing through that table's own policies.
create or replace function public.is_campaign_member(p_campaign text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign and user_id = (select auth.uid())
  );
$$;

create or replace function public.can_edit_campaign(p_campaign text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign and user_id = (select auth.uid()) and role = 'dm'
  ) or (
    exists (
      select 1 from public.shared_campaigns
      where id = p_campaign and owner_id = (select auth.uid())
    )
    and not exists (
      select 1 from public.campaign_members where campaign_id = p_campaign and role = 'dm'
    )
  );
$$;

create or replace function public.shares_campaign_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.campaign_members mine
    join public.campaign_members theirs on theirs.campaign_id = mine.campaign_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user
  );
$$;

-- Row-level security.
alter table public.shared_campaigns enable row level security;
alter table public.shared_campaigns force row level security;
alter table public.campaign_members enable row level security;
alter table public.campaign_members force row level security;
alter table public.campaign_invites enable row level security;
alter table public.campaign_invites force row level security;
alter table public.party_entities enable row level security;
alter table public.party_entities force row level security;

drop policy if exists "Members read their campaign" on public.shared_campaigns;
create policy "Members read their campaign"
  on public.shared_campaigns for select
  to authenticated
  using (public.is_campaign_member(id));

drop policy if exists "DM changes the campaign record" on public.shared_campaigns;
create policy "DM changes the campaign record"
  on public.shared_campaigns for update
  to authenticated
  using (public.can_edit_campaign(id))
  with check (public.can_edit_campaign(id));

drop policy if exists "Members read the member list" on public.campaign_members;
create policy "Members read the member list"
  on public.campaign_members for select
  to authenticated
  using (public.is_campaign_member(campaign_id));

-- campaign_invites has no policy: nobody reads it directly, not even the DM.

drop policy if exists "Members read party characters" on public.party_entities;
create policy "Members read party characters"
  on public.party_entities for select
  to authenticated
  using (public.is_campaign_member(campaign_id));

drop policy if exists "Members add their own characters" on public.party_entities;
create policy "Members add their own characters"
  on public.party_entities for insert
  to authenticated
  with check ((select auth.uid()) = owner_id and public.is_campaign_member(campaign_id));

drop policy if exists "Owners change their own characters" on public.party_entities;
create policy "Owners change their own characters"
  on public.party_entities for update
  to authenticated
  using ((select auth.uid()) = owner_id and public.is_campaign_member(campaign_id))
  with check ((select auth.uid()) = owner_id and public.is_campaign_member(campaign_id));

-- Party members read each other's display name (never an email).
drop policy if exists "Party members read names" on public.profiles;
create policy "Party members read names"
  on public.profiles for select
  to authenticated
  using (public.shares_campaign_with(user_id));

-- No delete policy anywhere: characters leave as deletion markers; members leave or are
-- removed through the functions below.
revoke all on public.shared_campaigns from anon;
revoke all on public.campaign_members from anon;
revoke all on public.campaign_invites from anon;
revoke all on public.party_entities from anon;
revoke all on public.campaign_invites from authenticated;
revoke insert, delete on public.shared_campaigns from authenticated;
revoke insert, update, delete on public.campaign_members from authenticated;
grant select, update on public.shared_campaigns to authenticated;
grant select on public.campaign_members to authenticated;
grant select, insert, update on public.party_entities to authenticated;

-- Share a campaign: the caller becomes its owner and first member.
create or replace function public.share_campaign(
  p_id text,
  p_role text,
  p_schema_version integer,
  p_changed_at timestamptz,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in';
  end if;
  if p_role not in ('dm', 'player') then
    raise exception 'Role must be dm or player';
  end if;
  insert into public.shared_campaigns (id, owner_id, changed_at, schema_version, payload)
  values (p_id, (select auth.uid()), p_changed_at, p_schema_version, p_payload);
  insert into public.campaign_members (campaign_id, user_id, role)
  values (p_id, (select auth.uid()), p_role);
end;
$$;

-- Owner or DM makes a join code. It is returned once and stored only as a hash.
create or replace function public.create_invite(p_campaign text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not (
    exists (
      select 1 from public.shared_campaigns
      where id = p_campaign and owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.campaign_members
      where campaign_id = p_campaign and user_id = (select auth.uid()) and role = 'dm'
    )
  ) then
    raise exception 'Only the owner or the DM can invite';
  end if;
  update public.campaign_invites set revoked_at = now()
  where campaign_id = p_campaign and revoked_at is null;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into public.campaign_invites (campaign_id, code_hash, expires_at)
  values (p_campaign, sha256(convert_to(v_code, 'UTF8')), now() + interval '7 days');
  return v_code;
end;
$$;

create or replace function public.revoke_invites(p_campaign text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    exists (
      select 1 from public.shared_campaigns
      where id = p_campaign and owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.campaign_members
      where campaign_id = p_campaign and user_id = (select auth.uid()) and role = 'dm'
    )
  ) then
    raise exception 'Only the owner or the DM can revoke invites';
  end if;
  update public.campaign_invites set revoked_at = now()
  where campaign_id = p_campaign and revoked_at is null;
end;
$$;

-- What a join page shows before joining: campaign name, DM and member count.
create or replace function public.preview_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign text;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in';
  end if;
  select campaign_id into v_campaign from public.campaign_invites
  where code_hash = sha256(convert_to(upper(trim(p_code)), 'UTF8'))
    and revoked_at is null and expires_at > now();
  if v_campaign is null then
    raise exception 'This invite is not valid';
  end if;
  return (
    select jsonb_build_object(
      'campaign_id', c.id,
      'name', c.payload ->> 'name',
      'dm_name', (
        select p.display_name from public.campaign_members m
        join public.profiles p on p.user_id = m.user_id
        where m.campaign_id = c.id and m.role = 'dm'
      ),
      'member_count', (select count(*) from public.campaign_members where campaign_id = c.id),
      'already_member', exists (
        select 1 from public.campaign_members
        where campaign_id = c.id and user_id = (select auth.uid())
      )
    )
    from public.shared_campaigns c where c.id = v_campaign
  );
end;
$$;

-- Join as a player. Codes cannot be listed, only tried one at a time.
create or replace function public.join_campaign(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign text;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in';
  end if;
  select campaign_id into v_campaign from public.campaign_invites
  where code_hash = sha256(convert_to(upper(trim(p_code)), 'UTF8'))
    and revoked_at is null and expires_at > now();
  if v_campaign is null then
    raise exception 'This invite is not valid';
  end if;
  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_campaign, (select auth.uid()), 'player')
  on conflict (campaign_id, user_id) do nothing;
  return v_campaign;
end;
$$;

create or replace function public.leave_campaign(p_campaign text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.campaign_members
  where campaign_id = p_campaign and user_id = (select auth.uid());
$$;

-- Owner or DM removes someone else. The owner stays: they can only leave themselves.
create or replace function public.remove_member(p_campaign text, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user = (select auth.uid()) then
    raise exception 'Use leave to leave a campaign';
  end if;
  if not (
    exists (
      select 1 from public.shared_campaigns
      where id = p_campaign and owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.campaign_members
      where campaign_id = p_campaign and user_id = (select auth.uid()) and role = 'dm'
    )
  ) then
    raise exception 'Only the owner or the DM can remove members';
  end if;
  if exists (select 1 from public.shared_campaigns where id = p_campaign and owner_id = p_user) then
    raise exception 'The owner cannot be removed';
  end if;
  delete from public.campaign_members where campaign_id = p_campaign and user_id = p_user;
end;
$$;

-- Hand the DM role to another member. The old DM becomes a player.
create or replace function public.set_dm(p_campaign text, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    exists (
      select 1 from public.shared_campaigns
      where id = p_campaign and owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.campaign_members
      where campaign_id = p_campaign and user_id = (select auth.uid()) and role = 'dm'
    )
  ) then
    raise exception 'Only the owner or the DM can hand over the DM role';
  end if;
  if not exists (
    select 1 from public.campaign_members where campaign_id = p_campaign and user_id = p_user
  ) then
    raise exception 'That person is not in this campaign';
  end if;
  update public.campaign_members set role = 'player'
  where campaign_id = p_campaign and role = 'dm';
  update public.campaign_members set role = 'dm'
  where campaign_id = p_campaign and user_id = p_user;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
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
    'set_dm(text, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('revoke all on function public.%s from anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

-- Live updates: Realtime applies the same row-level security, so members only hear their party.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.party_entities;
    alter publication supabase_realtime add table public.shared_campaigns;
    alter publication supabase_realtime add table public.campaign_members;
  end if;
exception when duplicate_object then
  null;
end;
$$;
