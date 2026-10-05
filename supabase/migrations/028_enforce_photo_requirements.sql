-- Server-side enforcement of before/after evidence photos.
--
-- app/mechanic/active.tsx's advance() already blocks progression client-side
-- if beforePhotoUri/afterPhotoUri aren't captured, but service_requests is
-- written directly from the client to PostgREST (no intermediate API route),
-- so a determined/buggy client could PATCH straight past that check. This
-- trigger is the real enforcement point.
--
-- Flow recap:
--   ... -> status="in_progress" (mechanic starts work) requires before_photo_url
--   mechanic later sets mechanic_marked_done_at + after_photo_url, status stays
--     "in_progress" until the customer confirms
--   customer confirmation -> status="completed" requires after_photo_url
--
-- Scoped to the transition INTO each status (OLD.status is distinct from
-- NEW.status), not every update of an already-in-progress/completed row, so
-- unrelated later updates (rating, tip, dispute fields, etc.) aren't blocked.

create or replace function public.enforce_service_request_photo_requirements()
returns trigger
language plpgsql
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

drop trigger if exists trg_service_requests_photo_requirements on public.service_requests;

create trigger trg_service_requests_photo_requirements
  before update on public.service_requests
  for each row
  execute function public.enforce_service_request_photo_requirements();
