# Location Tracking — Plan, Fixes, and Release Steps

_October 5, 2026_

## Why this was needed

The Oct 5 real-card cancellation-fee test showed tracking problems on both sides:

| Problem | Effect | Fixed by |
|---|---|---|
| The app saved the phone's location once (first launch) and kept reusing it | Customer requests could send the mechanic to an old location. The mechanic's first GPS point could be a saved spot miles away. | App: fresh GPS on launch and before every request |
| The mechanic's GPS stopped when the app was in the background or the screen was locked | Distance froze while the mechanic used Google Maps. A cancel during that time charged no fee. | App: background trip tracking |
| "Change" address and the booking address field only changed the text | The mechanic was routed to the phone's GPS, not the typed address | App: typed addresses are looked up (geocoded) |
| Every GPS update also re-sent the job status | A GPS update right after a cancel could reopen the job as "en route" | App: location-only updates. Database: finished jobs stay finished |
| A wrong first point made every real point look like an impossible speed | Minutes of rejected points, then one fake jump | Database: tracking restarts from the real position |
| GPS updates after a cancel still added distance | Fee could include driving after the cancel | Database: no distance after a job ends |

## What changed

### Mechanic app
- **Background trip tracking** (`lib/mechanic-trip-tracking.ts`):
  - Starts when the mechanic taps **Heading there**.
  - Keeps sending GPS every ~5 s / 10 m while the mechanic uses another app or locks the phone.
  - Android shows a "WrenchUp trip in progress" notification while it runs.
  - Stops automatically when the job ends, when the mechanic is signed out, or after 6 hours.
- **Disclosure screen** before the "Allow all the time" prompt (required by Google Play). If the mechanic taps "Not now", the app asks again after 24 hours. Without that permission, tracking works only with the app open, as before.
- **Location-only updates** (`updateMechanicLocation`): they never change the job status, and they only apply while the job is active and assigned to that mechanic.

### Customer app
- **A fresh GPS reading on every app launch.**
- **Every request uses, in order:**
  1. the address the customer chose,
  2. a GPS reading taken right now,
  3. a saved reading from the last 2 minutes.

  If none is available, the request is blocked **before** the card is authorized, with a clear message.
- **"Change" (home screen) and the booking address field** look up real coordinates for the typed address. "Refresh" switches back to GPS.

### Database (migration 057, live)
- Signed-in apps can't change the status of a cancelled or completed job.
- No distance is counted after a job ends.
- Start-point restart: if nothing has been counted yet and two real updates agree with each other, tracking restarts from them. Verified by replaying job `e02676c6`: the starting distance to the customer went from 0.005 mi (wrong) to 3.388 mi (right).

## What you need to do in Google Play Console

Background location is a "sensitive permission". **Google rejects the update unless both declarations below are filled in.** Review can take several days, so start right after uploading the build.

### 1. Location permissions declaration
Play Console → **App content** → **Location permissions** (or **Sensitive app permissions**) → **Start**.

- **Does your app access location in the background?** Yes.
- **Core functionality description** (suggested text):
  > WrenchUp connects drivers with mobile mechanics. While a mechanic is on an active job (after tapping "Heading there" until the job is completed or cancelled), the app collects the mechanic's location in the background so the customer can see the mechanic arriving and so the distance the mechanic drives is recorded accurately. That distance decides whether a cancellation fee is paid to the mechanic when a customer cancels after the mechanic has started driving. Mechanics usually navigate with Google Maps or Waze, so the WrenchUp app is in the background during most of the trip. Location collection stops automatically when the job ends. Customers' location is only used in the foreground.
- **Video** (required): a 30–60 s screen recording, uploaded to YouTube as unlisted, that shows:
  1. a mechanic accepting a job and tapping **Heading there**;
  2. the disclosure screen ("Share your location during trips") and tapping **Continue**;
  3. choosing **Allow all the time**;
  4. switching to Google Maps, with the "WrenchUp trip in progress" notification visible;
  5. the customer's screen showing the mechanic moving.

### 2. Foreground service declaration (Android 14+)
Play Console → **App content** → **Foreground service permissions** → select **Location**.
- **Description:** "Shows the mechanic a persistent notification while their trip location is shared with the customer during an active job."
- **Video:** the same video works.

### 3. Privacy policy
The privacy policy must say that mechanics' location is collected in the background during active jobs, why, and that it stops when the job ends. Update `app/legal/privacy.tsx` and the hosted policy URL in Play Console if they differ. I can draft this text.

## How to test (next build)
1. Install the new build on the mechanic phone. On first **Heading there** you should see the disclosure screen, then the system prompt. Choose **Allow all the time**.
2. Start 1–2 miles away from the customer and tap **Heading there**.
3. **Switch to Google Maps and lock the screen** for part of the drive.
4. In Supabase, watch `mechanic_location_events`. Expect steady `counted` rows, including while the app is in the background, and no long gaps.
5. Cancel as the customer while the mechanic app is **still in the background**. Expect a $5 charge within about 2 minutes, and the "trip in progress" notification should disappear.
6. Customer side:
   - Open the app somewhere new and confirm the home screen shows the new location.
   - Use **Change** to set a different address and confirm the mechanic's map routes to that address.

## Still not covered
- **iOS:** the code and permission text are ready, but there's no iOS build yet. App Review will ask the same "why Always location" question.
- **Phones still on build 31 or 32** keep foreground-only tracking. The database fixes (status guard, restart, replay guard) protect their numbers.
- **Some phone makers' battery savers** (Samsung, Xiaomi) can still pause background apps. If a test shows gaps, ask the mechanic to set WrenchUp to "Unrestricted" battery use.
