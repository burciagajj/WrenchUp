/**
 * Scheduled job (not user-facing): keeps "searching" service_requests moving
 * forward server-side. Runs on a schedule (e.g. every 2-3 min) via Supabase
 * pg_cron + pg_net, authenticated by a shared secret rather than a user
 * session — the same pattern as payment-capture-sweep. Two responsibilities:
 *
 * 1. Enforces the 15-minute mechanic-offer TTL. lib/live-dispatch.ts's
 *    releaseExpiredOffer() already does this, but it only ever runs when
 *    some client happens to poll a request past its offer_expires_at — if
 *    both the customer and the offered mechanic have the app
 *    backgrounded/killed, the offer never expires and the customer is stuck
 *    waiting on a mechanic who isn't going to respond. This mirrors that
 *    same release/reroute logic.
 *
 * 2. Resolves requests that were NEVER assigned a mechanic at all (e.g. zero
 *    mechanics were online in-region at booking time). The client-side
 *    equivalent, routeOldestUnassignedRequest() in live-dispatch.ts, only
 *    runs reactively — triggered by some other mechanic's client polling —
 *    so a request created when nobody is online can sit in "searching"
 *    indefinitely with no resolution path. This sweep actively retries
 *    routing every run, and auto-cancels (no charge — see
 *    payment-capture-sweep, which never captures an uncreated/uncharged
 *    request, and for paid requests the customer was only ever authorized,
 *    never captured, so cancelling here means the hold simply expires
 *    un-captured) requests that have been unmatched too long, using the same
 *    staleness thresholds as the client (lib/live-dispatch.ts's
 *    isStaleDispatchRequest — reimplemented here since this route can't
 *    import that client module, matching the existing pattern in this file).
 */
import { getNotificationServiceConfig, supabaseRest } from "@/lib/notification-service";
import { buildDispatchNotificationContent } from "@/lib/dispatch-notifications-core";
import { filterFreshMechanicPresence, presenceStaleCutoffIso } from "@/lib/mechanic-presence-core";
import { excludeThrottledMechanics, isMechanicOfferThrottled } from "@/lib/mechanic-cancel-penalty-core";

const OFFER_TTL_MS = 15 * 60 * 1000;
const OPEN_REQUEST_MAX_AGE_MS = 45 * 60 * 1000; // 45 minutes — mirrors live-dispatch.ts
const BOOKED_REQUEST_PAST_GRACE_MS = 30 * 60 * 1000; // 30 minutes — mirrors live-dispatch.ts
const BOOKED_REQUEST_LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — mirrors live-dispatch.ts

type SweepCandidate = {
  id: string;
  customer_user_id: string;
  customer_name: string | null;
  service_code: string;
  scheduled_for: string | null;
  assigned_mechanic_user_id: string | null;
  region_code?: "US" | "MX" | null;
  offered_price?: number;
  base_offered_price?: number | null;
  platform_fee_rate?: number | null;
};

const DEFAULT_PLATFORM_FEE_RATE = 0.12;

/**
 * Mirrors deriveResetOfferedPriceFields() in lib/live-dispatch.ts — reset
 * offered_price back to what the customer actually authorized whenever this
 * sweep reassigns a request away from its current mechanic, so a departing
 * mechanic's never-agreed-to counter-offer doesn't silently survive onto
 * whoever gets matched next. Reimplemented here (not imported) since this
 * route can't import that client module — matching the existing pattern in
 * this file.
 */
function resetOfferedPriceFields(row: {
  offered_price?: number;
  base_offered_price?: number | null;
  platform_fee_rate?: number | null;
}): { offered_price: number; platform_fee_amount: number; mechanic_payout: number } | Record<string, never> {
  const baseline =
    typeof row.base_offered_price === "number" && row.base_offered_price > 0
      ? row.base_offered_price
      : row.offered_price;
  if (!baseline || !Number.isFinite(baseline) || baseline <= 0) return {};
  const feeRate = row.platform_fee_rate ?? DEFAULT_PLATFORM_FEE_RATE;
  const servicePortion = +(baseline / (1 + feeRate)).toFixed(2);
  const platformFeeAmount = +(baseline - servicePortion).toFixed(2);
  return { offered_price: baseline, platform_fee_amount: platformFeeAmount, mechanic_payout: servicePortion };
}

