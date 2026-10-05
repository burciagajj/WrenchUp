-- Backfill: applied to the live project on 2026-09-09 as
-- "add_durable_rate_limit_bucket" but never saved to the repo.
create table if not exists public.rate_limit_buckets (
  key text primary key,
  count int not null default 0,
  window_start timestamptz not null default now()
);

alter table public.rate_limit_buckets enable row level security;
-- No policies added: this table is only ever touched via the
-- SECURITY DEFINER function below, called with the service role key from
-- server-side API routes. No direct client access is intended.

create or replace function public.check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_allowed boolean;
begin
  insert into public.rate_limit_buckets (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
    set count = case
          when rate_limit_buckets.window_start <= now() - make_interval(secs => p_window_seconds)
            then 1
          else rate_limit_buckets.count + 1
        end,
        window_start = case
          when rate_limit_buckets.window_start <= now() - make_interval(secs => p_window_seconds)
            then now()
          else rate_limit_buckets.window_start
        end
  returning count into v_count;

  v_allowed := v_count <= p_limit;
  return v_allowed;
end;
$$;

revoke all on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;
revoke all on public.rate_limit_buckets from public, anon, authenticated;
