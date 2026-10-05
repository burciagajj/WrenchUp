-- Yojitan — Step 23: track Stripe capture outcome on service_requests.
-- Payments are authorized with capture_method="manual" at booking time and are
-- meant to be captured once the 24h post-completion dispute window closes with
-- no open dispute. Nothing previously performed that capture — these columns
-- back the new /api/payment-capture-sweep cron job that does.

alter table if exists public.service_requests
  add column if not exists captured_at timestamptz,
  add column if not exists capture_error text;

-- Fast lookup for the sweep: rows that are ready to release, past their release
-- time, and not yet captured.
create index if not exists service_requests_capture_sweep_idx
  on public.service_requests (payment_state, funds_release_at)
  where captured_at is null;

comment on column public.service_requests.payment_state is
  'One of: escrow_hold (authorized at booking), ready_for_release (customer confirmed completion, dispute window running), dispute_hold (open dispute, see service_disputes), released (funds captured), capture_failed (see capture_error), refunded.';
comment on column public.service_requests.captured_at is
  'Set once the payment-capture-sweep job successfully captures the Stripe PaymentIntent (payment_state moves to "released").';
comment on column public.service_requests.capture_error is
  'Last error message from a failed capture attempt, for admin follow-up.';
