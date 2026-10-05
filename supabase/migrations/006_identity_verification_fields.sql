-- Identity + mechanic verification extensions
-- Safe to re-run.

alter table if exists public.user_profiles
  add column if not exists display_name text,
  add column if not exists phone_number text,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists business_license_document_url text;

create index if not exists user_profiles_phone_number_idx
  on public.user_profiles (phone_number);

create index if not exists user_profiles_phone_verified_at_idx
  on public.user_profiles (phone_verified_at);
