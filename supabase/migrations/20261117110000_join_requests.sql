-- Additive: existing invite links and owner-only character writes stay in place.
create table if not exists public.campaign_join_requests (
  campaign_id text not null references public.shared_campaigns(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  character_id text not null check (char_length(character_id) <= 200),
  character_name text not null check (char_length(character_name) between 1 and 200),
  requester_name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
create index if not exists campaign_join_requests_user on public.campaign_join_requests(user_id);

create or replace function public.can_manage_join_requests(p_campaign text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.shared_campaigns where id = p_campaign and owner_id = (select auth.uid()))
    or exists(select 1 from public.campaign_members where campaign_id = p_campaign and user_id = (select auth.uid()) and role = 'dm');
$$;

alter table public.campaign_join_requests enable row level security;
alter table public.campaign_join_requests force row level security;
drop policy if exists "Requesters and managers read join requests" on public.campaign_join_requests;
create policy "Requesters and managers read join requests"
  on public.campaign_join_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_join_requests(campaign_id));
revoke all on public.campaign_join_requests from anon, authenticated;
grant select on public.campaign_join_requests to authenticated;

-- Requesting never grants membership or access to campaign/character data.
create or replace function public.request_campaign_join(p_campaign text, p_character text, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Sign in to request access'; end if;
  if not exists(select 1 from public.shared_campaigns where id = p_campaign) then
    raise exception 'This campaign is not available for requests';
  end if;
  if public.is_campaign_member(p_campaign) then raise exception 'You are already a member'; end if;
  if char_length(trim(p_name)) not between 1 and 200 or char_length(p_character) > 200 then
    raise exception 'Character details are invalid';
  end if;
  if not exists(select 1 from public.campaign_join_requests where campaign_id=p_campaign and user_id=v_user and status='pending')
     and (select count(*) from public.campaign_join_requests where user_id=v_user and status='pending') >= 20 then
    raise exception 'Resolve your pending requests before sending more';
  end if;
  insert into public.campaign_join_requests(campaign_id,user_id,character_id,character_name,requester_name)
    values(p_campaign,v_user,p_character,trim(p_name),coalesce((select display_name from public.profiles where user_id=v_user),'Player'))
    on conflict(campaign_id,user_id) do update set character_id=excluded.character_id,
      character_name=excluded.character_name, requester_name=excluded.requester_name,
      status='pending',created_at=now();
end;
$$;

-- Decision and membership are one transaction, locked against concurrent decisions/retries.
create or replace function public.resolve_campaign_join(p_campaign text, p_user uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if not public.can_manage_join_requests(p_campaign) then raise exception 'Only the owner or DM can review requests'; end if;
  if p_approve is null then raise exception 'Choose approve or decline'; end if;
  select status into v_status from public.campaign_join_requests
    where campaign_id=p_campaign and user_id=p_user for update;
  if v_status is null then raise exception 'Request not found'; end if;
  if v_status = case when p_approve then 'approved' else 'declined' end then return; end if;
  if v_status <> 'pending' then raise exception 'This request has already been reviewed'; end if;
  if p_approve then
    insert into public.campaign_members(campaign_id,user_id,role) values(p_campaign,p_user,'player')
      on conflict(campaign_id,user_id) do nothing;
  end if;
  update public.campaign_join_requests set status=case when p_approve then 'approved' else 'declined' end
    where campaign_id=p_campaign and user_id=p_user;
end;
$$;

revoke all on function public.can_manage_join_requests(text) from public, anon;
revoke all on function public.request_campaign_join(text,text,text) from public, anon;
revoke all on function public.resolve_campaign_join(text,uuid,boolean) from public, anon;
grant execute on function public.can_manage_join_requests(text) to authenticated;
grant execute on function public.request_campaign_join(text,text,text) to authenticated;
grant execute on function public.resolve_campaign_join(text,uuid,boolean) to authenticated;

-- Realtime is a convenience; normal automatic/manual sync also refreshes requests.
-- Enforce the same public projection for writes from older clients too. Private originals
-- stay in their owner's sync_entities; this only changes the shared mirror on its next write.
create or replace function public.public_party_character()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.payload is not null then
    new.payload := jsonb_set(jsonb_set(new.payload, '{build,journal}', '{}'::jsonb), '{events}', '[]'::jsonb);
  end if;
  return new;
end;
$$;
revoke all on function public.public_party_character() from public, anon, authenticated;
drop trigger if exists party_character_public on public.party_entities;
create trigger party_character_public before insert or update on public.party_entities
  for each row execute function public.public_party_character();

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
    and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='campaign_join_requests') then
    alter publication supabase_realtime add table public.campaign_join_requests;
  end if;
end $$;
