# WrenchUp — App Status

_Last updated: October 5, 2026 (evening)_

WrenchUp is an on-demand mobile mechanic app (like Uber for car repair) for the US and Mexico. Customers request help; verified mechanics drive to them and are paid through Stripe.

**Snapshot**
- Latest build: Android **build 32** (Oct 4; not on Play yet). The next build will include the location overhaul and the Mexico Stripe fix.
- Backend: live at `https://wrenchup.expo.app` (deployed Oct 4). **The Mexico Stripe fix is committed but not deployed.**
- Database: migrations 001–057 are all live.
- Tests: 233 pass (1 skipped). `pnpm check` is clean; `pnpm lint` has 0 errors.

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
- **Chat** hides phone numbers, emails and payment apps (054, live). Push notifications are filtered the same way.
- **Security hardening** from the Supabase advisor (056, live).
- **Cancellation fee** tested with a real card: the long drive charged $5, the short drive charged nothing.
- **Location overhaul** (057 live; app changes in the next build). Details in [docs/LOCATION_TRACKING.md](docs/LOCATION_TRACKING.md):
  - background trip GPS for mechanics;
  - fresh customer location, so requests no longer use the first-launch location;
  - typed addresses are geocoded;
  - finished jobs can't be reopened;
  - start-point restart.
- **Mexico mechanics** get Mexican Stripe accounts (code ready; needs a deploy and a build).
- **Privacy policy** covers mechanics' background location.

### Needs Johan
1. **Play Console declarations for background location:** location permissions and foreground service, with a short video. Without them Google rejects the next build. Steps and suggested text are in [docs/LOCATION_TRACKING.md](docs/LOCATION_TRACKING.md).
2. **Stripe:**
   - finish the platform questionnaire;
   - refund **$15.86** on Thursday's $30.86 test payment (an older server version captured the whole hold).
3. **Supabase:** turn on leaked-password protection (Authentication → Settings).
4. **Play uploads:** upload build 32 by hand, or set up a Google service account key so builds can be submitted automatically.
5. **Screenshots** of other issues to fix before the next build.

### Before launching in Mexico
- Mechanic payouts are sent in the job's currency (MXN). A US Stripe platform probably has to send cross-border payouts in USD. Needs a Stripe test-mode check and likely a code change.

### Later / needs a decision
- **Flag suspicious cancellations:** pairs who keep matching and then cancelling.
- **Database performance:** 48 policies should cache `auth.uid()`, and 38 policies overlap. Not urgent at current traffic.
- **iOS release:** location code and permission text are ready.
