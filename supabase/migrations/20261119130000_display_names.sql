-- M43: display names are 3 to 24 characters after trimming and unique ignoring case.
-- The name is reserved when the account is created (signup trigger), and anyone can ask
-- whether a name is free before signing up.
--
-- Shared names stop this migration on purpose: nobody is renamed without asking. To list them:
--   select lower(trim(display_name)) as name, count(*) from public.profiles
--   group by 1 having count(*) > 1;
-- Ask those players to pick new names (Settings > Account), then run this file again.

do $$
declare
  v_shared text;
begin
  select string_agg(name, ', ' order by name) into v_shared from (
    select lower(trim(display_name)) as name from public.profiles
    group by 1 having count(*) > 1
  ) duplicates;
  if v_shared is not null then
    raise exception 'These display names are used by more than one account: %. Ask those players to rename, then run this migration again.', v_shared;
  end if;
end;
$$;

create unique index if not exists profiles_display_name_unique
  on public.profiles (lower(trim(display_name)));

-- New and changed names must fit. Older names outside the range stay until their owner
-- renames; the app asks them to.
alter table public.profiles drop constraint if exists profiles_display_name_shape;
alter table public.profiles add constraint profiles_display_name_shape
  check (char_length(display_name) between 3 and 24 and display_name = trim(display_name))
  not valid;

-- True when no other account uses the name. Callable before sign-in so signup can check
-- while the player types. It reveals only whether a name is in use, never who uses it.
create or replace function public.display_name_available(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select char_length(trim(coalesce(p_name, ''))) between 3 and 24
    and not exists (
      select 1 from public.profiles
      where lower(trim(display_name)) = lower(trim(p_name))
        and user_id is distinct from (select auth.uid())
    );
$$;

revoke all on function public.display_name_available(text) from public;
grant execute on function public.display_name_available(text) to anon, authenticated;

-- Create the profile from the name sent with signup. A taken name fails the unique index,
-- which cancels the signup, so the name and the account are created together or not at all.
-- Signups without a name (older app versions) get no profile; the app asks for one later.
create or replace function public.create_profile_from_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
begin
  if v_name <> '' then
    insert into public.profiles (user_id, display_name) values (new.id, v_name);
  end if;
  return new;
end;
$$;

revoke all on function public.create_profile_from_signup() from public, anon, authenticated;

drop trigger if exists create_profile_from_signup on auth.users;
create trigger create_profile_from_signup
  after insert on auth.users
  for each row execute function public.create_profile_from_signup();
