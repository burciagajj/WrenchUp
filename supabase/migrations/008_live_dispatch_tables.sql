-- Yojitan — Step 8: live dispatch tables and RLS
-- Source of truth for live customer <-> mechanic dispatch.
-- Mirrors the legacy SUPABASE_LIVE_DISPATCH.sql helper in the repo root.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_mechanic()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles p
    where p.user_id = auth.uid()
      and p.role = 'mechanic'
  );
$$;

create table if not exists public.mechanic_presence (
  mechanic_user_id uuid primary key references auth.users(id) on delete cascade,
  mechanic_name text,
  is_online boolean not null default false,
  region_code text,
  updated_at timestamptz not null default now()
);

alter table if exists public.mechanic_presence
  add column if not exists region_code text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'mechanic_presence_region_code_check'
      and conrelid = 'public.mechanic_presence'::regclass
  ) then
    alter table public.mechanic_presence
      add constraint mechanic_presence_region_code_check
      check (region_code in ('US', 'MX'));
  end if;
end $$;

create index if not exists mechanic_presence_is_online_idx
  on public.mechanic_presence (is_online, updated_at desc);

alter table public.mechanic_presence enable row level security;

drop policy if exists "mechanic_presence_read" on public.mechanic_presence;
create policy "mechanic_presence_read"
  on public.mechanic_presence for select
  to authenticated
  using (true);

drop policy if exists "mechanic_presence_write_self" on public.mechanic_presence;
create policy "mechanic_presence_write_self"
  on public.mechanic_presence for all
  to authenticated
  using (auth.uid() = mechanic_user_id)
  with check (auth.uid() = mechanic_user_id);

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null references auth.users(id) on delete cascade,
  customer_name text,
  customer_photo_url text,
  service_code text not null,
  vehicle_label text not null,
  location_label text not null,
  offered_price numeric(10,2) not null,
  currency text not null default 'USD',
  oil_package text check (oil_package in ('conventional', 'synthetic_blend', 'full_synthetic')),
  scheduled_for timestamptz,
  customer_note text,
  customer_has_parts boolean,
  issue_photo_url text,
  platform_fee_rate numeric(6,4),
  platform_fee_amount numeric(10,2),
  mechanic_payout numeric(10,2),
  status text not null default 'searching',
  assigned_mechanic_user_id uuid references auth.users(id) on delete set null,
  assigned_mechanic_name text,
  mechanic_latitude numeric,
  mechanic_longitude numeric,
  mechanic_marked_done_at timestamptz,
  customer_completed_at timestamptz,
  payment_state text,
  dispute_window_ends_at timestamptz,
  funds_release_at timestamptz,
  before_photo_url text,
  after_photo_url text,
  receipt_number text,
  region_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_requests_status_check check (
    status in ('searching', 'accepted', 'enroute', 'arrived', 'in_progress', 'completed', 'cancelled')
  )
);

alter table if exists public.service_requests
  add column if not exists region_code text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'service_requests_region_code_check'
      and conrelid = 'public.service_requests'::regclass
  ) then
    alter table public.service_requests
      add constraint service_requests_region_code_check
      check (region_code in ('US', 'MX'));
  end if;
end $$;

create index if not exists service_requests_status_idx on public.service_requests(status, created_at);
create index if not exists service_requests_customer_idx on public.service_requests(customer_user_id, created_at desc);
create index if not exists service_requests_mechanic_idx on public.service_requests(assigned_mechanic_user_id, created_at desc);
create index if not exists service_requests_region_idx on public.service_requests(region_code, status, created_at desc);
create index if not exists service_requests_receipt_idx on public.service_requests(receipt_number);

drop trigger if exists service_requests_set_updated_at on public.service_requests;
create trigger service_requests_set_updated_at
  before update on public.service_requests
  for each row execute function public.set_updated_at();

alter table public.service_requests enable row level security;

drop policy if exists "service_requests_insert_customer" on public.service_requests;
create policy "service_requests_insert_customer"
  on public.service_requests for insert
  to authenticated
  with check (auth.uid() = customer_user_id);

drop policy if exists "service_requests_read_related" on public.service_requests;
create policy "service_requests_read_related"
  on public.service_requests for select
  to authenticated
  using (
    auth.uid() = customer_user_id
    or auth.uid() = assigned_mechanic_user_id
    or (status = 'searching' and public.is_mechanic())
  );

drop policy if exists "service_requests_customer_update" on public.service_requests;
create policy "service_requests_customer_update"
  on public.service_requests for update
  to authenticated
  using (auth.uid() = customer_user_id)
  with check (auth.uid() = customer_user_id);

drop policy if exists "service_requests_mechanic_update" on public.service_requests;
create policy "service_requests_mechanic_update"
  on public.service_requests for update
  to authenticated
  using (assigned_mechanic_user_id is null or auth.uid() = assigned_mechanic_user_id)
  with check (assigned_mechanic_user_id is null or auth.uid() = assigned_mechanic_user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.mechanic_presence to authenticated;
grant select, insert, update, delete on public.service_requests to authenticated;

-- Optional realtime:
-- alter publication supabase_realtime add table public.service_requests;
-- alter publication supabase_realtime add table public.mechanic_presence;
