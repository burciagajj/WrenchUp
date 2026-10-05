-- Yojitan — Step 21: persist service ratings and tip to service_requests for cross-device history
-- This allows completed service data (including ratings) to sync across devices via remote job history.

alter table if exists public.service_requests
  add column if not exists rating smallint,
  add column if not exists tip numeric(10,2),
  add column if not exists rating_comment text;

-- Add check constraint for rating (1-5) if not present
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'service_requests_rating_check'
      and conrelid = 'public.service_requests'::regclass
  ) then
    alter table public.service_requests
      add constraint service_requests_rating_check
      check (rating is null or (rating >= 1 and rating <= 5));
  end if;
end $$;

-- Helpful index for analytics on ratings
create index if not exists service_requests_rating_idx on public.service_requests(rating) where rating is not null;
