-- Yojitan — Step 33: Stripe Connect Express accounts for mechanic payouts.
--
-- Customer payments are captured to the platform's Stripe balance (see step 23,
-- payment-capture-sweep). Nothing previously moved a mechanic's cut of that
-- money out to them — this migration adds the columns needed for mechanics to
-- onboard a Stripe Express connected account, and for the capture sweep to
-- transfer their payout to it once a job's payment is captured.
--
-- Architecture: "separate charges and transfers" (not destination charges),
-- because the mechanic isn't known yet at PaymentIntent-creation time (booking
-- happens before a mechanic is matched). The platform captures the full amount
-- first, then transfers the mechanic's share afterward using
-- source_transaction=<charge id> so the transfer draws directly from that
-- specific charge's funds rather than the platform's overall available balance.

alter table if exists public.user_profiles
  add column if not exists stripe_connect_account_id text,
  add column if not exists stripe_connect_details_submitted boolean not null default false,
  add column if not exists stripe_connect_charges_enabled boolean not null default false,
  add column if not exists stripe_connect_payouts_enabled boolean not null default false,
  add column if not exists stripe_connect_updated_at timestamptz;

create unique index if not exists user_profiles_stripe_connect_account_id_idx
  on public.user_profiles (stripe_connect_account_id)
  where stripe_connect_account_id is not null;

alter table if exists public.service_requests
  add column if not exists stripe_charge_id text,
  add column if not exists stripe_transfer_id text,
  add column if not exists payout_state text,
  add column if not exists payout_transferred_at timestamptz,
  add column if not exists payout_error text;

-- Fast lookup for the payout step of the capture sweep: rows that were
-- captured but haven't been transferred to the mechanic (or failed) yet.
create index if not exists service_requests_payout_sweep_idx
  on public.service_requests (captured_at)
  where captured_at is not null and payout_state is null;

comment on column public.user_profiles.stripe_connect_account_id is
  'Stripe Express connected account ID for a mechanic. Null until they start onboarding.';
comment on column public.user_profiles.stripe_connect_details_submitted is
  'Mirrors the Connect account''s details_submitted flag (has the mechanic completed the Stripe-hosted onboarding form). Kept in sync via the account.updated webhook.';
comment on column public.user_profiles.stripe_connect_charges_enabled is
  'Mirrors the Connect account''s charges_enabled flag. Not currently used (mechanics never charge directly) but kept for completeness/future use.';
comment on column public.user_profiles.stripe_connect_payouts_enabled is
  'Mirrors the Connect account''s payouts_enabled flag. Must be true before the capture sweep will transfer a payout to this mechanic.';
comment on column public.service_requests.stripe_charge_id is
  'The underlying Stripe Charge ID (PaymentIntent.latest_charge) captured by payment-capture-sweep. Used as source_transaction when transferring the mechanic''s payout.';
comment on column public.service_requests.stripe_transfer_id is
  'Stripe Transfer ID once the mechanic''s payout has been sent to their connected account.';
comment on column public.service_requests.payout_state is
  'One of: transferred (payout sent), held_no_payout_account (mechanic hasn''t finished Connect onboarding — retried on future sweep runs), transfer_failed (see payout_error). Null means not yet attempted (e.g. not captured yet).';
comment on column public.service_requests.payout_error is
  'Last error message from a failed Stripe Transfer attempt, for admin follow-up.';
