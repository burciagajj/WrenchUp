-- Yojitan — Step 25: track when the mechanic's GPS coordinate was actually
-- captured, so the customer app can tell "last known position" apart from
-- "just updated" instead of trusting mechanic_latitude/longitude forever
-- once they're non-null.

alter table if exists public.service_requests
  add column if not exists mechanic_location_updated_at timestamptz;

comment on column public.service_requests.mechanic_location_updated_at is
  'Set whenever mechanic_latitude/longitude are written by a GPS push. Null/stale (see app STALE_LOCATION_THRESHOLD_MS) means the customer app should stop presenting the location/ETA as live.';
