-- Replaces the blunt filtering in track_mechanic_distance() (migration 044):
--   * "Jitter": the old version dropped any single GPS step under ~15 m and
--     overwrote its reference point every push, so slow movement (traffic,
--     creeping) never accumulated. Distance is now measured from a separate
--     "last counted point" (anchor) that only advances once the mechanic has
--     moved ~15 m from it, so slow movement adds up while stationary jitter
--     bouncing around the anchor still counts for nothing.
--   * "Glitches": the old version dropped any step over 5 mi, which also threw
--     away real long gaps (tunnel, app backgrounded). A fix is now rejected
--     only if reaching it from the last trusted fix would take an impossible
--     speed (>120 mph over the elapsed time). A single bad fix is ignored, and
--     because the trusted point doesn't move to it, the next good fix is judged
--     against the last real position. The check relaxes as time passes, so a
--     wrong trusted point heals itself within minutes instead of rejecting
--     every later fix.

alter table public.service_requests
  add column if not exists mechanic_trusted_latitude numeric,
  add column if not exists mechanic_trusted_longitude numeric,
  add column if not exists mechanic_trusted_at timestamptz,
  add column if not exists mechanic_anchor_latitude numeric,
  add column if not exists mechanic_anchor_longitude numeric;

create or replace function public.track_mechanic_distance()
returns trigger
language plpgsql
as $$
declare
  actor uuid;
  seg double precision;
  hours double precision;
  moved double precision;
  ts timestamptz := clock_timestamp();
begin
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
          end if;
        end if;
        -- Implausible fix: ignored entirely; trusted point and anchor stay put.
      end if;
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;
