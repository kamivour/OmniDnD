-- Standalone snapshots do not participate in campaign sharing or account sync.
begin;

create table if not exists public.character_links (
  owner_id uuid not null references auth.users(id) on delete cascade,
  character_id text not null,
  token uuid not null default gen_random_uuid() unique,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, character_id),
  check (char_length(character_id) between 1 and 200),
  check (octet_length(payload::text) <= 1048576)
);

alter table public.character_links enable row level security;
alter table public.character_links force row level security;
revoke all on public.character_links from public, anon, authenticated;

create or replace function public.publish_character_link(p_character text, p_snapshot jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_share public.character_links;
  v_build jsonb := p_snapshot->'build';
  v_live jsonb := p_snapshot->'live';
  v_campaign jsonb := p_snapshot->'campaign';
begin
  if v_owner is null then raise exception 'Sign in first'; end if;
  if p_character is null or char_length(p_character) not between 1 and 200
    or p_snapshot is null or octet_length(p_snapshot::text) > 1048576
    or jsonb_typeof(v_build) is distinct from 'object'
    or jsonb_typeof(v_live) is distinct from 'object'
    or jsonb_typeof(v_campaign) is distinct from 'object'
    or v_build ? 'partyOwner'
  then raise exception 'Invalid character snapshot'; end if;

  v_build := (v_build - array['partyOwner', 'playedBy']) || jsonb_build_object(
    'id', 'shared-character', 'campaignId', 'shared-character', 'journal', '{}'::jsonb,
    'choices', '{}'::jsonb, 'favorites', '[]'::jsonb,
    'items', coalesce((select jsonb_agg(item - 'notes' order by position)
      from jsonb_array_elements(v_build->'items') with ordinality as x(item, position)), '[]'::jsonb),
    'overrides', coalesce((select jsonb_agg((entry - 'note') || jsonb_build_object(
      'note', case when nullif(btrim(entry->>'note'), '') is null then '' else 'Shared override' end
    ) order by position)
      from jsonb_array_elements(v_build->'overrides') with ordinality as x(entry, position)), '[]'::jsonb)
  );
  if v_build ? 'companions' then
    v_build := jsonb_set(v_build, '{companions}', coalesce((
      select jsonb_agg(companion - 'notes' order by position)
      from jsonb_array_elements(v_build->'companions') with ordinality as x(companion, position)
    ), '[]'::jsonb));
  end if;
  v_live := (v_live - 'encounter') || jsonb_build_object(
    'characterId', 'shared-character', 'currency', '{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb
  );
  v_campaign := (v_campaign - array['bench', 'role', 'shared']) || jsonb_build_object(
    'id', 'shared-character', 'name', 'Shared character'
  );

  insert into public.character_links as link (owner_id, character_id, payload)
  values (v_owner, p_character, jsonb_build_object(
    'app', 'omnidnd', 'schemaVersion', 1,
    'exportedAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'build', v_build, 'live', v_live, 'campaign', v_campaign, 'events', '[]'::jsonb
  ))
  on conflict (owner_id, character_id) do update
    set payload = excluded.payload, updated_at = now()
  returning link.* into v_share;
  return jsonb_build_object('token', v_share.token, 'updatedAt', v_share.updated_at);
end;
$$;

create or replace function public.get_my_character_link(p_character text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('token', token, 'updatedAt', updated_at)
  from public.character_links
  where owner_id = (select auth.uid()) and character_id = p_character
$$;

create or replace function public.revoke_character_link(p_character text)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.character_links
  where owner_id = (select auth.uid()) and character_id = p_character
$$;

create or replace function public.read_character_link(p_token uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select payload
  from public.character_links
  where token = p_token
$$;

revoke all on function public.publish_character_link(text,jsonb) from public, anon, authenticated;
revoke all on function public.get_my_character_link(text) from public, anon, authenticated;
revoke all on function public.revoke_character_link(text) from public, anon, authenticated;
revoke all on function public.read_character_link(uuid) from public, anon, authenticated;
grant execute on function public.publish_character_link(text,jsonb) to authenticated;
grant execute on function public.get_my_character_link(text) to authenticated;
grant execute on function public.revoke_character_link(text) to authenticated;
grant execute on function public.read_character_link(uuid) to anon, authenticated;

commit;
