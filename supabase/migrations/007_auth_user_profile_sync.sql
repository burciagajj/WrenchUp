-- Keep public.user_profiles in sync when Supabase Auth creates a user.
-- Safe to re-run.

alter table if exists public.user_profiles
  add column if not exists email text;

create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata jsonb;
  metadata_role text;
  safe_role text;
  metadata_full_name text;
  metadata_display_name text;
begin
  metadata := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  metadata_role := metadata->>'role';
  safe_role := case
    when metadata_role in ('customer', 'mechanic') then metadata_role
    else 'customer'
  end;
  metadata_full_name := nullif(metadata->>'full_name', '');
  metadata_display_name := nullif(coalesce(metadata->>'display_name', metadata_full_name), '');

  insert into public.user_profiles (
    user_id,
    email,
    role,
    full_name,
    display_name,
    verification_status
  )
  values (
    new.id,
    new.email,
    safe_role,
    metadata_full_name,
    metadata_display_name,
    case when safe_role = 'mechanic' then 'pending_review' else null end
  )
  on conflict (user_id) do update
  set
    email = coalesce(public.user_profiles.email, excluded.email),
    role = coalesce(public.user_profiles.role, excluded.role),
    full_name = coalesce(public.user_profiles.full_name, excluded.full_name),
    display_name = coalesce(public.user_profiles.display_name, excluded.display_name),
    verification_status = coalesce(public.user_profiles.verification_status, excluded.verification_status),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_auth_user_profile();

insert into public.user_profiles (
  user_id,
  email,
  role,
  full_name,
  display_name,
  verification_status
)
select
  u.id,
  u.email,
  case
    when u.raw_user_meta_data->>'role' in ('customer', 'mechanic') then u.raw_user_meta_data->>'role'
    else 'customer'
  end as role,
  nullif(u.raw_user_meta_data->>'full_name', '') as full_name,
  nullif(coalesce(u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'full_name'), '') as display_name,
  case when u.raw_user_meta_data->>'role' = 'mechanic' then 'pending_review' else null end as verification_status
from auth.users u
on conflict (user_id) do update
set
  email = coalesce(public.user_profiles.email, excluded.email),
  role = coalesce(public.user_profiles.role, excluded.role),
  full_name = coalesce(public.user_profiles.full_name, excluded.full_name),
  display_name = coalesce(public.user_profiles.display_name, excluded.display_name),
  verification_status = coalesce(public.user_profiles.verification_status, excluded.verification_status),
  updated_at = now();
