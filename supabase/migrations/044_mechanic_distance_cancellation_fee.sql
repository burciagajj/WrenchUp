-- Customer cancellation fee, based on how far the assigned mechanic actually
-- drove. The distance is accumulated here, by the database, from the GPS
-- points the mechanic's own app pushes to mechanic_latitude/longitude — never
-- from anything a client reports about it. The fee itself is decided and
-- charged by the payment-capture-sweep (see lib/cancellation-fee-core.ts).

alter table public.service_requests
  add column if not exists mechanic_start_latitude numeric,
  add column if not exists mechanic_start_longitude numeric,
  add column if not exists mechanic_distance_driven_miles numeric not null default 0,
  add column if not exists cancellation_fee_amount numeric;

comment on column public.service_requests.mechanic_distance_driven_miles is
  'Cumulative miles the assigned mechanic has driven since their first GPS fix on this request. Maintained only by track_mechanic_distance(); resets when the location is cleared (reassignment).';
comment on column public.service_requests.cancellation_fee_amount is
  'Cancellation fee captured from the customer, in the request currency, paid out in full to the mechanic. Set only by the payment-capture-sweep.';

create or replace function public.haversine_miles(
  lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision
) returns double precision
language sql immutable as $$
  select 3958.7613 * 2 * asin(sqrt(
    power(sin(radians((lat2 - lat1) / 2)), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians((lon2 - lon1) / 2)), 2)
  ))
$$;

create or replace function public.track_mechanic_distance()
returns trigger
language plpgsql
as $$
declare
  seg double precision;
  actor uuid;
begin
  -- Never let distance bookkeeping block the real update.
  begin
    actor := auth.uid();

    -- The derived columns are trigger/service-role owned: a signed-in
    -- participant (customer or mechanic) can't edit them directly.
    if actor is not null then
      new.mechanic_start_latitude := old.mechanic_start_latitude;
      new.mechanic_start_longitude := old.mechanic_start_longitude;
      new.mechanic_distance_driven_miles := old.mechanic_distance_driven_miles;
      new.cancellation_fee_amount := old.cancellation_fee_amount;
    end if;

    -- A customer writing location fields must not be able to reset or inflate
    -- the mechanic's driven distance.
    if actor is not null and actor = old.customer_user_id then
      return new;
    end if;

    if new.mechanic_latitude is distinct from old.mechanic_latitude
       or new.mechanic_longitude is distinct from old.mechanic_longitude then
      if new.mechanic_latitude is null or new.mechanic_longitude is null then
        new.mechanic_start_latitude := null;
        new.mechanic_start_longitude := null;
        new.mechanic_distance_driven_miles := 0;
      elsif old.mechanic_latitude is null
         or old.mechanic_longitude is null
         or new.mechanic_start_latitude is null then
        new.mechanic_start_latitude := new.mechanic_latitude;
        new.mechanic_start_longitude := new.mechanic_longitude;
        new.mechanic_distance_driven_miles := 0;
      else
        seg := public.haversine_miles(
          old.mechanic_latitude::double precision, old.mechanic_longitude::double precision,
          new.mechanic_latitude::double precision, new.mechanic_longitude::double precision
        );
        -- Under ~15 m is GPS jitter while stationary; over 5 mi in one push is
        -- a glitch or a long signal gap, not driving we can vouch for.
        if seg >= 0.0093 and seg <= 5 then
          new.mechanic_distance_driven_miles := coalesce(old.mechanic_distance_driven_miles, 0) + seg;
        end if;
      end if;
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists service_requests_track_mechanic_distance on public.service_requests;
create trigger service_requests_track_mechanic_distance
  before update on public.service_requests
  for each row execute function public.track_mechanic_distance();
