# WrenchUp Fix Plan

> **Status (2026-10-04):** Owner reports all items fixed. Each item was spot-checked against the current code: 27 are marked ✅ Fixed and 11 are marked ⚠️ Needs verification (1, 2, 3, 6, 11, 12, 15, 23, 27, 31, 38). Steps that happen outside the code, like key rotation, Stripe dashboard checks and hand-created `pg_cron` jobs, can't be confirmed from the repo.

Ordered by severity. Each item lists why it matters, the files involved, and concrete steps. Work top to bottom within each phase — later phases assume earlier ones are stable.

---

## Phase 0 — Critical (money, security, safety)

### 1. Confirm whether payments are ever captured
⚠️ **Needs verification:** capture exists (`app/api/payment-capture-sweep+api.ts`, migration `023`), but there's no `payment_intent.requires_capture` webhook safety net (`stripe-webhook+api.ts` only handles `account.updated`) and no capture-path test. The `payment-capture-sweep` cron job isn't created in any migration; `047` only alters it, so it must already exist in Supabase.
**Why:** PaymentIntents are created with `capture_method: "manual"` (`app/api/payment-intent+api.ts:73`) and no code anywhere calls Stripe's capture endpoint. If nothing outside this repo does it, customers are never charged and mechanics never get paid.
**Steps:**
1. Confirm with the team/Stripe dashboard whether capture happens via a webhook, a separate service, or not at all.
2. If not implemented: add a capture step that fires on job completion (`app/complete.tsx`), using the *final* reconciled amount (see item #2 below) — call Stripe's `paymentIntents.capture` from a new or existing API route (e.g. extend `app/api/payment-verify+api.ts` or add `app/api/payment-capture+api.ts`).
3. Add a Stripe webhook handler (`payment_intent.requires_capture` expiring soon) as a safety net so holds don't silently lapse at ~7 days.
4. Add a test mirroring `lib/__tests__/payment-verification-core.test.ts` for the capture path.

### 2. Reconcile final charge amount with price adjustments, mechanic offers, and tips
⚠️ **Needs verification:** the sweep captures `offered_price + tip`, but nothing updates the PaymentIntent amount (or uses incremental authorization) when a counter-offer is accepted, and there's no check comparing the displayed total with the captured amount. Totals above the original hold land in `capture_failed`.
**Why:** related to #1 — even once capture exists, nothing currently updates the PaymentIntent amount when a mechanic counter-offer is accepted or a tip is added at completion (`app/complete.tsx:91-100` only PATCHes `service_requests`, never touches Stripe).
**Steps:**
1. On mechanic counter-offer acceptance, update the PaymentIntent amount (Stripe supports amount updates pre-capture) or create an incremental authorization.
2. At completion, compute final total = agreed price + tip, and capture that exact amount.
3. Add a reconciliation check/log so any mismatch between displayed total and captured amount is caught before it ships silently.

### 3. Bound the customer's manual price adjustment
⚠️ **Needs verification:** the client clamps the price (`app/confirm.tsx`) and the server enforces a fixed $5–$750 range, but the server's band check uses the client-sent `estimatedTotal` (and is skipped when it's missing). The fare isn't re-derived server-side.
**Why:** `app/confirm.tsx:87-89` only checks `> 0`; `app/api/payment-intent+api.ts:53` only checks `>= $0.50`. Nothing compares it to the computed fare — a customer can set $0.50 or an arbitrary huge number.
**Steps:**
1. In `app/confirm.tsx`, clamp `editedPrice` to a reasonable band around `estimatedTotal` (e.g. 50%–200%, or a fixed +/- dollar range) and show an inline validation message outside that range.
2. In `app/api/payment-intent+api.ts`, re-derive the expected fare server-side from service type/mechanic/region and reject amounts outside the same band — don't trust the client number alone.

