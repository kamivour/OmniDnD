-- OmniDnD account sync (milestone MA, Q28: Supabase).
-- One row per synced campaign or character. Rows belong to the signed-in user;
-- row-level security makes every other user's rows invisible and unwritable.

create table if not exists public.sync_entities (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('campaign', 'character')),
  entity_id text not null check (char_length(entity_id) between 1 and 200),
  -- Server revision. Starts at 1 and goes up by one on every update; clients send the
  -- revision they last saw and the update only applies if it still matches.
  revision bigint not null default 1 check (revision >= 1),
  deleted boolean not null default false,
  -- Device time of the change, for display only. Conflict checks use `revision`.
  changed_at timestamptz not null,
  schema_version integer not null check (schema_version >= 1),
  -- Campaign record, or { build, live, events } for a character. Null for deletion markers.
  payload jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, entity_id),
  constraint payload_matches_deleted check ((payload is null) = deleted),
  constraint payload_size check (payload is null or octet_length(payload::text) <= 5000000)
);

comment on table public.sync_entities is
  'OmniDnD campaigns and characters synced per account. Guests never write here.';

-- Revisions are assigned by the server, never trusted from the client.
create or replace function public.sync_entities_next_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
  else
    if new.user_id <> old.user_id or new.kind <> old.kind or new.entity_id <> old.entity_id then
      raise exception 'sync entity identity cannot change';
    end if;
    new.revision := old.revision + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sync_entities_revision on public.sync_entities;
create trigger sync_entities_revision
  before insert or update on public.sync_entities
  for each row execute function public.sync_entities_next_revision();

alter table public.sync_entities enable row level security;
alter table public.sync_entities force row level security;

drop policy if exists "Users read their own entities" on public.sync_entities;
create policy "Users read their own entities"
  on public.sync_entities for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users add their own entities" on public.sync_entities;
create policy "Users add their own entities"
  on public.sync_entities for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users change their own entities" on public.sync_entities;
create policy "Users change their own entities"
  on public.sync_entities for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No delete policy: removals sync as deletion markers (deleted = true, payload = null),
-- so other devices learn about them. Deleting the account removes all rows by cascade.

revoke all on public.sync_entities from anon;
grant select, insert, update on public.sync_entities to authenticated;
