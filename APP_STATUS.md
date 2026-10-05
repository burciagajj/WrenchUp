# WrenchUp — App Status

_Last updated: October 5, 2026_

WrenchUp is an on-demand mobile mechanic app (like Uber for car repair) for the US and Mexico. Customers request help; verified mechanics drive to them and are paid through Stripe.

**Snapshot**
- Latest build: Android **build 31** (production, Oct 3). There are no iOS builds yet.
- Backend: live at `https://wrenchup.expo.app`, last deployed Oct 4 with the cancellation-fee sweep.
- Database: migrations 001–053 and 055 are live. **054 (chat filter) and 056 (security hardening) are written but not applied yet.**
- Tests: 216 pass (1 skipped). `pnpm check` is clean.
- Git: everything is committed locally; not pushed yet.

---

## 1. What the app supports today

### Accounts & safety
- Customers and mechanics sign up separately with email/password and an identity step.
- A camera-taken face photo is required, and an admin approves it before the account can book or work.
- Mechanics submit their ID, insurance, certifications and business license for admin review.
- Vehicles are reviewed by an admin.
- Phone numbers are verified and never shown between customer and mechanic.
- Account deletion works, and the Terms, Privacy and About pages are in the app.
- English and Spanish (Mexico), with prices adjusted by region (USD / MXN).

### Customer side
- **Home:** location (editable), selected vehicle, a "Request a mechanic" button, and the quick services grid.
- **13 services:**
  - Quick: Battery Jump, Flat Tire, Lockout, Car Wash, Quick Check-Up, Fuel Delivery.
  - Booked: Oil Change (with oil type options), Brake Service, Diagnostic, Engine Repair, A/C Service, General Check-Up, Other.
- **AI Symptom Checker:** the customer describes a problem and gets a suggested service they can book.
- **Booked (scheduled) services:** a customer can schedule, edit or cancel a booking. Only one active booking is allowed at a time.
- **Card payments (Stripe):** saved cards, and a hold placed on the card at confirm. The charge is taken when the job completes, or the hold is released if the job is cancelled.
- **Live tracking:** a map with the mechanic's position, status steps, an emergency (911) button and sharing with a contact.
- **Chat:** messaging with the mechanic, including price offers from the mechanic.
- **Parts approval:** a mechanic can request extra money for parts, and the customer approves it separately.
- **After the job:** rating, tip, receipt, history in Activity, and disputes.
- **Notifications:** push notifications plus an in-app inbox.

### Mechanic side
- **Dashboard:** online/offline switch, incoming offers, earnings and requirements.
- **Jobs:** accept or decline offers, follow the active job step by step (en route → arrived → in progress → complete), and take before/after photos as evidence.
- **Pricing:** send a price offer, and request parts money.
- **Problem cases:** report "Can't find customer" (no-show), cancel booked jobs with a reason, and rate the customer.
- **Payouts (Stripe Connect Express):** a deposit when the customer is charged, and the rest after a 2-hour dispute window. Payouts are held back if a dispute is open.
- **Rules that keep mechanics reliable:**
  - Strikes for cancelling a job after accepting it.
  - A temporary pause on offers after declining too many in a row.
  - Certain services need extra approval (for example, an approved gas can for Fuel Delivery).

### Server & admin
- **Automatic background jobs:**
  - Charge customers' cards and pay mechanics.
  - Expire unanswered offers.
  - Set mechanics offline when their app stops checking in.
- **Distance-based cancellation fee (deployed Oct 4, not yet tested end to end):** $5 is charged if the customer cancels after the mechanic has driven at least ~0.5 mi and about 25% of the way.
- **Money protection:** customers and mechanics can't edit price or payment fields, and Stripe webhooks are checked to confirm they really come from Stripe.
- **Rate limiting** on the API.
- **Admin screens:** review mechanics, photos, vehicles and service approvals; handle safety reports and disputes; analytics.

---

## 2. What the app can do next (opportunities)

| Idea | Why | Effort |
|---|---|---|
| **Block contact info in chat** | Stops customers and mechanics from swapping phone numbers and moving the deal off the app (see §3) | Small — database change + chat note |
| **Flag suspicious cancellations** | Spot customer/mechanic pairs who keep matching and then cancelling | Small–Medium |
| **Rebook a favorite mechanic** | Gives customers a reason to stay in the app with a mechanic they like | Medium |
| **iOS release** | Today it's Android-only | Medium (Apple developer account, build, review) |
| **Ratings shown to customers** | Builds trust in mechanic quality | Small |
| **Promotions / first-service discount** | Brings in new customers | Small–Medium |
| **Real driving routes and ETAs** | More accurate arrival times than straight-line distance | Medium |

---

## 3. What needs to be worked on

### Done (Oct 4–5)
- All work committed; local secrets backups are git-ignored.
- TypeScript errors fixed.
- Live-only database changes saved as migrations 048–053.
- Booking screen and Terms now describe the real $5 distance-based fee (the old $19 and $50 no-show text is gone).
- Fee decisions are logged in the payment sweep.
- **Distance tracking bug fixed:** the app re-sent its launch-time location every 2 minutes, which could double the recorded miles and wrongly trigger the fee. Fixed in the database (055, live) and in the app (next build). Every GPS update is now logged in `mechanic_location_events`.
- Quick services restored on the "Request a mechanic" screen (next build).

### In progress
1. **Cancellation fee test with a real card** (Johan): one long drive (expect $5) and one short drive (expect no fee).

### Waiting for approval
2. **Apply migration 054:** hides phone numbers, emails and payment apps in chat. The Terms already promise this.
3. **Apply migration 056:** security hardening from the Supabase advisor (signed-out users can't call internal database functions).
4. **`eas deploy`:** chat notification privacy fix and fee logging.
5. **New build:** GPS fix, chat note, fee wording, Quick services.
6. **Push to GitHub.**

### Needs Johan (dashboard / account)
7. **Stripe platform questionnaire:** mechanics can't receive payouts until it's done; transfers keep retrying.
8. **Turn on leaked-password protection:** Supabase Dashboard → Authentication → Settings (blocks passwords known from data breaches).

### Next improvements (need a decision)
- **Background location for mechanics:** distance stops counting when the mechanic leaves the app or locks the screen, so a cancel at that moment may not charge the fee. Needs "Always" location permission, an Android foreground service and a Play Console declaration.
- **Flag suspicious cancellations:** pairs who keep matching then cancelling (data is now available from `contact_info_redacted` and the location log).
- **Database performance:** the Supabase advisor lists 48 policies that should cache `auth.uid()`, plus 38 overlapping policies. Not urgent at current traffic.
- `HANDOFF.md` is outdated; this file replaces it.
- Symptom Checker uses `claude-sonnet-4-5`. It's still supported, so no change is needed now.
