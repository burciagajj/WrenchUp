-- WrenchUp — Step 1: user_profiles, user_vehicles, jobs + RLS
-- Run in Supabase Dashboard → SQL Editor → New query → Run
-- Project: https://supabase.com/dashboard/project/_/sql

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- user_profiles
-- Matches lib/_core/supabase-user-data.ts (snake_case columns)
-- ---------------------------------------------------------------------------
create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  role text not null check (role in ('customer', 'mechanic')),
  name text,
  bio text,
  photo_url text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_profiles_user_id_idx on public.user_profiles (user_id);

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_vehicles
-- ---------------------------------------------------------------------------
create table if not exists public.user_vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nickname text not null,
  year integer not null check (year >= 1950 and year <= extract(year from now())::integer + 1),
  make text not null,
  model text not null,
  color text,
  plate text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_vehicles_user_id_idx on public.user_vehicles (user_id);
create index if not exists user_vehicles_user_id_created_at_idx
  on public.user_vehicles (user_id, created_at desc);

-- Only one active vehicle per customer
create unique index if not exists user_vehicles_one_active_per_user
  on public.user_vehicles (user_id)
  where is_active = true;

drop trigger if exists user_vehicles_set_updated_at on public.user_vehicles;
create trigger user_vehicles_set_updated_at
  before update on public.user_vehicles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- jobs
-- Customer bookings + mechanic dispatch (lib/types.ts Job / MechanicJob)
-- ---------------------------------------------------------------------------
create table if not exists public.jobs (
  id text primary key,
  customer_id uuid not null references auth.users (id) on delete cascade,
  -- Seed mechanic id from app (e.g. "m1"); set at booking time
  mechanic_id text not null,
  -- Supabase auth user id of mechanic who accepted (null while searching)
  mechanic_user_id uuid references auth.users (id) on delete set null,
  vehicle_id uuid references public.user_vehicles (id) on delete set null,
  service text not null check (
    service in (
      'battery_jump',
      'flat_tire',
      'oil_change',
      'brake_service',
      'diagnostic',
      'engine_repair',
      'ac_service',
      'general_checkup'
    )
  ),
  location text not null,
  status text not null default 'searching' check (
    status in (
      'searching',
      'accepted',
      'enroute',
      'arrived',
      'in_progress',
      'completed',
      'cancelled'
    )
  ),
  fare jsonb not null default '{"base":0,"service":0,"distance":0,"total":0}'::jsonb,
  pickup jsonb,
  mechanic_start jsonb,
  tip numeric(10, 2),
  rating smallint check (rating is null or (rating >= 1 and rating <= 5)),
  rating_comment text,
  payment_method_id text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists jobs_customer_id_idx on public.jobs (customer_id);
create index if not exists jobs_mechanic_user_id_idx on public.jobs (mechanic_user_id);
create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_searching_idx on public.jobs (status, created_at desc)
  where status = 'searching';

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.user_profiles enable row level security;
alter table public.user_vehicles enable row level security;
alter table public.jobs enable row level security;

-- user_profiles
drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own"
  on public.user_profiles for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own"
  on public.user_profiles for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own"
  on public.user_profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "user_profiles_delete_own" on public.user_profiles;
create policy "user_profiles_delete_own"
  on public.user_profiles for delete
  to authenticated
  using (user_id = auth.uid());

-- user_vehicles
drop policy if exists "user_vehicles_select_own" on public.user_vehicles;
create policy "user_vehicles_select_own"
  on public.user_vehicles for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_vehicles_insert_own" on public.user_vehicles;
create policy "user_vehicles_insert_own"
  on public.user_vehicles for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_vehicles_update_own" on public.user_vehicles;
create policy "user_vehicles_update_own"
  on public.user_vehicles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "user_vehicles_delete_own" on public.user_vehicles;
create policy "user_vehicles_delete_own"
  on public.user_vehicles for delete
  to authenticated
  using (user_id = auth.uid());

-- jobs — customers
drop policy if exists "jobs_customer_select_own" on public.jobs;
create policy "jobs_customer_select_own"
  on public.jobs for select
  to authenticated
  using (customer_id = auth.uid());

drop policy if exists "jobs_customer_insert_own" on public.jobs;
create policy "jobs_customer_insert_own"
  on public.jobs for insert
  to authenticated
  with check (
    customer_id = auth.uid()
    and mechanic_user_id is null
    and status = 'searching'
  );

drop policy if exists "jobs_customer_update_own" on public.jobs;
create policy "jobs_customer_update_own"
  on public.jobs for update
  to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

-- jobs — mechanics: see open requests + jobs they accepted
drop policy if exists "jobs_mechanic_select_open" on public.jobs;
create policy "jobs_mechanic_select_open"
  on public.jobs for select
  to authenticated
  using (
    public.is_mechanic()
    and (
      status = 'searching'
      or mechanic_user_id = auth.uid()
    )
  );

drop policy if exists "jobs_mechanic_accept" on public.jobs;
create policy "jobs_mechanic_accept"
  on public.jobs for update
  to authenticated
  using (
    public.is_mechanic()
    and status = 'searching'
    and mechanic_user_id is null
  )
  with check (
    public.is_mechanic()
    and mechanic_user_id = auth.uid()
    and status in ('accepted', 'enroute', 'arrived', 'in_progress', 'completed', 'cancelled')
  );

drop policy if exists "jobs_mechanic_update_assigned" on public.jobs;
create policy "jobs_mechanic_update_assigned"
  on public.jobs for update
  to authenticated
  using (
    public.is_mechanic()
    and mechanic_user_id = auth.uid()
  )
  with check (
    mechanic_user_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- Grants (authenticated role used by the mobile app)
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;

grant select, insert, update, delete on public.user_profiles to authenticated;
grant select, insert, update, delete on public.user_vehicles to authenticated;
grant select, insert, update on public.jobs to authenticated;

-- Optional: enable Realtime for jobs in step 2
-- alter publication supabase_realtime add table public.jobs;
