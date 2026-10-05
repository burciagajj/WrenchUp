-- Backfill: applied to the live project on 2026-09-10 as
-- "parts_reimbursement" but never saved to the repo.
--
-- Mechanic-proposed parts cost, charged as a separate customer-approved
-- PaymentIntent (app/api/parts-payment-intent+api.ts).
alter table public.service_requests
  add column if not exists parts_cost numeric(10,2),
  add column if not exists parts_receipt_path text,
  add column if not exists parts_payment_intent_id text,
  add column if not exists parts_payment_status text
    check (parts_payment_status in ('none','proposed','authorized','captured','capture_failed','declined','canceled'))
    default 'none',
  add column if not exists parts_proposed_at timestamptz,
  add column if not exists parts_authorized_at timestamptz;
