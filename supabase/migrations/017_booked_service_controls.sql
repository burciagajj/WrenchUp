-- Yojitan — Step 17: booked service modification + mechanic cancellation reasons

alter table if exists public.service_requests
  add column if not exists cancel_reason text,
  add column if not exists cancelled_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists cancelled_by_role text,
  add column if not exists cancelled_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'service_requests_cancelled_by_role_check'
      and conrelid = 'public.service_requests'::regclass
  ) then
    alter table public.service_requests
      add constraint service_requests_cancelled_by_role_check
      check (cancelled_by_role in ('customer', 'mechanic'));
  end if;
end $$;

create index if not exists service_requests_cancelled_at_idx on public.service_requests(cancelled_at desc);
