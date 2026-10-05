-- Server-side guard against booking a service_request with a scheduled_for
-- timestamp in the past. The client already blocks this in the UI, but
-- service_requests are written directly from the client to PostgREST (no
-- intermediate API route), so this is the only real server-side checkpoint.
--
-- Implemented as a BEFORE INSERT trigger (not a CHECK constraint) because a
-- CHECK constraint comparing scheduled_for to now() would also re-validate on
-- every future UPDATE of an existing row (e.g. completing/cancelling an old
-- booked job long after its scheduled_for has naturally passed), which would
-- incorrectly block those legitimate updates. A trigger scoped to INSERT only
-- validates the moment a new booking is created.

create or replace function public.enforce_scheduled_for_not_past()
returns trigger
language plpgsql
as $$
begin
  if new.scheduled_for is not null and new.scheduled_for < (now() - interval '15 minutes') then
    raise exception 'scheduled_for cannot be in the past (%)', new.scheduled_for
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_service_requests_scheduled_for_not_past on public.service_requests;

create trigger trg_service_requests_scheduled_for_not_past
  before insert on public.service_requests
  for each row
  execute function public.enforce_scheduled_for_not_past();