type UnmatchedCandidate = SweepCandidate & {
  created_at: string;
};

function isStaleUnmatchedRequest(row: UnmatchedCandidate, nowMs: number): boolean {
  const createdAtMs = Date.parse(row.created_at);
  const scheduledForMs = row.scheduled_for ? Date.parse(row.scheduled_for) : NaN;
  const isBooked = Number.isFinite(scheduledForMs);
  if (isBooked) {
    return (
      scheduledForMs < nowMs - BOOKED_REQUEST_PAST_GRACE_MS ||
      scheduledForMs > nowMs + BOOKED_REQUEST_LOOKAHEAD_MS
    );
  }
  return !Number.isFinite(createdAtMs) || createdAtMs < nowMs - OPEN_REQUEST_MAX_AGE_MS;
}

type MechanicPresenceRow = {
  mechanic_user_id: string;
  mechanic_name: string | null;
  is_online: boolean;
  updated_at?: string | null;
  region_code?: "US" | "MX" | null;
};

type ProfilePushRow = {
  expo_push_token: string | null;
};

function getCronSecret(): string {
  return process.env.CRON_SECRET || "";
}

function selectForRegion(rows: MechanicPresenceRow[], regionCode?: "US" | "MX" | null): MechanicPresenceRow[] {
  if (!regionCode) return rows;
  const exact = rows.filter((row) => row.region_code === regionCode);
  if (exact.length > 0) return exact;
  return rows.filter((row) => row.region_code == null);
}

async function fetchThrottledMechanicIds(serviceKey: string, candidateUserIds: string[]): Promise<Set<string>> {
  if (candidateUserIds.length === 0) return new Set();
  const idList = candidateUserIds.map((id) => encodeURIComponent(id)).join(",");
  const rows = await supabaseRest<{ user_id: string; mechanic_offer_throttled_until: string | null }[]>(
    `/user_profiles?user_id=in.(${idList})&mechanic_offer_throttled_until=not.is.null&select=user_id,mechanic_offer_throttled_until`,
    "GET",
    serviceKey,
  ).catch(() => null);
  const throttled = new Set<string>();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (isMechanicOfferThrottled(row.mechanic_offer_throttled_until)) throttled.add(row.user_id);
  }
  return throttled;
}

async function fetchNextMechanic(
  serviceKey: string,
  candidate: SweepCandidate,
): Promise<MechanicPresenceRow | null> {
  const freshnessFilter = `&updated_at=gte.${encodeURIComponent(presenceStaleCutoffIso())}`;
  const rows = await supabaseRest<MechanicPresenceRow[]>(
    `/mechanic_presence?is_online=eq.true${freshnessFilter}&order=updated_at.asc&select=mechanic_user_id,mechanic_name,is_online,updated_at,region_code`,
    "GET",
    serviceKey,
  ).catch(() => null);
  const fresh = filterFreshMechanicPresence(Array.isArray(rows) ? rows : []);
  const forRegion = selectForRegion(fresh, candidate.region_code);
  const eligible = forRegion.filter((m) => m.mechanic_user_id !== candidate.assigned_mechanic_user_id);
  const throttled = await fetchThrottledMechanicIds(
    serviceKey,
    eligible.map((m) => m.mechanic_user_id),
  );
  return excludeThrottledMechanics(eligible, throttled)[0] ?? null;
}

async function getPushToken(serviceKey: string, userId: string): Promise<string | null> {
  const rows = await supabaseRest<ProfilePushRow[]>(
    `/user_profiles?user_id=eq.${encodeURIComponent(userId)}&select=expo_push_token&limit=1`,
    "GET",
    serviceKey,
  ).catch(() => null);
  const token = Array.isArray(rows) ? rows[0]?.expo_push_token?.trim() : "";
  return token || null;
}

async function notifyNextMechanic(
  serviceKey: string,
  candidate: SweepCandidate,
  mechanic: MechanicPresenceRow,
): Promise<void> {
  const token = await getPushToken(serviceKey, mechanic.mechanic_user_id);
  if (!token) return;
  const content = buildDispatchNotificationContent({
    event: "new_service_request",
    requestId: candidate.id,
    scheduledFor: candidate.scheduled_for,
    customerName: candidate.customer_name,
    mechanicName: mechanic.mechanic_name,
    serviceCode: candidate.service_code,
  });
  await sendExpoPushSafe(token, content.title, content.body, {
    requestId: candidate.id,
    service_request_id: candidate.id,
    route: content.route,
    event: "new_service_request",
  });
}

