-- Yojitan — Step 14: separate quote acceptance from mechanic acceptance,
-- add offer expiry, and store Stripe payment intent references.

alter table if exists public.service_requests
  add column if not exists mechanic_offer_sent_at timestamptz,
  add column if not exists offer_expires_at timestamptz,
  add column if not exists customer_quote_accepted_at timestamptz,
  add column if not exists mechanic_accepted_at timestamptz,
  add column if not exists stripe_payment_intent_id text;

create index if not exists service_requests_offer_expires_at_idx
  on public.service_requests (offer_expires_at)
  where status = 'searching' and assigned_mechanic_user_id is not null;

create index if not exists service_requests_customer_quote_accepted_idx
  on public.service_requests (customer_quote_accepted_at desc nulls last);

create index if not exists service_requests_mechanic_accepted_idx
  on public.service_requests (mechanic_accepted_at desc nulls last);

create index if not exists service_requests_stripe_payment_intent_idx
  on public.service_requests (stripe_payment_intent_id);
