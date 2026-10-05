-- service_requests.payment_state had a CHECK allowing only escrow_hold,
-- ready_for_release and released. Code already writes other documented states
-- (capture_failed from payment-capture-sweep, dispute_hold from the safety
-- routes), and those writes were being rejected by the constraint. This also
-- adds the states written when a request is cancelled before capture: the
-- sweep cancels the Stripe authorization (hold_released) so the customer's
-- card isn't left pending until Stripe auto-expires it (~7 days).
-- Strict superset of the old allowed values, so existing rows stay valid.

alter table public.service_requests
  drop constraint if exists service_requests_payment_state_check;

alter table public.service_requests
  add constraint service_requests_payment_state_check
  check (payment_state = any (array[
    'escrow_hold',
    'ready_for_release',
    'dispute_hold',
    'released',
    'capture_failed',
    'refunded',
    'hold_released',
    'hold_release_failed'
  ]::text[]));

comment on column public.service_requests.payment_state is
  'One of: escrow_hold (authorized at booking), ready_for_release (customer confirmed completion, dispute window running), dispute_hold (open dispute, see service_disputes), released (funds captured), capture_failed (see capture_error), refunded, hold_released (request cancelled before capture; Stripe authorization canceled), hold_release_failed (cancel of the authorization failed non-retryably; see capture_error and safety_flags).';