async function sendExpoPushSafe(
  token: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ to: token, sound: "default", title, body, data }),
    });
  } catch (error) {
    console.warn("[offer-expiry-sweep] Push failed:", error);
  }
}

/**
 * Handles requests that were never assigned a mechanic at all: retries
 * routing if any online mechanic is now available, or auto-cancels
 * (no charge — see file header) requests that have been waiting too long
 * per isStaleUnmatchedRequest. Returns per-run counts.
 */
async function sweepUnmatchedRequests(serviceKey: string): Promise<{
  routed: number;
  autoCancelled: number;
  stillWaiting: number;
  skippedRace: number;
  failed: number;
}> {
  let routed = 0;
  let autoCancelled = 0;
  let stillWaiting = 0;
  let skippedRace = 0;
  let failed = 0;

  let rows: UnmatchedCandidate[] = [];
  try {
    rows =
      (await supabaseRest<UnmatchedCandidate[]>(
        `/service_requests?status=eq.searching&assigned_mechanic_user_id=is.null&select=id,customer_user_id,customer_name,service_code,scheduled_for,assigned_mechanic_user_id,region_code,created_at&order=created_at.asc&limit=200`,
        "GET",
        serviceKey,
      )) ?? [];
  } catch (error) {
    console.error("[offer-expiry-sweep] Failed to fetch unmatched candidates:", error);
    return { routed, autoCancelled, stillWaiting, skippedRace, failed: 1 };
  }

  const nowMs = Date.now();
  for (const row of rows) {
    try {
      if (isStaleUnmatchedRequest(row, nowMs)) {
        const cancelledAtIso = new Date().toISOString();
        const cancelled = await supabaseRest<UnmatchedCandidate[]>(
          `/service_requests?id=eq.${encodeURIComponent(row.id)}&status=eq.searching&assigned_mechanic_user_id=is.null`,
          "PATCH",
          serviceKey,
          {
            status: "cancelled",
            cancel_reason: "No mechanic became available in time.",
            cancelled_at: cancelledAtIso,
            updated_at: cancelledAtIso,
          },
        );
        if (Array.isArray(cancelled) && cancelled.length > 0) {
          autoCancelled += 1;
        } else {
          skippedRace += 1;
        }
        continue;
      }

      const next = await fetchNextMechanic(serviceKey, row);
      if (!next) {
        stillWaiting += 1;
        continue;
      }

      const nowIso2 = new Date().toISOString();
      const assigned = await supabaseRest<UnmatchedCandidate[]>(
        `/service_requests?id=eq.${encodeURIComponent(row.id)}&status=eq.searching&assigned_mechanic_user_id=is.null`,
        "PATCH",
        serviceKey,
        {
          assigned_mechanic_user_id: next.mechanic_user_id,
          assigned_mechanic_name: next.mechanic_name ?? "Mechanic",
          mechanic_offer_sent_at: nowIso2,
          offer_expires_at: new Date(Date.now() + OFFER_TTL_MS).toISOString(),
          customer_quote_accepted_at: null,
          mechanic_accepted_at: null,
          mechanic_offer_price_sent_at: null,
          updated_at: nowIso2,
        },
      );
      if (Array.isArray(assigned) && assigned.length > 0) {
        routed += 1;
        void notifyNextMechanic(serviceKey, row, next).catch((error) => {
          console.warn("[offer-expiry-sweep] Notify next mechanic (unmatched) failed:", error);
        });
      } else {
        // Someone (a client, or another sweep run) already handled this row.
        skippedRace += 1;
      }
    } catch (error) {
      console.error(`[offer-expiry-sweep] Error processing unmatched ${row.id}:`, error);
      failed += 1;
    }
  }

  return { routed, autoCancelled, stillWaiting, skippedRace, failed };
}

