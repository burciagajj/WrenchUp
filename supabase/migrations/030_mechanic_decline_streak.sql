-- Consecutive-decline tracking: repeatedly declining incoming offers without
-- ever accepting one now temporarily throttles a mechanic from new offers,
-- same mechanism as the cancellation-strike throttle added in migration 029.

alter table public.user_profiles
  add column if not exists mechanic_consecutive_declines integer not null default 0,
  add column if not exists mechanic_last_decline_at timestamptz;

comment on column public.user_profiles.mechanic_consecutive_declines is
  'Rolling streak of declined/unaccepted offers. Resets when mechanic_last_decline_at is more than 2 hours old.';

-- Important: user_profiles rows are self-updatable by their owner
-- (user_profiles_update_own), which is correct for profile fields like
-- full_name/bio/avatar_url — but it also means a mechanic could otherwise
-- PATCH their own mechanic_cancel_strikes / mechanic_offer_throttled_until /
-- mechanic_consecutive_declines directly to erase their own penalty state.
-- This trigger makes those specific columns write-once-from-service-role:
-- any change attempted by a normal user session is silently reverted back to
-- its prior value, while the service-role sweeps/cancel-service (which
-- authenticate as service_role, bypassing this check) can still update them.
create or replace function public.protect_mechanic_penalty_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.mechanic_cancel_strikes := old.mechanic_cancel_strikes;
    new.mechanic_last_cancel_at := old.mechanic_last_cancel_at;
    new.mechanic_offer_throttled_until := old.mechanic_offer_throttled_until;
    new.mechanic_consecutive_declines := old.mechanic_consecutive_declines;
    new.mechanic_last_decline_at := old.mechanic_last_decline_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_mechanic_penalty_columns on public.user_profiles;

create trigger trg_protect_mechanic_penalty_columns
  before update on public.user_profiles
  for each row
  execute function public.protect_mechanic_penalty_columns();
