-- WrenchUp — Step 40: Stripe Customer objects for saved cards.
--
-- The "Payment methods" screen previously had no real way to add a card —
-- only a dev-only fake "test card" button that wrote a made-up card into
-- local state, never touching Stripe at all. Saving a real card for reuse
-- requires a persistent Stripe Customer to attach payment methods to (via a
-- SetupIntent), so this adds the column to store that id per user, mirroring
-- the stripe_connect_account_id pattern from step 33 (that one is the
-- mechanic's payout-side Connect account; this is the customer-side billing
-- identity — every user can have both, they're unrelated).

alter table if exists public.user_profiles
  add column if not exists stripe_customer_id text;

create unique index if not exists user_profiles_stripe_customer_id_idx
  on public.user_profiles (stripe_customer_id)
  where stripe_customer_id is not null;

comment on column public.user_profiles.stripe_customer_id is
  'Stripe Customer ID used to attach saved payment methods (cards) for this user via SetupIntent. Null until they save their first card.';