### 4. Auto-expire stale mechanic presence
✅ **Fixed:** routing queries filter on recency (`lib/live-dispatch.ts`, `lib/mechanic-cancel-service.ts`), a `pg_cron` backstop is in migration `024`, and an `AppState` handler in `components/mechanic-live-job-sync.tsx` sets presence offline.
**Why:** `is_online = true` never gets reset when the app crashes/is killed; every consumer (`lib/mechanic-cancel-service.ts:57-76`, dispatch routing) filters only on `is_online`, not recency. Customers can be routed to unreachable mechanics.
**Steps:**
1. Add an `updated_at` recency check (e.g. exclude presence rows older than `PRESENCE_HEARTBEAT_MS * 2` = 4 min) everywhere `mechanic_presence` is queried for routing.
2. Add a scheduled Supabase Edge Function (cron) that flips stale `is_online` rows to `false` every few minutes as a backstop.
3. Add app-lifecycle handling (`AppState` listener) to explicitly set presence offline on background/kill where possible.

### 5. Fix the counter-offer countdown bug
✅ **Fixed:** `handleCounterOffer` in `app/mechanic/incoming.tsx` sets `counterOfferSentRef` and calls `clearCountdown()`. Auto-decline goes through `shouldAutoDeclineOnExpiry`, which is tested in `lib/__tests__/incoming-offer-core.test.ts`.
**Why:** `app/mechanic/incoming.tsx:299-382` (`handleCounterOffer`) never cancels the 60s countdown (`incoming.tsx:93-119`), so the offer can auto-decline and reroute while the customer is still deciding.
**Steps:**
1. In `handleCounterOffer`, call `clearCountdown()` and set `resolvedRef.current = true` (or a new "awaiting customer response" state) immediately after a counter is sent.
2. Add a separate, longer timeout (or none) for "waiting on customer to respond to counter" so it doesn't silently reassign.
3. Add a test covering: mechanic counters → timer must not fire `handleDecline`.

### 6. Fix cross-user data isolation on shared devices
⚠️ **Needs verification:** the code is fixed. `app/approval-pending.tsx` awaits `clearUserData()` before `signOut()`, and `app/auth/signin.tsx` awaits it before `loadUserData()`. But `user-data-isolation.test.ts` wasn't extended to cover either call site (step 3).
**Why:** `app/mechanic/approval-pending.tsx:105-114` signs out without calling `clearUserData()` (unlike `components/app-drawer.tsx:93-103`), and there's an unguarded race between `clearUserData()` and `loadUserData()` in `app/auth/signin.tsx:116-121`.
**Steps:**
1. Update `approval-pending.tsx`'s sign-out button to match the drawer's pattern: `await clearUserData()` before `signOut()`.
2. In `signin.tsx`, `await clearUserData()` fully before starting `loadUserData()` — don't fire-and-forget.
3. Re-run/extend `lib/__tests__/user-data-isolation.test.ts` to cover both call sites.

### 7. Add GPS staleness detection to live tracking
✅ **Fixed:** migration `025` adds `location_updated_at`, and `app/tracking.tsx` hides the ETA and shows "Location may be outdated" when it's stale (tested in `live-location-freshness.test.ts`).
**Why:** `app/tracking.tsx:277-284` computes ETA off `mechanic_latitude/longitude` with no timestamp check — a frozen/stale location looks live to the customer.
**Steps:**
1. Store a `location_updated_at` timestamp alongside mechanic coords (may already exist on `service_requests`; add if not).
2. In `tracking.tsx`, if the timestamp is older than ~2x the mechanic's push interval (120s → flag past ~4 min), show a "location may be outdated" banner instead of a live ETA.

### 8. Scrub the committed secret in `.env.example`
✅ **Fixed:** `.env.example` now has the placeholder `sk-ant-api03-your_key_here`. Rotating the old key is a manual step and can't be verified from the repo.
**Why:** `.env.example:20` has a real-looking `ANTHROPIC_API_KEY` and, unlike `.env`, isn't gitignored.
**Steps:**
1. Replace the value with a placeholder (`sk-ant-api03-your_key_here`).
2. Rotate that key if it's live, just in case it was ever committed or shared.

---

## Phase 1 — Broken or half-built flows

