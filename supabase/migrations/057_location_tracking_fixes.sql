-- Location-tracking fixes found in the Oct 5 real-card fee test
-- (see mechanic_location_events for jobs e02676c6 / 7e25d24a).
--
-- 1. Finished jobs stay finished. The mechanic app sends the job status with
--    every GPS fix (updateDispatchStatus), so a fix arriving after the
--    customer cancelled could flip the job back to "enroute" — RLS only
--    checks that the caller is the assigned mechanic. Signed-in clients can
--    no longer change the status of a cancelled/completed job; the change is
--    silently kept at the old value so the rest of the update (ratings etc.)
--    still applies. Service-role writes (sweeps, admin, API routes) are
--    unaffected.
-- 2. track_mechanic_distance() ignores fixes once the job is finished.
-- 3. Start-point restart: when the first fix was wrong (build 31 sent a
--    location saved at app launch — the customer's house, 3.3 mi from the
--    mechanic), every real fix was rejected as impossible speed for minutes
--    and then one phantom jump was counted. If nothing has been counted yet
--    and two consecutive rejected fixes agree with each other, tracking now
--    restarts from the real position (logged as outcome 'restart').

create or replace function public.keep_finished_service_request_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null
     and old.status in ('cancelled', 'completed')
     and new.status is distinct from old.status then
    new.status := old.status;
  end if;
  return new;
end;
$$;

revoke all on function public.keep_finished_service_request_status() from public, anon, authenticated;

drop trigger if exists service_requests_keep_finished_status on public.service_requests;
create trigger service_requests_keep_finished_status
  before update of status on public.service_requests
  for each row execute function public.keep_finished_service_request_status();

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
  v_prev record;
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

    -- A finished job's distance is final: fixes from a mechanic still
    -- driving after a cancel (or an old build re-sending its status) must
    -- not add to a fee the sweep is about to decide.
    if old.status in ('cancelled', 'completed') then
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
          -- Implausible from the trusted point. If nothing has been counted
          -- yet and this fix agrees with the previous (also rejected) fix,
          -- it's the start point that was wrong — e.g. build 31 sending a
          -- saved location from home before its first real GPS fix. Restart
          -- tracking from here instead of rejecting every real fix until the
          -- speed check relaxes and then counting one phantom jump.
          select e.latitude, e.longitude, e.created_at, e.outcome
            into v_prev
            from public.mechanic_location_events e
           where e.request_id = new.id
           order by e.created_at desc
           limit 1;
          if coalesce(old.mechanic_distance_driven_miles, 0) = 0
             and v_prev.outcome = 'rejected_speed'
             and ts - v_prev.created_at <= interval '2 minutes'
             and public.haversine_miles(
                   v_prev.latitude::double precision, v_prev.longitude::double precision,
                   new.mechanic_latitude::double precision, new.mechanic_longitude::double precision
                 ) / greatest(extract(epoch from (ts - v_prev.created_at)) / 3600.0, 1.0 / 3600.0) <= 120 then
            new.mechanic_start_latitude := new.mechanic_latitude;
            new.mechanic_start_longitude := new.mechanic_longitude;
            new.mechanic_distance_driven_miles := 0;
            new.mechanic_trusted_latitude := new.mechanic_latitude;
            new.mechanic_trusted_longitude := new.mechanic_longitude;
            new.mechanic_trusted_at := ts;
            new.mechanic_anchor_latitude := new.mechanic_latitude;
            new.mechanic_anchor_longitude := new.mechanic_longitude;
            v_outcome := 'restart';
          else
            -- Ignored; trusted point and anchor stay put.
            v_outcome := 'rejected_speed';
          end if;
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
