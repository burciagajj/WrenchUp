-- Backfill: applied to the live project on 2026-09-10 as
-- "parts_reimbursement_payout_tracking" but never saved to the repo.
--
-- Tracks the parts charge and its transfer to the mechanic, separately from
-- the main service payout.
alter table public.service_requests
  add column if not exists parts_charge_id text,
  add column if not exists parts_payout_state text,
  add column if not exists parts_stripe_transfer_id text,
  add column if not exists parts_payout_error text,
  add column if not exists parts_payout_transferred_at timestamptz;
