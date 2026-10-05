-- Security hardening found via Supabase's advisor lints while building
-- migration 031: two trigger functions from earlier migrations (027, 028)
-- were missing `set search_path`, and a few trigger-only functions were
-- exposed as directly-callable RPC endpoints (harmless here since they
-- require trigger context to run meaningfully, but best practice to close
-- off anyway).

create or replace function public.enforce_scheduled_for_not_past()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.scheduled_for is not null and new.scheduled_for < (now() - interval '15 minutes') then
    raise exception 'scheduled_for cannot be in the past (%)', new.scheduled_for
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_service_request_photo_requirements()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'in_progress' and old.status is distinct from 'in_progress' and new.before_photo_url is null then
    raise exception 'before_photo_url is required to start service (request %)', new.id
      using errcode = '23514';
  end if;

  if new.status = 'completed' and old.status is distinct from 'completed' and new.after_photo_url is null then
    raise exception 'after_photo_url is required to complete service (request %)', new.id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_scheduled_for_not_past() from anon, authenticated;
revoke execute on function public.enforce_service_request_photo_requirements() from anon, authenticated;
revoke execute on function public.protect_mechanic_penalty_columns() from anon, authenticated;
