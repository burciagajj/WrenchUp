-- Yojitan — Step 16: admin review operations, mechanic document review metadata, and dispute notes

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'user_profiles_role_check'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles drop constraint user_profiles_role_check;
  end if;
end $$;

alter table public.user_profiles
  add constraint user_profiles_role_check
  check (role in ('customer', 'mechanic', 'admin'));

alter table if exists public.user_profiles
  add column if not exists insurance_document_url text,
  add column if not exists license_expires_at date,
  add column if not exists insurance_expires_at date,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists rejection_reason text;

create index if not exists user_profiles_reviewed_by_idx on public.user_profiles(reviewed_by);
create index if not exists user_profiles_license_expires_idx on public.user_profiles(license_expires_at);
create index if not exists user_profiles_insurance_expires_idx on public.user_profiles(insurance_expires_at);

alter table if exists public.service_disputes
  add column if not exists admin_notes text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

alter table if exists public.safety_reports
  add column if not exists admin_notes text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

alter table if exists public.safety_flags
  add column if not exists admin_notes text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

create index if not exists service_disputes_reviewed_by_idx on public.service_disputes(reviewed_by);
create index if not exists safety_reports_reviewed_by_idx on public.safety_reports(reviewed_by);
create index if not exists safety_flags_reviewed_by_idx on public.safety_flags(reviewed_by);

insert into storage.buckets (id, name, public)
values ('mechanic-documents', 'mechanic-documents', false)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public)
values ('service-evidence', 'service-evidence', false)
on conflict (id) do update set public = false;