export async function POST(request: Request) {
  const cronSecret = getCronSecret();
  const authHeader = request.headers.get("authorization") || "";
  const providedSecret = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

  if (!cronSecret) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (!providedSecret || providedSecret !== cronSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { serviceKey } = getNotificationServiceConfig();
  if (!serviceKey) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });
  }

  const nowIso = new Date().toISOString();
  let candidates: SweepCandidate[] = [];
  try {
    candidates =
      (await supabaseRest<SweepCandidate[]>(
        // A mechanic who already sent a real priced counter-offer
        // (mechanic_offer_price_sent_at set) is exempt from this timer —
        // the customer should always be able to see and act on that offer,
        // not have it silently reassigned away. Mirrors isExpiredOffer() in
        // lib/live-dispatch.ts.
        `/service_requests?status=eq.searching&assigned_mechanic_user_id=not.is.null&mechanic_accepted_at=is.null&mechanic_offer_price_sent_at=is.null&offer_expires_at=lte.${encodeURIComponent(
          nowIso,
        )}&select=id,customer_user_id,customer_name,service_code,scheduled_for,assigned_mechanic_user_id,region_code,offered_price,base_offered_price,platform_fee_rate&limit=200`,
        "GET",
        serviceKey,
      )) ?? [];
  } catch (error) {
    console.error("[offer-expiry-sweep] Failed to fetch candidates:", error);
    return Response.json({ error: "Failed to fetch candidates" }, { status: 500 });
  }

  let reassigned = 0;
  let unassigned = 0;
  let skippedRace = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      const next = await fetchNextMechanic(serviceKey, candidate);
      const nowIso2 = new Date().toISOString();

      if (!next) {
        // No fresh online mechanic available right now — clear the stale
        // offer so a future sweep (or client) can retry once someone comes online.
        const cleared = await supabaseRest<SweepCandidate[]>(
          `/service_requests?id=eq.${encodeURIComponent(candidate.id)}&status=eq.searching&assigned_mechanic_user_id=eq.${encodeURIComponent(
            candidate.assigned_mechanic_user_id ?? "",
          )}`,
          "PATCH",
          serviceKey,
          {
            assigned_mechanic_user_id: null,
            assigned_mechanic_name: null,
            mechanic_offer_sent_at: null,
            offer_expires_at: null,
            customer_quote_accepted_at: null,
            mechanic_offer_price_sent_at: null,
            ...resetOfferedPriceFields(candidate),
            updated_at: nowIso2,
          },
        );
        if (Array.isArray(cleared) && cleared.length > 0) {
          unassigned += 1;
        } else {
          skippedRace += 1;
        }
        continue;
      }

      const reassignedRows = await supabaseRest<SweepCandidate[]>(
        `/service_requests?id=eq.${encodeURIComponent(candidate.id)}&status=eq.searching&assigned_mechanic_user_id=eq.${encodeURIComponent(
          candidate.assigned_mechanic_user_id ?? "",
        )}`,
        "PATCH",
        serviceKey,
        {
          assigned_mechanic_user_id: next.mechanic_user_id,
          assigned_mechanic_name: next.mechanic_name ?? "Mechanic",
          mechanic_offer_sent_at: nowIso2,
          offer_expires_at: new Date(Date.now() + OFFER_TTL_MS).toISOString(),
          customer_quote_accepted_at: null,
          mechanic_accepted_at: null,
          mechanic_offer_price_sent_at: null,
          ...resetOfferedPriceFields(candidate),
          updated_at: nowIso2,
        },
      );
      if (Array.isArray(reassignedRows) && reassignedRows.length > 0) {
        reassigned += 1;
        void notifyNextMechanic(serviceKey, candidate, next).catch((error) => {
          console.warn("[offer-expiry-sweep] Notify next mechanic failed:", error);
        });
      } else {
        // Someone (a client, or another sweep run) already handled this row.
        skippedRace += 1;
      }
    } catch (error) {
      console.error(`[offer-expiry-sweep] Error processing ${candidate.id}:`, error);
      failed += 1;
    }
  }

  const unmatched = await sweepUnmatchedRequests(serviceKey);

  return Response.json({
    processed: candidates.length,
    reassigned,
    unassigned,
    skippedRace: skippedRace + unmatched.skippedRace,
    failed: failed + unmatched.failed,
    unmatchedProcessed:
      unmatched.routed + unmatched.autoCancelled + unmatched.stillWaiting + unmatched.skippedRace + unmatched.failed,
    unmatchedRouted: unmatched.routed,
    unmatchedAutoCancelled: unmatched.autoCancelled,
    unmatchedStillWaiting: unmatched.stillWaiting,
  });
}
