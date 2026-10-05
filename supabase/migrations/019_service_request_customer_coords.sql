-- Yojitan — Step 19: customer pickup coordinates on service_requests
-- Lets mechanic-side maps and ETA use the customer's real booking location.

alter table if exists public.service_requests
  add column if not exists customer_latitude numeric,
  add column if not exists customer_longitude numeric;