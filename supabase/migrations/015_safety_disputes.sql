-- Yojitan — Step 15: persisted safety reports, disputes, and tighter dispatch privacy

alter table if exists public.service_requests
  add column if not exists mechanic_enroute_at timestamptz,
  add column if not exists mechanic_arrived_at timestamptz,
  add column if not exists job_started_at timestamptz,
  add column if not exists job_completed_at timestamptz,
  add column if not exists dispute_opened_at timestamptz,
  add column if not exists safety_flag_count integer not null default 0;

insert into storage.buckets (id, name, public)
values ('service-evidence', 'service-evidence', false)
on conflict (id) do nothing;

create table if not exists public.service_disputes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('customer', 'mechanic')),
  reason text not null,
  message text,
  photo_urls text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'rejected'))
);

create table if not exists public.safety_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  request_id uuid references public.service_requests(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('customer', 'mechanic')),
  report_type text not null check (report_type in ('emergency', 'safety_issue', 'unsafe_situation', 'customer_no_show', 'safety_cancellation')),
  message text,
  photo_urls text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved')),
  admin_flag boolean not null default true
);

create table if not exists public.safety_flags (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete cascade,
  request_id uuid references public.service_requests(id) on delete set null,
  flag_type text not null check (flag_type in ('too_many_cancellations', 'repeated_disputes', 'failed_payments', 'duplicate_phone_or_device', 'safety_report')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  details jsonb not null default '{}'::jsonb
);

create index if not exists service_disputes_request_idx on public.service_disputes(request_id, created_at desc);
create index if not exists service_disputes_user_idx on public.service_disputes(user_id, created_at desc);
create index if not exists service_disputes_status_idx on public.service_disputes(status, created_at desc);
create index if not exists safety_reports_request_idx on public.safety_reports(request_id, created_at desc);
create index if not exists safety_reports_user_idx on public.safety_reports(user_id, created_at desc);
create index if not exists safety_reports_status_idx on public.safety_reports(status, created_at desc);
create index if not exists safety_flags_user_idx on public.safety_flags(user_id, created_at desc);
create index if not exists safety_flags_status_idx on public.safety_flags(status, severity, created_at desc);

drop trigger if exists service_disputes_set_updated_at on public.service_disputes;
create trigger service_disputes_set_updated_at
  before update on public.service_disputes
  for each row execute function public.set_updated_at();

drop trigger if exists safety_reports_set_updated_at on public.safety_reports;
create trigger safety_reports_set_updated_at
  before update on public.safety_reports
  for each row execute function public.set_updated_at();

drop trigger if exists safety_flags_set_updated_at on public.safety_flags;
create trigger safety_flags_set_updated_at
  before update on public.safety_flags
  for each row execute function public.set_updated_at();

alter table public.service_disputes enable row level security;
alter table public.safety_reports enable row level security;
alter table public.safety_flags enable row level security;

drop policy if exists "service_disputes_select_participant" on public.service_disputes;
create policy "service_disputes_select_participant"
  on public.service_disputes for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.service_requests sr
      where sr.id = service_disputes.request_id
        and (auth.uid() = sr.customer_user_id or auth.uid() = sr.assigned_mechanic_user_id)
    )
  );

drop policy if exists "service_disputes_insert_participant" on public.service_disputes;
create policy "service_disputes_insert_participant"
  on public.service_disputes for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.service_requests sr
      where sr.id = service_disputes.request_id
        and (auth.uid() = sr.customer_user_id or auth.uid() = sr.assigned_mechanic_user_id)
    )
  );

drop policy if exists "safety_reports_select_own" on public.safety_reports;
create policy "safety_reports_select_own"
  on public.safety_reports for select
  to authenticated
  using (
    auth.uid() = user_id
    or (
      request_id is not null
      and exists (
        select 1 from public.service_requests sr
        where sr.id = safety_reports.request_id
          and (auth.uid() = sr.customer_user_id or auth.uid() = sr.assigned_mechanic_user_id)
      )
    )
  );

drop policy if exists "safety_reports_insert_own" on public.safety_reports;
create policy "safety_reports_insert_own"
  on public.safety_reports for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "safety_flags_select_own" on public.safety_flags;
create policy "safety_flags_select_own"
  on public.safety_flags for select
  to authenticated
  using (auth.uid() = user_id);

-- Exact service request data includes full location. Only the customer and assigned mechanic should read it.
drop policy if exists "service_requests_read_related" on public.service_requests;
create policy "service_requests_read_related"
  on public.service_requests for select
  to authenticated
  using (
    auth.uid() = customer_user_id
    or auth.uid() = assigned_mechanic_user_id
  );

drop policy if exists "service_requests_mechanic_update" on public.service_requests;
create policy "service_requests_mechanic_update"
  on public.service_requests for update
  to authenticated
  using (auth.uid() = assigned_mechanic_user_id)
  with check (auth.uid() = assigned_mechanic_user_id);

grant select, insert, update on public.service_disputes to authenticated;
grant select, insert, update on public.safety_reports to authenticated;
grant select on public.safety_flags to authenticated;
