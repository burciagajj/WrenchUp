# WrenchUp TODO

## Foundations
- [x] Define theme tokens (Wrench Orange brand)
- [x] Generate app logo and update branding in app.config.ts
- [x] Add icon mappings for tab bar (house, list, car, person)
- [x] Set up store: Context + reducer + AsyncStorage persistence
- [x] Seed mechanic data and service types

## Navigation
- [x] Tab bar with Home, Activity, Vehicles, Profile
- [x] Stack screens: service-select, mechanics, mechanic detail, confirm, tracking, complete, vehicle form, job detail

## Screens
- [x] Home screen with request CTA, quick services, active-job banner, top mechanics carousel
- [x] Service selection sheet
- [x] Mechanics list with cards and ETAs
- [x] Mechanic detail with reviews and Book Now
- [x] Confirm booking with fare breakdown
- [x] Tracking screen with stylized map and status timeline
- [x] Job complete with rating and tip
- [x] Activity list with status filters
- [x] Job history detail (re-open receipt + rebook)
- [x] Vehicles list + add/edit/delete form
- [x] Profile screen

## Behavior
- [x] Job state machine simulation (ETA timer, status transitions)
- [x] Haptics on primary actions
- [x] Active-job persistence across app restarts
- [x] Pressable feedback (scale + opacity)

## Quality
- [x] Vitest tests for reducer and fare calc
- [x] Verify all flows end-to-end (no dead ends)
- [x] Save initial checkpoint

## v1.1 — Notifications & Mechanic mode
- [x] Add notification helper using expo-notifications (local schedule, permissions, web no-op)
- [x] Fire notifications on customer-side job status transitions (accepted, enroute, arrived, in_progress, completed)
- [x] Add role state to store (customer | mechanic) with persistence
- [x] Add mechanic-mode toggle in Profile
- [x] Build Mechanic dashboard screen (online toggle, stats, incoming jobs)
- [x] Build incoming-job request sheet (accept/decline with countdown)
- [x] Build mechanic active-job view with status progression (Heading there → Arrived → Start → Complete)
- [x] Fire mechanic-side notifications (new request, customer waiting, etc.)
- [x] Add vitest tests for new role / mechanic-job reducer cases
- [x] Verify both flows end-to-end and save checkpoint

## v1.2 — Real maps & geolocation
- [x] Install expo-location and react-native-maps
- [x] Add location/permission helper (request foreground permission, web no-op)
- [x] On first launch, get current coords + reverse geocode to set defaultLocation
- [x] Persist user latitude/longitude in store
- [x] Generate seed mechanic coordinates around the user's location
- [x] Generate per-job pickup coords based on the user's coords at request time
- [x] Build LiveMap component with native react-native-maps and a stylized SVG fallback for web
- [x] Use LiveMap on customer Tracking screen with animated mechanic puck along straight-line path
- [x] Use LiveMap on Mechanic Active screen showing mechanic→customer route
- [x] Show "Refresh" location pill on Home that re-fetches and updates address
- [x] Add tests for haversine distance and coord interpolation
- [x] Save checkpoint

## v1.3 — Mexico locale & pricing
- [x] Add region detection (reverse-geocode country code; "MX" triggers Mexico mode)
- [x] Persist region + manual locale override in store
- [x] Add i18n module with en and es-MX strings, t() helper, and locale-aware currency formatter
- [x] Apply 60% discount to all displayed/computed estimate prices when region=MX
- [x] Translate Home, Service select, Mechanics list, Confirm, Tracking, Activity, Vehicles, Profile, Mechanic dashboard
- [x] Add Profile region override (Auto / United States / México)
- [x] Show a small "MX MXN" / discount banner so the price change is explainable
- [x] Tests: country detection, discount math, currency formatter, t() fallback
- [x] Save checkpoint


## v1.4 — Stripe Payment Integration
- [x] Install Stripe packages
- [x] Create Stripe payment types and helpers
- [x] Add payment state to store
- [x] Add payment reducer actions
- [x] Build payment method management screen
- [x] Build StripePaymentSheet component
- [x] Wire Stripe checkout into confirm screen
- [x] Add payment simulation on booking
- [x] Add i18n strings for payment UI
- [x] Add 14 passing tests for payment helpers
- [x] Save checkpoint

## v1.4.1 — Stripe RN SDK fix
- [x] Uninstall the Node.js `stripe` package (server-only, breaks Metro)
- [x] Refactor `lib/stripe.ts` to be client-safe (no Stripe Node import)
- [x] Confirm `@stripe/stripe-react-native` 0.50.3 is installed
- [x] Add `@stripe/stripe-react-native` config plugin in `app.config.ts`
- [x] Move publishable key to `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- [x] Wrap root layout in `<StripeProvider>` (platform-split: native + web no-op)
- [x] Add `usePaymentSheet` hook stub and wire it into Confirm
- [x] Restart Metro and verify web bundle no longer pulls native codegen
- [x] Add live publishable-key vitest (validated against Stripe API)
- [x] Save checkpoint


## v1.5 — Authentication, Role Selection & Profile Completion
- [x] Audit existing auth system (OAuth flow, session tokens, API endpoints)
- [x] Decide: Integrate Supabase Auth email/password alongside existing OAuth or replace
- [x] Create/update sign-up screen with email/password + role selection (Customer/Mechanic)
- [x] Create login screen with email/password
- [x] Create forgot password flow (email verification)
- [x] Add auth protection to root layout: redirect unauthenticated users to login
- [x] Create profile-complete screen for customers (add first vehicle)
- [x] Create profile-complete screen for mechanics (name, photo, services offered)
- [x] Fix Supabase signup rate limit (disabled email confirmation)
- [x] Improve error messages to show real Supabase errors
- [x] Fix session persistence (set user immediately after signup)
- [ ] Test full signup flow end-to-end
- [ ] Test login flow
- [ ] Test existing booking flow still works
- [ ] Test maps, mechanic mode, payment still work
- [ ] Run all tests to ensure no regressions
- [ ] Update HANDOFF.md with v1.5 auth/profile changes
- [ ] Save checkpoint v1.5
