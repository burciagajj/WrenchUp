-- Yojitan — Step 35: track when a mechanic actually sends a priced
-- counter-offer, distinct from mechanic_offer_sent_at (which only means
-- "this mechanic was handed the job to consider" — set on initial dispatch
-- and every reassignment/reroute). Without this distinction, the 15-minute
-- offer_expires_at TTL sweep (see offer-expiry-sweep+api.ts and
-- releaseExpiredOffer() in lib/live-dispatch.ts) can reassign a request away
-- from a mechanic who already sent the customer a real price, silently
-- invalidating that offer purely because the customer hasn't responded yet.
--
-- Once mechanic_offer_price_sent_at is set, the request is exempt from
-- timer-based reassignment — it only moves on when the customer explicitly
-- accepts/declines the offer, or cancels the trip.

alter table if exists public.service_requests
  add column if not exists mechanic_offer_price_sent_at timestamptz;

create index if not exists service_requests_offer_price_sent_idx
  on public.service_requests (mechanic_offer_price_sent_at)
  where status = 'searching';