### 9. Fix fabricated distance/fare on quick (non-scheduled) bookings
✅ **Fixed:** per-mile pricing was removed, so the stub's distance is `0` and no fabricated distance charge is shown in `app/confirm.tsx`.
**Why:** `app/confirm.tsx:51-67` falls back to a hardcoded stub mechanic (`distanceMiles: 1.8`) for quick bookings with no `mechanicId` yet, and displays that fake distance charge as real (`confirm.tsx:478-484`).
**Steps:**
1. Compute distance from the customer's actual location to the nearest plausible service radius, or clearly label this line item as a provisional estimate until a mechanic is matched.
2. Recalculate and re-display the real distance charge once a mechanic is actually assigned.

### 10. Block past-time scheduling
✅ **Fixed:** the client uses `isScheduledTimeTooSoon` in `book-service.tsx` (tested in `schedule-time-core.test.ts`), and an insert trigger in migration `027` rejects past `scheduled_for`.
**Why:** `app/(tabs)/book-service.tsx`'s custom time picker (`confirmCustomTime`, lines 182-189) doesn't compare against current time; server never validates `scheduledFor` either.
**Steps:**
1. Client: disable/reject any custom time earlier than now (plus a small buffer, e.g. 15 min) in `book-service.tsx`.
2. Server: validate `scheduledFor` in the dispatch-creation code path and reject past timestamps.

### 11. Move offer-expiry enforcement server-side
⚠️ **Needs verification:** `app/api/offer-expiry-sweep+api.ts` has the release/reroute logic and the client check remains, but no migration schedules the sweep. Someone needs to confirm a `pg_cron` job calling it exists in Supabase.
**Why:** `OFFER_TTL_MS` (15 min) in `lib/live-dispatch.ts:324-357` only expires when a client happens to poll — nothing enforces it if both apps are backgrounded.
**Steps:**
1. Add a scheduled Supabase Edge Function that finds `service_requests` past `offer_expires_at` and runs the same release/reroute logic as `releaseExpiredOffer`.
2. Keep the client-side check as a fast-path, not the only path.

### 12. Add a "can't find customer/vehicle" flow for mechanics
⚠️ **Needs verification:** the action and the grace-period no-penalty cancel exist (`app/mechanic/active.tsx`, `lib/no-show-core.ts`), but `submitNoShowReport` only files an admin safety report. No push or inbox message reaches the customer, even though the dialog says "We'll notify" them.
**Why:** No dispute mechanism exists between "arrived" and a full cancellation (`app/mechanic/active.tsx:348-433`).
**Steps:**
1. Add a mechanic-facing "Can't find customer" action on the active-job screen that logs a timestamped note and notifies the customer (reusing the inbox/push pattern from the cancellation fix).
2. Give it a grace-period escalation (e.g. after 5–10 min with no customer response, offer the mechanic a cancel-without-penalty option).

### 13. Add realtime (or faster) messaging instead of pure polling
✅ **Fixed:** `app/messages.tsx` has a realtime subscription with backoff polling as a fallback (migration `020`). The optional read receipts (step 3) weren't added.
**Why:** `app/messages.tsx` polls every 12–60s with no realtime subscription, no read receipts.
**Steps:**
1. Add a Supabase Realtime `postgres_changes` subscription for the messages table, mirroring the pattern already used in `components/mechanic-live-job-sync.tsx`.
2. Keep polling as a fallback (same belt-and-suspenders approach used elsewhere in the app).
3. Optional: add basic delivery/read state once realtime is in place.

### 14. Enforce before/after photo requirements server-side
✅ **Fixed:** a trigger in migration `028` (redefined in `032`) rejects `in_progress`/`completed` transitions without before/after photos.
**Why:** `advance()` in `app/mechanic/active.tsx:348-357` blocks progression client-side only; `updateDispatchStatus` (`lib/live-dispatch.ts:979-1098`) accepts `in_progress`/`completed` transitions without checking photo fields.
**Steps:**
1. In the server-side status-update path, reject transitions to `in_progress`/`completed` if `before_photo_url`/`after_photo_url` are missing (for services that require them).

