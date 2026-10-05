-- Locks the money columns of service_requests against edits from signed-in
-- clients. RLS lets a customer/mechanic UPDATE their own job row, and nothing
-- limited *which* columns, so e.g. a customer could lower offered_price after
-- the service (underpaying the mechanic) or a mechanic could set captured_at /
-- stripe_charge_id and trick the payout sweep. Service-role writes (the
-- capture/payout sweep, admin tools, API routes) have auth.uid() = null and
-- are never restricted here.
--
-- Rules for a signed-in client (auth.uid() not null):
--   * base_offered_price, platform_fee_rate: never change after creation.
--   * captured_at, stripe_charge_id, stripe_transfer_id, payout_*, capture_error:
--     backend-owned, never client-editable.
--   * offered_price, platform_fee_amount, mechanic_payout: editable only while
--     the request stays in 'searching' (counter-offers, customer accepting a
--     counter), or when a release/reassign resets them to the customer's
--     authorized baseline. Once a mechanic is accepted the price is final.
--   * tip: only the customer can set it.
--   * customer_quote_accepted_at: only the customer can set it (a mechanic
--     can still clear it, which the release/reassign flow does).

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

drop trigger if exists protect_service_request_money on public.service_requests;
create trigger protect_service_request_money
  before update on public.service_requests
  for each row execute function public.protect_service_request_money();
