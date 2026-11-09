-- OmniDnD profiles (milestone M22): one display name per account.
-- Shown to party members later (M24); the email is never stored here or shown to others.

create table if not exists public.profiles (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now(),
  primary key (user_id)
);

comment on table public.profiles is
  'OmniDnD display names. Each account reads and writes only its own row until party sharing (M24).';

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

drop policy if exists "Users read their own profile" on public.profiles;
create policy "Users read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users add their own profile" on public.profiles;
create policy "Users add their own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users change their own profile" on public.profiles;
create policy "Users change their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No delete policy: the row goes when the account is deleted (cascade).

revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;
