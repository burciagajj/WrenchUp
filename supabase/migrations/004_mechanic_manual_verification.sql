-- Manual mechanic verification fields
alter table if exists public.user_profiles
  add column if not exists verification_status text
    check (verification_status in ('pending_review', 'approved', 'rejected')),
  add column if not exists id_document_url text,
  add column if not exists certification_document_url text,
  add column if not exists mechanic_attested_no_criminal_record boolean,
  add column if not exists mechanic_attested_at timestamptz;

create index if not exists user_profiles_verification_status_idx
  on public.user_profiles (verification_status);
