# WrenchUp Safety, Payments, and Quality Policy

This document defines the operational rules implemented in the app for payment protection, service evidence, and mechanic quality control.

## 1) Payment Protection and Escrow Flow

1. Mechanic can mark a job as "done", but this does **not** finalize payment.
2. Customer must mark service complete from the customer completion flow.
3. On customer completion, the platform records:
   - `customer_completed_at`
   - `receipt_number`
   - `payment_state = 'escrow_hold'`
   - `dispute_window_ends_at = customer_completed_at + 24 hours`
   - `funds_release_at = customer_completed_at + 24 hours`
4. Funds are held during the dispute window.
5. If no dispute is opened during the window, funds may be released (manual or scheduled backend process).

## 2) Evidence Requirements (Mechanic)

Mechanics are required to photo-document service:

- **Before photo**: required before mechanic can start service.
- **After photo**: required before mechanic can mark service done.

These photos are stored with the service request for accountability and dispute evidence.

## 3) Ratings and Auto-Suspension

Every completed job should receive a rating from the customer.

Auto-suspension policy implemented in-app:

- Evaluation starts once mechanic has at least 5 rated jobs.
- If average rating drops below `4.2`, mechanic is blocked from going online.
- Mechanic remains suspended until manual review/action by platform admin.

## 4) Required Supabase Columns

Run the SQL below to support these policies:

```sql
alter table public.service_requests
  add column if not exists mechanic_marked_done_at timestamptz,
  add column if not exists customer_completed_at timestamptz,
  add column if not exists payment_state text,
  add column if not exists dispute_window_ends_at timestamptz,
  add column if not exists funds_release_at timestamptz,
  add column if not exists before_photo_url text,
  add column if not exists after_photo_url text;

alter table public.service_requests
  add constraint service_requests_payment_state_check
  check (payment_state in ('escrow_hold','ready_for_release','released'));
```

## 5) Optional Backend Automation (Recommended)

Implement a scheduled backend worker to:

1. Find rows where:
   - `payment_state = 'escrow_hold'`
   - `dispute_window_ends_at <= now()`
   - no dispute exists
2. Release funds via Stripe Connect transfer/payout.
3. Update:
   - `payment_state = 'released'`

