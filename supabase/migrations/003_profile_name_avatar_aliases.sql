-- Align user_profiles columns with app (full_name, avatar_url)
-- Safe to re-run if columns already exist

alter table public.user_profiles
  add column if not exists full_name text,
  add column if not exists avatar_url text,
  add column if not exists bio text;

-- Legacy rename (only if old columns exist from an earlier schema)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_profiles' and column_name = 'name'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_profiles' and column_name = 'full_name'
  ) then
    alter table public.user_profiles rename column name to full_name;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_profiles' and column_name = 'photo_url'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_profiles' and column_name = 'avatar_url'
  ) then
    alter table public.user_profiles rename column photo_url to avatar_url;
  end if;
end $$;