### 15. Add real penalty logic for mechanic-initiated booked-job cancellations
⚠️ **Needs verification:** the strike penalty is implemented (migration `029`, `applyMechanicCancelStrike` in `lib/mechanic-cancel-service.ts`, routing skips penalized mechanics). But the customer push still only says to rebook from the home screen and opens `/request-pending`, which has no rebook CTA (step 3).
**Why:** `app/mechanic/cancel-booked.tsx` and `lib/mechanic-cancel-service.ts` collect a cancellation reason but apply no penalty, despite UI copy implying there is one (`cancel-booked.tsx:189`).
**Steps:**
1. Decide on the actual policy (strike count, rating impact, temporary throttle on receiving offers).
2. Implement it in `lib/mechanic-cancel-service.ts` alongside the existing reroute logic.
3. Add a clear "rebook" CTA/deep-link to the customer notification (`mechanic-cancel-service.ts:96-97`) instead of the generic "still looking" message.

### 16. Add consequences (or at least tracking) for repeated declines
✅ **Fixed:** migration `030` adds decline-streak columns, and `applyMechanicDeclineStreak` (`lib/mechanic-cancel-service.ts`) runs on decline from `incoming.tsx`.
**Why:** `handleDecline` in `incoming.tsx:384-439` has no rate limiting or reputation effect.
**Steps:**
1. Track decline streaks per mechanic (new column or derived metric).
2. Decide on a policy (e.g. temporary lower priority in routing after N consecutive declines) and implement in the routing function.

### 17. Gate "going online" on location permission
✅ **Fixed:** `lib/mechanic-online.ts` requests location via `fetchLocationAndAddress()` and blocks going online with a message if permission is denied.
**Why:** `lib/mechanic-online.ts:41-159` never checks/requests location permission before setting presence.
**Steps:**
1. Add a location-permission check (and prompt if needed) to the go-online flow, blocking with a clear message if denied.

### 18. Build the missing vehicle identity-verification review workflow
✅ **Fixed:** migration `031`, the `app/admin/vehicle-review.tsx` screen and `app/api/admin/vehicle-verifications+api.ts` were added, and `app/(tabs)/vehicles.tsx` shows the real status.
**Why:** `approvalStatus` on vehicles always stays `"pending"` (`app/vehicle-form.tsx:285-326`) — no admin surface ever changes it, contradicting `supabase/IDENTITY_VERIFICATION_SETUP.md`.
**Steps:**
1. Add a vehicle-approval tab to the existing admin review screen (`app/admin/mechanic-review.tsx` already has the pattern for profile verification — extend it).
2. Add the corresponding API route (mirror `app/api/admin/mechanic-verifications+api.ts`) for vehicle approvals.
3. Reflect real status changes in `app/(tabs)/vehicles.tsx`.

### 19. Fix the inverted "cancellation rate" stat
✅ **Fixed:** `lib/mechanic-metrics.ts` now computes `accepted === 0 ? 0 : cancelled / accepted`.
**Why:** `lib/mechanic-metrics.ts:28` computes retention, not cancellation rate — a mechanic with zero cancellations sees "100%" in red.
**Steps:**
1. Fix the formula to `cancelled / accepted` (or 0 when `accepted === 0`).
2. Verify the corresponding label/color logic in `components/mechanic-home.tsx:596-600` still makes sense after the fix.

### 20. Block deleting a vehicle tied to an active/upcoming job
✅ **Fixed:** `app/vehicle-form.tsx` calls `isVehicleReferencedByActiveJob` (`lib/vehicle-delete-guard-core.ts`, tested) before deleting.
**Why:** `app/vehicle-form.tsx` `handleDelete` (359-403) has no check against `state.jobs`/`activeJobId`.
**Steps:**
1. Before deleting, check if the vehicle is referenced by any job with status other than `completed`/`cancelled`; block with a clear message if so.

