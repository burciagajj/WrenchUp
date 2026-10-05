-- Yojitan — Step 34: required, admin-approved profile (face) photo
--
-- Both customers and mechanics must submit a camera-captured profile photo
-- during signup, and it must be approved by an admin before the account can
-- be used (see app/approval-pending.tsx, shared by both roles).
-- Reuses the existing `avatar_url` column/`profile-photos` bucket rather than
-- introducing a separate face-photo column, so the ~11 existing render sites
-- (components/avatar.tsx callers) keep working unmodified — moderation is
-- layered on top via avatar_status.

alter table if exists public.user_profiles
  add column if not exists avatar_status text not null default 'pending_review',
  add column if not exists avatar_submitted_at timestamptz,
  add column if not exists avatar_reviewed_at timestamptz,
  add column if not exists avatar_reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists avatar_rejection_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_profiles_avatar_status_check'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_avatar_status_check
      check (avatar_status in ('pending_review', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists user_profiles_avatar_status_idx on public.user_profiles(avatar_status);
create index if not exists user_profiles_avatar_reviewed_by_idx on public.user_profiles(avatar_reviewed_by);

-- Grandfather existing users who already have a photo on file — they were
-- uploaded under the old unmoderated flow, don't lock out active accounts.
-- Anyone without an existing avatar_url stays pending_review and will be
-- prompted (and gated) to submit one, since the requirement is now mandatory.
update public.user_profiles
set
  avatar_status = 'approved',
  avatar_submitted_at = coalesce(avatar_submitted_at, created_at, now()),
  avatar_reviewed_at = coalesce(avatar_reviewed_at, now())
where avatar_url is not null
  and avatar_status = 'pending_review';
