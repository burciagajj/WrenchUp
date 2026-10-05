-- Real penalty tracking for mechanic-initiated cancellations of jobs they had
-- already committed to (accepted/enroute/arrived/in_progress, or a booked job
-- they'd been assigned). Previously the cancel-booked UI implied there was a
-- fairness policy behind this ("keep the booking experience reliable and
-- fair") but nothing tracked or enforced it.
--
-- Policy: each qualifying cancellation is a "strike". Strikes reset if the
-- mechanic's last strike was more than 30 days ago (rolling window, no
-- separate events table needed). Reaching 3 strikes within the window
-- throttles the mechanic from receiving new offers for 24h.

alter table public.user_profiles
  add column if not exists mechanic_cancel_strikes integer not null default 0,
  add column if not exists mechanic_last_cancel_at timestamptz,
  add column if not exists mechanic_offer_throttled_until timestamptz;

-- Fast lookup used by routing to exclude currently-throttled mechanics.
create index if not exists user_profiles_offer_throttle_idx
  on public.user_profiles (mechanic_offer_throttled_until)
  where mechanic_offer_throttled_until is not null;

comment on column public.user_profiles.mechanic_cancel_strikes is
  'Rolling count of mechanic-initiated cancellations of already-committed jobs. Resets when mechanic_last_cancel_at is more than 30 days old.';
comment on column public.user_profiles.mechanic_offer_throttled_until is
  'While set and in the future, routing excludes this mechanic from new offers (see fetchOnlineMechanics / fetchNextMechanic).';

-- user_profiles is select-restricted to each user's own row (see
-- user_profiles_select_own policy), so client-side routing — which runs with
-- the customer's own session token, not a service role — can't just SELECT
-- other mechanics' throttle status directly. This narrow SECURITY DEFINER
-- function exposes only "which of these candidate ids are currently
-- throttled", nothing else from the profile row.
create or replace function public.mechanic_offer_throttled_ids(candidate_ids uuid[])
returns table(user_id uuid)
language sql
security definer
set search_path = public
as $$
  select user_id
  from public.user_profiles
  where user_id = any(candidate_ids)
    and mechanic_offer_throttled_until is not null
    and mechanic_offer_throttled_until > now();
$$;

grant execute on function public.mechanic_offer_throttled_ids(uuid[]) to authenticated;
