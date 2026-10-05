# Yojitan

Yojitan is a mobile-first roadside assistance app built with Expo, React Native, Supabase, and a small Node API layer. It supports customer bookings, mechanic dispatch, live job tracking, profile and vehicle management, and mechanic identity review.

## Install

```bash
pnpm install
```

This project is set up for `pnpm`. Avoid `npm install` because it creates an extra lockfile and can drift from the repository state.

## Run

```bash
pnpm dev
```

This starts:
- the local API server
- the Expo app

Other useful commands:

```bash
pnpm dev:server
pnpm dev:metro
pnpm lint
pnpm check
pnpm test
pnpm android
pnpm ios
```

## Environment Variables

This is an Expo app, so browser-safe variables use the `EXPO_PUBLIC_` prefix.

Create a local `.env` from `.env.example` and keep secrets out of source control.

Required or commonly used variables:

- `EXPO_PUBLIC_SUPABASE_URL` - Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - public Supabase anon key
- `EXPO_PUBLIC_API_BASE_URL` - local API/server base URL
- `EXPO_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY` - Stripe test publishable key (preferred). Used in dev builds; dev never resolves to a live key even if one is configured.
- `EXPO_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY` - Stripe live publishable key. Only ever resolved in a real production build.
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Legacy alias; can hold either a test or live key, subject to the same dev/prod gating
- `EXPO_PUBLIC_ENABLE_MOCK_PAYMENTS` - Optional local-dev flag; Expo Go and web dev auto-use mock payments, and this flag forces mock mode in a dev build
- `STRIPE_SECRET_KEY` - server-only Stripe secret key (`sk_test_...` or `sk_live_...`) used by `app/api/payment-intent`, `payment-verify`, `payment-capture-sweep`, and the Connect payout routes. No separate dev/prod switch — whatever is set here is what actually gets charged, so double-check it before deploying.
- `STRIPE_WEBHOOK_SECRET` - signing secret for `app/api/stripe-webhook`, from the Stripe Dashboard after registering the endpoint URL. Required for the webhook to accept any events.
- `EXPO_PUBLIC_OAUTH_PORTAL_URL` - OAuth portal URL
- `EXPO_PUBLIC_OAUTH_SERVER_URL` - OAuth server URL
- `EXPO_PUBLIC_APP_ID` - OAuth app id
- `EXPO_PUBLIC_OWNER_OPEN_ID` - OAuth owner id
- `EXPO_PUBLIC_OWNER_NAME` - OAuth owner name
- `SUPABASE_SERVICE_ROLE_KEY` - server-only Supabase service key
- `ADMIN_USER_EMAIL` - the single admin account email allowed to access admin routes
- `ANTHROPIC_API_KEY` - server-only Claude/Anthropic key
- `OAUTH_SERVER_URL` - server-side OAuth backend URL

Do not commit real secrets. The repository should only contain placeholders in `.env.example`.

## Supabase Setup

Run the numbered SQL migrations in `supabase/migrations/` in order:

1. `001_user_profiles_vehicles_jobs.sql`
2. `002_profile_photos_bucket.sql`
3. `003_profile_name_avatar_aliases.sql`
4. `004_mechanic_manual_verification.sql`
5. `005_user_profile_dob.sql`
6. `006_identity_verification_fields.sql`
7. `007_auth_user_profile_sync.sql`
8. `008_live_dispatch_tables.sql`
9. `009_mechanic_documents_bucket.sql`
10. `010_service_messages.sql`
11. `011_user_profiles_expo_push_token.sql`
12. `012_notification_preferences.sql`
13. `013_analytics_events.sql`

Notes:
- RLS is enabled on the public tables defined in these migrations.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and should never be exposed to the client.
- The root `SUPABASE_LIVE_DISPATCH.sql` file is a legacy reference; the migrations are the source of truth now.
- After applying migrations, verify the `profile-photos`, `mechanic-documents`, `service_requests`, `mechanic_presence`, and `service_messages` resources exist in Supabase.
- The notification system stores Expo push tokens and per-user notification preferences in `public.user_profiles`.
- `public.analytics_events` stores launch analytics and is read by the admin analytics dashboard through a server route.
- Admin-only analytics live at `/admin/analytics` and `/admin/mechanic-review`. Both are limited to the single configured `ADMIN_USER_EMAIL`.
- Every customer and mechanic must submit a camera-captured profile photo during signup (migration `034_face_photo_verification.sql`, `user_profiles.avatar_status`); the account is fully blocked (via `app/(tabs)/_layout.tsx` and `app/approval-pending.tsx`) until an admin approves it at `/admin/photo-review`. Mechanics additionally still need their documents approved at `/admin/mechanic-review`.

## Project Layout

- `app/` - Expo Router screens and API routes
- `components/` - reusable UI and feature components
- `lib/` - shared business logic, API helpers, and Supabase helpers
- `supabase/migrations/` - schema and storage setup
- `server/` - Node API server used by Expo/web

## Tests

Run:

```bash
pnpm test
```

The current test suite covers core reducers, auth setup, fare calculations, and selected data-sync helpers. Add tests whenever you touch shared state, dispatch schema mapping, or Supabase API wrappers.
