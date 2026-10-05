-- Yojitan — Step 13: analytics events and launch dashboard tracking
-- Stores launch analytics in Supabase for the admin dashboard.

create extension if not exists "pgcrypto";

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  role text check (role in ('customer', 'mechanic') or role is null),
  event_name text not null check (
    event_name in (
      'signup_started',
      'signup_completed',
      'request_created',
      'mechanic_matched',
      'mechanic_accepted_request',
      'chat_opened',
      'job_completed',
      'review_submitted',
      'signup_failed',
      'request_failed',
      'match_failed',
      'chat_send_failed',
      'notification_failed',
      'auth_failed',
      'supabase_error'
    )
  ),
  properties jsonb not null default '{}'::jsonb
);

create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at desc);

create index if not exists analytics_events_event_name_created_at_idx
  on public.analytics_events (event_name, created_at desc);

create index if not exists analytics_events_user_id_created_at_idx
  on public.analytics_events (user_id, created_at desc);

create index if not exists analytics_events_region_code_idx
  on public.analytics_events ((properties ->> 'region_code'));

alter table public.analytics_events enable row level security;

drop policy if exists "analytics_events_select_own" on public.analytics_events;
create policy "analytics_events_select_own"
  on public.analytics_events for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "analytics_events_insert_own" on public.analytics_events;
create policy "analytics_events_insert_own"
  on public.analytics_events for insert
  to authenticated
  with check (user_id = auth.uid());

grant select, insert on public.analytics_events to authenticated;

