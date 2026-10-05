-- Staged mechanic payouts: a deposit at capture, the remainder after the
-- 2 hour dispute window (see lib/payout-split-core.ts and
-- app/api/payment-capture-sweep+api.ts).
--
-- payout_state values: null (not paid), 'deposit_paid' (stage 1 done, remainder
-- pending), 'transferred' (fully paid), 'transfer_failed', and 'withheld'
-- (set by an admin after a dispute so the remainder is never released).

alter table public.service_requests
  add column if not exists payout_deposit_amount numeric,
  add column if not exists payout_deposit_transfer_id text,
  add column if not exists payout_deposit_at timestamptz;

create index if not exists service_requests_payout_remainder_idx
  on public.service_requests (dispute_window_ends_at)
  where payout_state = 'deposit_paid';

-- The price-lock trigger (046) already blocks client writes to payout
-- columns; extend it to the new deposit columns.
create or replace function public.protect_service_request_money()
returns trigger
language plpgsql
as $$
declare
  actor uuid := auth.uid();
  baseline numeric;
begin
  if actor is null then
    return new;
  end if;

  new.base_offered_price := old.base_offered_price;
  new.platform_fee_rate := old.platform_fee_rate;
  new.captured_at := old.captured_at;
  new.stripe_charge_id := old.stripe_charge_id;
  new.stripe_transfer_id := old.stripe_transfer_id;
  new.payout_state := old.payout_state;
  new.payout_error := old.payout_error;
  new.payout_transferred_at := old.payout_transferred_at;
  new.payout_deposit_amount := old.payout_deposit_amount;
  new.payout_deposit_transfer_id := old.payout_deposit_transfer_id;
  new.payout_deposit_at := old.payout_deposit_at;
  new.capture_error := old.capture_error;

  baseline := coalesce(nullif(old.base_offered_price, 0), old.offered_price);

  if not (old.status = 'searching' and new.status = 'searching')
     and not (new.status = 'searching' and new.offered_price = baseline) then
    new.offered_price := old.offered_price;
    new.platform_fee_amount := old.platform_fee_amount;
    new.mechanic_payout := old.mechanic_payout;
  end if;

  if actor is distinct from old.customer_user_id then
    new.tip := old.tip;
    if new.customer_quote_accepted_at is not null then
      new.customer_quote_accepted_at := old.customer_quote_accepted_at;
    end if;
  end if;

  return new;
end;
$$;

-- Run the capture/payout sweep every 2 minutes instead of every 15 so the
-- deposit lands shortly after the customer confirms and the remainder shortly
-- after the dispute window closes.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'payment-capture-sweep'),
  schedule := '*/2 * * * *'
);
