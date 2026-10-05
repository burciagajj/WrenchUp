# WrenchUp — App Status

_Last updated: October 4, 2026_

WrenchUp is an on-demand mobile mechanic app (like Uber for car repair) for the US and Mexico. Customers request help; verified mechanics drive to them and are paid through Stripe.

**Snapshot**
- Latest build: Android **build 31** (production, Oct 3). There are no iOS builds yet.
- Backend: live at `https://wrenchup.expo.app`, last deployed Oct 4 with the cancellation-fee sweep.
- Database: all 47 migrations are applied to the live Supabase project.
- Tests: 216 pass (1 skipped).

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

### Must do before launch
1. **Test the cancellation fee end to end** with your own card:
   - A long drive, then cancel → Stripe should show a **$5** charge.
   - A short drive (<0.5 mi), then cancel → **no fee**.
2. **Finish the Stripe platform questionnaire** in the Stripe Dashboard so mechanics can actually receive payouts. Until then, transfers keep retrying.
3. **Ship a new build.** Build 31 doesn't have the restored Quick services menu on the "Request a mechanic" screen.
4. **Commit the work.** About 318 files are uncommitted (192 of them new), including the fee logic. One lost laptop would mean losing all of it.
5. **Fix the type errors** that `pnpm check` reports:
   - `book-service.tsx`, `confirm.tsx`: wrong number of arguments.
   - `request-pending.tsx`, `tracking.tsx`: `user` may be null.
   - `service-map-hero.tsx`: map style type.

   None of these break the current build, but they can hide real bugs.

### Platform leakage (people using the app only to find a mechanic)
- **The gap:** chat has no contact-info filter, and cancelling before the mechanic drives is free. So a customer and mechanic can swap numbers and finish the deal in cash.
- **Plan:**
  1. Have the database hide phone numbers, emails, @handles and words like "WhatsApp" or "Venmo" in chat.
  2. Add an anti-bypass line to the Terms.
  3. Flag pairs that repeatedly match and then cancel.
  4. Give people reasons to stay: rebooking favorite mechanics, plus payment and dispute protection.

### Housekeeping
- **3 live database changes aren't saved in the repo:** `parts_reimbursement`, `add_durable_rate_limit_bucket` and `add_customer_rating_columns`. Add numbered files for them under `supabase/migrations/` so the repo matches the live database.
- **`HANDOFF.md` is out of date** (May 2026, old "Yojitan" name and screens). Update it or replace it with this file.
- **The Symptom Checker uses an older Claude model** (`claude-sonnet-4-5`). Consider upgrading it.
- **Recheck the cancellation wording** in the Terms and on the booking screen. Booking currently says "$19 cancellation fee after dispatch", which doesn't match the new $5 distance-based fee.
