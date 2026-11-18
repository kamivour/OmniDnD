-- M43: choose DM or Player when joining, take an empty DM seat, or step down.
-- Additive: the old join_campaign(text) stays for older clients and still joins as a player.
-- Claims lock the campaign row, so two people claiming at once leave exactly one DM; the
-- campaign_members_one_dm unique index is the final guard.

create or replace function public.claim_dm(p_campaign text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_dm uuid;
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;
  if not exists (
    select 1 from public.campaign_members where campaign_id = p_campaign and user_id = v_user
  ) then
    raise exception 'Join this campaign first';
  end if;
  perform 1 from public.shared_campaigns where id = p_campaign for update;
  select user_id into v_dm from public.campaign_members
  where campaign_id = p_campaign and role = 'dm';
  if v_dm = v_user then
    return;
  end if;
  if v_dm is not null then
    raise exception 'The DM seat is taken by %',
      coalesce((select display_name from public.profiles where user_id = v_dm), 'another member');
  end if;
  begin
    update public.campaign_members set role = 'dm'
    where campaign_id = p_campaign and user_id = v_user;
  exception when unique_violation then
    raise exception 'Someone took the DM seat first. Refresh to see who.';
  end;
end;
$$;

-- The current DM becomes a player. The campaign record falls back to its owner.
create or replace function public.release_dm(p_campaign text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.campaign_members set role = 'player'
  where campaign_id = p_campaign and user_id = (select auth.uid()) and role = 'dm';
$$;

-- Join with a seat. Choosing DM joins and claims in one transaction, so a taken seat
-- leaves the caller outside the campaign and free to join as a player instead.
create or replace function public.join_campaign(p_code text, p_role text)
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
  if p_role is null or p_role not in ('dm', 'player') then
    raise exception 'Role must be dm or player';
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
  if p_role = 'dm' then
    perform public.claim_dm(v_campaign);
  end if;
  return v_campaign;
end;
$$;

-- The invite preview also says whether the seat is taken, even when the DM has no name yet.
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
      'has_dm', exists (
        select 1 from public.campaign_members where campaign_id = c.id and role = 'dm'
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

do $$
declare
  f text;
begin
  foreach f in array array[
    'claim_dm(text)',
    'release_dm(text)',
    'join_campaign(text, text)',
    'preview_invite(text)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('revoke all on function public.%s from anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
