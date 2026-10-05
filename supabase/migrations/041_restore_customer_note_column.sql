-- WrenchUp — Step 41: Restore the missing customer_note column.
--
-- customer_note was defined in migration 008 (live_dispatch_tables) and is
-- read/written across ~15 files (booking flow, dispatch-notify, mechanic
-- cancel, job history, booked-service editing) — but it was absent from the
-- live service_requests table, causing every one of those PostgREST selects
-- to fail outright with "column service_requests.customer_note does not
-- exist". Confirmed via information_schema that no later migration dropped
-- or renamed it — this is schema drift, not an intentional removal.

alter table if exists public.service_requests
  add column if not exists customer_note text;

comment on column public.service_requests.customer_note is
  'Optional note from the customer at booking time (special instructions, access details, etc.), shown to the assigned mechanic.';