### 21. Add a resume path for interrupted signup
✅ **Fixed:** on `user_already_exists`, `components/signup-role-flow.tsx` signs the user in and resumes (`resumed: true`) instead of showing an error.
**Why:** If network drops between session creation and profile/metadata sync in `components/signup-role-flow.tsx:140-210`, retrying shows a confusing "account already exists" error on the user's own account.
**Steps:**
1. Detect `user_already_exists` combined with an active session for that email as "resume signup," not "error" — route them into profile completion instead of blocking.

### 22. Reconcile vehicle document requirements
✅ **Fixed:** docs are optional in both places, with "optional for now" labels and a "verify later" hint in `app/vehicle-form.tsx`.
**Why:** Onboarding (`app/auth/profile-complete.tsx:299-310`) doesn't require insurance/registration docs; the standalone vehicle form (`app/vehicle-form.tsx:219-220`) requires them on every add/edit — so a user's first vehicle becomes uneditable until they backfill docs they were never asked for.
**Steps:**
1. Either require docs at onboarding too, or make them genuinely optional (with a "verify later" reminder) in both places — pick one policy and apply consistently.

### 23. Add a skip/retry path for SMS verification
⚠️ **Needs verification:** the onboarding hard block is gone (`app/auth/profile-complete.tsx`) and "Resend Code" exists in `app/(tabs)/profile.tsx`, but there's no resend backoff and no limited mode (such as "can't book until verified").
**Why:** `app/auth/profile-complete.tsx:168-179` hard-blocks onboarding if `phoneVerifiedAt` isn't set, with no fallback if delivery fails/delays.
**Steps:**
1. Add a "resend code" with backoff and a "verify later" option that lets the user proceed with limited functionality (e.g. can't book yet) rather than getting stuck.

### 24. Require auth for analytics event attribution
✅ **Fixed:** `app/api/analytics+api.ts` takes user ID and role only from a verified session (null otherwise; a bad token gets a 401).
**Why:** `app/api/analytics+api.ts:44-47` trusts client-supplied `userId`/`role` for events outside `AUTHENTICATED_ANALYTICS_EVENTS`.
**Steps:**
1. Require a valid session for all analytics events, or explicitly strip/ignore client-supplied `userId`/`role` for anonymous events instead of trusting them.

### 25. Remove the residual MX-forcing fallback
✅ **Fixed:** `getTestRegionOverride` in `hooks/use-locale.ts` returns `null` when the env var is unset.
**Why:** `hooks/use-locale.ts:12-19` still falls back to forcing `"MX"` in dev mode if `EXPO_PUBLIC_TEST_REGION` isn't set — same footgun as before, just currently masked by `.env`.
**Steps:**
1. Change the fallback to `null` (follow real device/stored region) or `"US"`, so a missing env var doesn't silently reintroduce the original bug for the next developer.

### 26. Gate the test-card button on build environment, not key prefix
✅ **Fixed:** `shouldShowTestCardButton` in `lib/stripe.ts` (and `lib/mock-payments.ts`) requires dev mode, and no UI renders the button any more.
**Why:** `lib/stripe.ts:59-80` shows "Use Test Card" based on the Stripe key's `pk_test_` prefix alone — a misconfigured production build with a leftover test key would expose it to real users.
**Steps:**
1. Add an explicit `__DEV__` (or dedicated env flag) check in addition to the key-prefix check.

### 27. Decide the fate of the orphaned mechanic-list screens
⚠️ **Needs verification:** `app/mechanics.tsx` and `app/mechanic/[id].tsx` are deleted, but the mock `MECHANICS` data in `lib/seed.ts` is still used as a fallback name/photo lookup via `getMechanic()` (in `confirm.tsx`, `complete.tsx`, `job/[id].tsx`, `activity.tsx` and `active-job-banner.tsx`).
**Why:** `app/mechanics.tsx` / `app/mechanic/[id].tsx` run on static mock data (`lib/seed.ts`), aren't linked from real booking flow, and would show fake "bookable" mechanics if ever reconnected.
**Steps:**
1. Either remove these routes, or wire them to the real live-dispatch mechanic list and delete the mock data path — don't leave a dead, deceptive screen reachable by direct navigation.

### 28. Stop the completion status-update from silently dropping data
✅ **Fixed:** `updateDispatchStatus` in `lib/live-dispatch.ts` returns `{ ok, degraded, droppedFields }` and logs a warning, and `complete.tsx` and `mechanic/active.tsx` show a non-blocking alert. It doesn't report to an error tracker.
**Why:** `lib/live-dispatch.ts:1066-1093`'s fallback on missing-column errors can drop `rating`/`tip`/`ratingComment`/photos while still returning `ok: true`.
**Steps:**
1. Distinguish "partial success, some fields dropped" from full success in the return value.
2. Surface a non-blocking warning (or log to an error-tracking service) instead of silently succeeding.

---

## Phase 2 — Polish

29. ✅ **Fixed** (`app/(tabs)/profile.tsx` has its own "Log Out" button calling `handleSignOut`). Add a visible sign-out control on the main Profile tab (`app/(tabs)/profile.tsx`), not just the side drawer.
30. ✅ **Fixed** (`handleRequestNameChange` in `profile.tsx` opens a pre-filled support email, or shows the address as a fallback). Either implement a real "request name change" flow or remove the dead-end "contact support" message (`app/(tabs)/profile.tsx:403-418`).
31. ⚠️ **Needs verification:** not implemented; it was left as a product decision (see recommendation below). The account still has a single `role`. Consider allowing a single account to hold both customer and mechanic roles properly (today it's locked at signup with only a partial view-toggle for mechanics).
32. ✅ **Fixed** (`statusLabel` in `components/live-map.tsx` uses `L(en, es)`). Fix hardcoded Spanish strings in `components/live-map.tsx:114-131` (`statusLabel`) to respect the active locale.
33. ✅ **Fixed** (all the listed alerts now use `L()`/`t()`; the line numbers have moved). Localize the remaining hardcoded English `Alert.alert` strings: `app/vehicle-form.tsx:269,353,363,390,398`, `app/messages.tsx:189,202,237,241`, `app/payment-methods.tsx:63`, `app/mechanic/active.tsx:1038,1042`.
34. ✅ **Fixed** (tip breakdown in `app/(tabs)/earnings.tsx`; Stripe Connect payouts added via `hooks/use-connect-payouts.ts`, `app/api/connect-*+api.ts` and migration `033`, which supersedes the note below). Add a tip breakdown and payout/cashout flow to `app/(tabs)/earnings.tsx` (currently just a running total; `MechanicJob` has no `tip` field to even show one).
35. ✅ **Fixed** (`matched.tsx` moved to `app/matched-mechanic.tsx`; `app/mechanic/[id].tsx` was removed under item 27). Move `app/mechanic/[id].tsx` and `app/mechanic/matched.tsx` out of the `mechanic/` route folder since they're customer-facing screens (naming/organization only, no functional change).
36. ✅ **Fixed** (`uploadBeforePhoto`/`uploadAfterPhoto` in `app/mechanic/active.tsx` keep the local photo and offer "tap to retry"). On evidence-photo upload failure, keep the locally captured photo and allow retry instead of clearing it (`app/mechanic/active.tsx:554-560,585-591`).
37. ✅ **Fixed** (`oilUpcharge` removed from `app/confirm.tsx`; the UI says parts are quoted on-site). Remove the dead `oilUpcharge` ternary (`app/confirm.tsx:81-82`, both branches return 0) and either compute a real parts estimate or clarify in the UI that parts pricing is added later.
38. ⚠️ **Needs verification:** `handleConfirmPayment` in `book-service.tsx` guards with `if (submitting) return;`, which reads React state rather than a `useRef` flag, so two fast taps before a re-render can both get through. Add a synchronous double-tap guard to `handleCreateBooking` in `app/(tabs)/book-service.tsx`, matching the pattern already used in `components/stripe-payment-sheet.tsx`.

---

## Suggested approach
Work Phase 0 first — items 1–2 (payment capture) are the highest-stakes and worth confirming before anything else, since several other fixes (tip reconciliation, price bounds) depend on understanding how capture actually works today. Items 3–8 can be done in parallel with that investigation. Phase 1 and 2 can be tackled in any order once Phase 0 is closed out; I'd suggest batching Phase 1 items by area (mechanic-side items 15–17 together, booking-flow items 9–10 together, etc.) rather than strictly by number, since they touch overlapping files.

---

## Recommendation: item 31 — dual customer/mechanic roles (not implemented)

Item 31 was explicitly a "consider" item, not a bug fix, so it wasn't implemented. Documenting the current state and options here instead.

**Current architecture:** `role` is a single fixed field (`"customer" | "mechanic"`) set once at signup and stored on `user_profiles.role`. It is not editable after account creation. The only flexibility today is `dashboardRoleOverride` (`lib/store-reducer.ts`), a client-side-only UI toggle that lets a mechanic *view* the customer tabs (e.g. to book a service for themselves) without actually changing their account's role in the database — they still can't receive job offers as a customer would generate, and a customer account has no equivalent toggle to see mechanic screens at all. It's a view switch, not a real dual-role account.

**Why it might matter:** a real-world mechanic is also a plausible customer (their own car breaks down, or they want a colleague's help). Right now that person needs two separate accounts/emails to use both sides of the app, which is friction and also makes cross-role analytics/history messier (two disconnected histories instead of one).

**Options, roughly in order of effort:**
1. **Leave as-is.** The view-toggle already covers the common case (a mechanic occasionally wants to book), and most ride/dispatch-style apps (Uber, DoorDash) also keep driver and rider as separate account types. This avoids real complexity: RLS policies, presence/dispatch matching, penalty/throttle logic, and the admin verification workflow all currently assume a user is *either* a customer *or* a mechanic, and none of it was written to be role-agnostic.
2. **Formalize the existing view-toggle** (low effort): keep one role as "primary" (whatever they signed up as) but let any account request the other role be added, verified separately (mechanics still need document approval to act as a mechanic), and switch between two real, separately-tracked histories. This is closest to what already half-exists via `dashboardRoleOverride`, just made real and bidirectional instead of mechanic-only and cosmetic.
3. **Full dual-role support** (highest effort): treat `role` as a set rather than a single value, thread role-per-request through dispatch, presence, RLS, and the mechanic-side penalty/throttle system so a "mechanic-acting-as-customer" can't exploit or be confused with their own mechanic queue (e.g. self-dispatching their own request). This is a genuine architecture change, not a UI change, and would need its own design pass — not something to bolt on as part of this fix pass.

No code changes were made for this item; recommend picking an option above as a deliberate product decision before touching the role model.

---

## Note on item 34 — tip breakdown vs. cashout

> **2026-10-04:** This note is out of date. Stripe Connect payouts now exist (`hooks/use-connect-payouts.ts`, `app/api/connect-*+api.ts`, migration `033_stripe_connect_payouts.sql`, and a Payouts section in `earnings.tsx`).

Item 34 asked for both a tip breakdown and a "payout/cashout flow" on the earnings screen. The tip breakdown is implemented: `MechanicJob` now carries a `tip` field (populated from `service_requests.tip`, the same column customers already write to at job completion), and `app/(tabs)/earnings.tsx` shows job payouts vs. tips separately, plus tips-today and a tipped-jobs count.

The "cashout" half — actually moving money to a mechanic's bank account — was not built. There's no Stripe Connect (or equivalent) integration anywhere in this codebase: no connected-account onboarding, no transfer/payout API calls, no KYC flow. Building a fake "Cash Out" button that doesn't move real money would be the same category of bug this whole fix pass has been removing (fabricated data presented as real). Real payouts need their own project: Stripe Connect Express account onboarding per mechanic, server-side transfer endpoints, and webhook-driven payout status — not something to bolt on inside a polish pass. Flagging this as a separate follow-up rather than shipping a misleading control.
