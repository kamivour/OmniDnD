-- OmniDnD profile pictures (milestone M43): a small JPEG data URL in the profile row.
-- Party members already read each other's profiles, so no new access rules are needed.
-- The app crops pictures to 256 px squares; the cap allows about 100 KB of JPEG.

alter table public.profiles add column if not exists avatar text;

alter table public.profiles drop constraint if exists profiles_avatar_shape;
alter table public.profiles add constraint profiles_avatar_shape
  check (
    avatar is null
    or (avatar like 'data:image/jpeg;base64,%' and char_length(avatar) <= 140000)
  );

comment on column public.profiles.avatar is
  'Optional 256 px JPEG data URL chosen by the account owner. Null shows the default mask.';
