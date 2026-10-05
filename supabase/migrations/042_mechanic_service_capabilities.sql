-- Service-gated mechanic capabilities — e.g. a mechanic must upload a photo
-- of an approved gasoline container and get it admin-approved before they
-- can be routed "fuel_delivery" jobs (legally required to transport gas).
--
-- Deliberately a separate table from user_profiles' existing verification
-- columns (id_document_url, insurance_document_url, ...): those gate whether
-- someone can be a mechanic on the platform at all, one bundle, reviewed
-- once. This gates individual *service types* on top of that, and is meant
-- to grow — each new gated service is just a new capability_code row, no
-- new migration/columns needed. See lib/service-capabilities.ts for the
-- app-side registry of which service maps to which capability.

create table if not exists public.mechanic_service_capabilities (
  id uuid primary key default gen_random_uuid(),
  mechanic_user_id uuid not null references auth.users(id) on delete cascade,
  capability_code text not null,
  document_url text,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected')),
  rejection_reason text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  updated_at timestamptz not null default now(),
  unique (mechanic_user_id, capability_code)
);

create index if not exists mechanic_service_capabilities_mechanic_idx
  on public.mechanic_service_capabilities (mechanic_user_id);

create index if not exists mechanic_service_capabilities_lookup_idx
  on public.mechanic_service_capabilities (capability_code, status);

alter table public.mechanic_service_capabilities enable row level security;

-- Mechanics can read their own capability rows directly (used by the
-- requirements screen to show upload/pending/approved/rejected status).
-- All writes (submitting a new photo, admin approve/reject) go through
-- service-role API routes (app/api/mechanic-capability-doc+api.ts,
-- app/api/admin/service-capabilities+api.ts) — deliberately no insert/update
-- policy for the authenticated role here, so a mechanic can never approve
-- their own row by writing directly to PostgREST.
create policy "mechanic_service_capabilities_select_own"
  on public.mechanic_service_capabilities
  for select
  using (auth.uid() = mechanic_user_id);

-- Dispatch routing runs with the customer's (or another mechanic's) session
-- token, not a service role, and needs to know which *other* mechanics are
-- approved for a given capability without exposing anything else from this
-- table. Mirrors mechanic_offer_throttled_ids from 029_mechanic_cancel_penalty.sql.
--
-- required_capability = null means "no gate for this service" and returns
-- every candidate unfiltered, so callers can pass through unconditionally
-- for services with no capability requirement.
create or replace function public.mechanic_service_eligible_ids(candidate_ids uuid[], required_capability text)
returns table(user_id uuid)
language sql
security definer
set search_path = public
as $$
  select c.id
  from unnest(candidate_ids) as c(id)
  where required_capability is null
     or exists (
       select 1
       from public.mechanic_service_capabilities cap
       where cap.mechanic_user_id = c.id
         and cap.capability_code = required_capability
         and cap.status = 'approved'
     );
$$;

grant execute on function public.mechanic_service_eligible_ids(uuid[], text) to authenticated;
