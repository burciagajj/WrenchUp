-- Driven-distance observability + stale-point guard.
--
-- 1. mechanic_location_events: one row per mechanic GPS update the distance
--    trigger evaluates, with what it decided (start / counted / jitter /
--    rejected_speed / ignored_replay / reset) and the running total after it.
--    Lets a test drive (or a disputed cancellation fee) be traced point by
--    point. Server-only: RLS on, no policies. Pruned after 30 days.
--
-- 2. Stale-point guard. Mechanic builds up to 31 re-sent the location captured
--    at app launch (state.userCoords) every 2 minutes alongside the live GPS
--    watch (app/mechanic/active.tsx). Whenever that old point looked reachable
--    (mechanic stopped at a light, etc.), the trigger counted the trip back to
--    it and then the trip forward again, inflating driven miles and making the
--    cancellation fee fire on short drives. Real GPS fixes essentially never
--    repeat the exact same coordinates minutes apart, so a fix identical to
--    one already logged for this request more than 30 s ago is ignored, and
--    the column keeps its previous value so the customer's map doesn't jump.
--
-- track_mechanic_distance() is otherwise the migration 045 logic, now
-- SECURITY DEFINER so it can write the log table (auth.uid() still reads the
-- caller's JWT, so the participant checks are unchanged).

create table if not exists public.mechanic_location_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.service_requests(id) on delete cascade,
  mechanic_user_id uuid,
  latitude numeric not null,
  longitude numeric not null,
  outcome text not null,
  segment_miles double precision,
  speed_mph double precision,
  driven_miles_after numeric,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists mechanic_location_events_request_created_idx
  on public.mechanic_location_events (request_id, created_at desc);

alter table public.mechanic_location_events enable row level security;
revoke all on public.mechanic_location_events from public, anon, authenticated;

comment on table public.mechanic_location_events is
  'Per-fix log of track_mechanic_distance() decisions. Written only by that trigger; read with the service role / SQL editor.';

create or replace function public.track_mechanic_distance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  seg double precision;
  hours double precision;
  moved double precision;
  ts timestamptz := clock_timestamp();
  v_outcome text;
  v_lat numeric;
  v_lng numeric;
begin
  v_lat := new.mechanic_latitude;
  v_lng := new.mechanic_longitude;
  -- Never let distance bookkeeping block the real update.
  begin
    actor := auth.uid();

    -- Derived columns are trigger/service-role owned: a signed-in participant
    -- can't edit them directly.
    if actor is not null then
      new.mechanic_start_latitude := old.mechanic_start_latitude;
      new.mechanic_start_longitude := old.mechanic_start_longitude;
      new.mechanic_distance_driven_miles := old.mechanic_distance_driven_miles;
      new.cancellation_fee_amount := old.cancellation_fee_amount;
      new.mechanic_trusted_latitude := old.mechanic_trusted_latitude;
      new.mechanic_trusted_longitude := old.mechanic_trusted_longitude;
      new.mechanic_trusted_at := old.mechanic_trusted_at;
      new.mechanic_anchor_latitude := old.mechanic_anchor_latitude;
      new.mechanic_anchor_longitude := old.mechanic_anchor_longitude;
    end if;

    -- A customer writing location fields must not be able to reset or inflate
    -- the mechanic's driven distance.
    if actor is not null and actor = old.customer_user_id then
      return new;
    end if;

    if new.mechanic_latitude is distinct from old.mechanic_latitude
       or new.mechanic_longitude is distinct from old.mechanic_longitude then

      if new.mechanic_latitude is null or new.mechanic_longitude is null then
        -- Location cleared (mechanic released / reassigned): start over.
        new.mechanic_start_latitude := null;
        new.mechanic_start_longitude := null;
        new.mechanic_distance_driven_miles := 0;
        new.mechanic_trusted_latitude := null;
        new.mechanic_trusted_longitude := null;
        new.mechanic_trusted_at := null;
        new.mechanic_anchor_latitude := null;
        new.mechanic_anchor_longitude := null;
        v_outcome := 'reset';

      elsif new.mechanic_start_latitude is null or new.mechanic_trusted_latitude is null then
        -- First fix (or a row that predates this tracking).
        new.mechanic_start_latitude := new.mechanic_latitude;
        new.mechanic_start_longitude := new.mechanic_longitude;
        new.mechanic_distance_driven_miles := 0;
        new.mechanic_trusted_latitude := new.mechanic_latitude;
        new.mechanic_trusted_longitude := new.mechanic_longitude;
        new.mechanic_trusted_at := ts;
        new.mechanic_anchor_latitude := new.mechanic_latitude;
        new.mechanic_anchor_longitude := new.mechanic_longitude;
        v_outcome := 'start';

      elsif exists (
        select 1 from public.mechanic_location_events e
        where e.request_id = new.id
          and e.latitude = new.mechanic_latitude
          and e.longitude = new.mechanic_longitude
          and e.created_at < ts - interval '30 seconds'
      ) then
        -- Exact repeat of an old point: a stale re-send, not movement.
        new.mechanic_latitude := old.mechanic_latitude;
        new.mechanic_longitude := old.mechanic_longitude;
        v_outcome := 'ignored_replay';

      else
        seg := public.haversine_miles(
          new.mechanic_trusted_latitude::double precision, new.mechanic_trusted_longitude::double precision,
          new.mechanic_latitude::double precision, new.mechanic_longitude::double precision
        );
        hours := greatest(extract(epoch from (ts - coalesce(new.mechanic_trusted_at, ts - interval '5 seconds'))) / 3600.0, 1.0 / 3600.0);

        if seg / hours <= 120 then
          -- Plausible fix: it becomes the new trusted point.
          new.mechanic_trusted_latitude := new.mechanic_latitude;
          new.mechanic_trusted_longitude := new.mechanic_longitude;
          new.mechanic_trusted_at := ts;

          -- Count distance only once we've moved ~15 m from the last counted
          -- point, so jitter around it adds nothing but slow movement does.
          moved := public.haversine_miles(
            coalesce(new.mechanic_anchor_latitude, new.mechanic_start_latitude)::double precision,
            coalesce(new.mechanic_anchor_longitude, new.mechanic_start_longitude)::double precision,
            new.mechanic_latitude::double precision, new.mechanic_longitude::double precision
          );
          if moved >= 0.0093 then
            new.mechanic_distance_driven_miles := coalesce(old.mechanic_distance_driven_miles, 0) + moved;
            new.mechanic_anchor_latitude := new.mechanic_latitude;
            new.mechanic_anchor_longitude := new.mechanic_longitude;
            v_outcome := 'counted';
          else
            v_outcome := 'jitter';
          end if;
        else
          -- Implausible fix: ignored; trusted point and anchor stay put.
          v_outcome := 'rejected_speed';
        end if;
      end if;

      if v_outcome is not null and v_lat is not null and v_lng is not null then
        begin
          insert into public.mechanic_location_events (
            request_id, mechanic_user_id, latitude, longitude, outcome,
            segment_miles, speed_mph, driven_miles_after
          ) values (
            new.id, new.assigned_mechanic_user_id, v_lat, v_lng, v_outcome,
            seg, case when hours > 0 then seg / hours end, new.mechanic_distance_driven_miles
          );
        exception when others then
          null;
        end;
      end if;
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;

revoke all on function public.track_mechanic_distance() from public, anon, authenticated;

select cron.schedule(
  'prune-mechanic-location-events',
  '17 9 * * *',
  $$delete from public.mechanic_location_events where created_at < now() - interval '30 days'$$
);
