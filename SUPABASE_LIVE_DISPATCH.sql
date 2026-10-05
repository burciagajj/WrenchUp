-- Legacy live-dispatch SQL helper.
-- Source of truth now lives in supabase/migrations/008_live_dispatch_tables.sql.
-- Keep this only as a reference for manual dashboard runs.

create table if not exists public.mechanic_presence (
  mechanic_user_id uuid primary key references auth.users(id) on delete cascade,
  mechanic_name text,
  is_online boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.mechanic_presence enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mechanic_presence' and policyname = 'mechanic_presence_read'
  ) then
    create policy mechanic_presence_read on public.mechanic_presence
      for select using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mechanic_presence' and policyname = 'mechanic_presence_write_self'
  ) then
    create policy mechanic_presence_write_self on public.mechanic_presence
      for all using (auth.uid() = mechanic_user_id) with check (auth.uid() = mechanic_user_id);
  end if;
end $$;

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null references auth.users(id) on delete cascade,
  customer_name text,
  service_code text not null,
  vehicle_label text not null,
  location_label text not null,
  offered_price numeric(10,2) not null,
  currency text not null default 'USD',
  status text not null default 'searching',
  assigned_mechanic_user_id uuid references auth.users(id) on delete set null,
  assigned_mechanic_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_requests_status_idx on public.service_requests(status, created_at);
create index if not exists service_requests_customer_idx on public.service_requests(customer_user_id, created_at desc);
create index if not exists service_requests_mechanic_idx on public.service_requests(assigned_mechanic_user_id, created_at desc);

alter table public.service_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'service_requests' and policyname = 'service_requests_insert_customer'
  ) then
    create policy service_requests_insert_customer on public.service_requests
      for insert with check (auth.uid() = customer_user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'service_requests' and policyname = 'service_requests_read_related'
  ) then
    create policy service_requests_read_related on public.service_requests
      for select using (
        auth.uid() = customer_user_id
        or auth.uid() = assigned_mechanic_user_id
        or status = 'searching'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'service_requests' and policyname = 'service_requests_customer_update'
  ) then
    create policy service_requests_customer_update on public.service_requests
      for update using (auth.uid() = customer_user_id) with check (auth.uid() = customer_user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'service_requests' and policyname = 'service_requests_mechanic_update'
  ) then
    create policy service_requests_mechanic_update on public.service_requests
      for update using (
        assigned_mechanic_user_id is null or auth.uid() = assigned_mechanic_user_id
      )
      with check (
        assigned_mechanic_user_id is null or auth.uid() = assigned_mechanic_user_id
      );
  end if;
end $$;

-- Enable Supabase Realtime for instant customer/mechanic status pushes (removes polling lag)
-- Run this once in SQL Editor after the table + policies exist:
--   alter publication supabase_realtime add table public.service_requests;
--   alter publication supabase_realtime add table public.mechanic_presence;
--
-- IMPORTANT: Realtime respects RLS. The existing read policies already allow the customer
-- and assigned mechanic to receive changes for their rows (and searching board for presence).
-- After enabling, add @supabase/supabase-js (or use native WS) and subscribe:
--   supabase.channel('dispatch')
--     .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests', filter: `id=eq.${requestId}` }, (payload) => { ... })
--     .subscribe()
--
-- This is the production path to replace the adaptive polling in CustomerLiveJobSync.
