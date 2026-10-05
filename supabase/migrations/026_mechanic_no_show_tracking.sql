-- Adds tracking for the mechanic-facing "Can't find customer" no-show flow.
-- no_show_reported_at: timestamp when a mechanic reports they arrived but
--   couldn't find/reach the customer. Cleared back to null on any
--   cancel/reassign so it never leaks into a future job.
-- cancel_reason: freeform reason code for the most recent mechanic cancel
--   (e.g. "customer_no_show"), used to customize the customer-facing
--   notification copy.

alter table public.service_requests
  add column if not exists no_show_reported_at timestamptz;

alter table public.service_requests
  add column if not exists cancel_reason text;
