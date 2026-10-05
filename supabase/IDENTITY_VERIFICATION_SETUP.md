# Identity Verification Setup

The app code is wired for full-name/display-name profiles, phone verification, mechanic document review, and admin approval.

## 1. Run Database Migration

Run this file in Supabase SQL Editor:

`supabase/migrations/006_identity_verification_fields.sql`

It adds:

- `display_name`
- `phone_number`
- `phone_verified_at`
- `business_license_document_url`

## 2. Enable Phone Auth

In Supabase Dashboard:

1. Go to Authentication -> Providers -> Phone.
2. Enable Phone provider.
3. Configure an SMS provider, such as Twilio.
4. Confirm OTP templates/rate limits match your launch region.

The app uses Supabase `/auth/v1/otp` and `/auth/v1/verify` for SMS verification.

## 3. Enable Admin Review API

Add these server env vars:

- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_USER_EMAIL`

`ADMIN_USER_EMAIL` has been added locally to `.env`.

The admin review screen is available at:

`/admin/mechanic-review`

Sign in with the configured admin email to load and approve/reject mechanics.
