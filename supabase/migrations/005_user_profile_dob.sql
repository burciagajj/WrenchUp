alter table if exists public.user_profiles
  add column if not exists date_of_birth date;
