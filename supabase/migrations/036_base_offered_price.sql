-- Yojitan — Step 36: preserve the original, customer-authorized price
-- separately from the negotiated `offered_price` column.
--
-- `offered_price` is overwritten in place by every mechanic counter-offer
-- (see updateDispatchOfferedPrice in lib/live-dispatch.ts). But when a
-- request gets reassigned to a different mechanic — because the offering
-- mechanic declined, cancelled, went stale, or the TTL sweep rerouted them —
-- every reassignment path only cleared the negotiation-state flags
-- (mechanic_offer_sent_at, offer_expires_at, etc.), never offered_price
-- itself. That meant a brand-new mechanic could see, and simply accept, a
-- previous mechanic's never-agreed-to counter-offer, and that stale number
-- would flow straight through to Stripe capture and mechanic payout.
--
-- base_offered_price is the immutable "what the customer actually
-- authorized" baseline, set once at request creation and never touched by
-- counter-offers. Every reassignment path now resets offered_price (and its
-- derived platform_fee_amount/mechanic_payout) back to this baseline instead
-- of leaving whatever the last mechanic proposed.

alter table if exists public.service_requests
  add column if not exists base_offered_price numeric;

-- Backfill existing rows: the safest baseline we have for a row that was
-- already negotiated is its current offered_price (better than null).
update public.service_requests
set base_offered_price = offered_price
where base_offered_price is null;
