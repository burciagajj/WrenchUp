import { recordAnalyticsEvent } from "@/lib/analytics-service";
import { buildDispatchNotificationContent } from "@/lib/dispatch-notifications-core";
import {
  getCurrentUserAuth,
  getNotificationServiceConfig,
  sendExpoPush,
  supabaseRest,
} from "@/lib/notification-service";
import { filterFreshMechanicPresence, presenceStaleCutoffIso } from "@/lib/mechanic-presence-core";
import {
  computeNextCancelStrikeState,
  computeNextDeclineStreakState,
  excludeThrottledMechanics,
  isMechanicOfferThrottled,
  isPenalizableCancelStatus,
} from "@/lib/mechanic-cancel-penalty-core";

type ServiceRequestRow = {
  id: string;
  customer_user_id: string;
  customer_name: string | null;
  service_code: string;
  scheduled_for: string | null;
  customer_note: string | null;
  status: string;
  assigned_mechanic_user_id: string | null;
  assigned_mechanic_name: string | null;
  region_code?: "US" | "MX" | null;
  offered_price?: number;
  base_offered_price?: number | null;
  platform_fee_rate?: number | null;
  before_photo_url?: string | null;
  after_photo_url?: string | null;
  evidence_history?: unknown[] | null;
};

const DEFAULT_PLATFORM_FEE_RATE = 0.12;

/**
 * Mirrors deriveResetOfferedPriceFields() in lib/live-dispatch.ts — a
 * departing mechanic's never-agreed-to counter-offer shouldn't survive onto
 * whoever gets matched next after this release/reassign.
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

type MechanicPenaltyProfileRow = {
  user_id: string;
  mechanic_cancel_strikes: number | null;
  mechanic_last_cancel_at: string | null;
  mechanic_consecutive_declines: number | null;
  mechanic_last_decline_at: string | null;
};

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

type MechanicCancelResult = {
  status: number;
  body: {
    data?: {
      request: ServiceRequestRow;
      released: boolean;
      reassigned?: boolean;
      nextMechanicUserId?: string | null;
    };
    error?: string;
  };
};

const OFFER_TTL_MS = 15 * 60 * 1000;

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isReleasableStatus(status: string): boolean {
  return status === "searching" || status === "accepted" || status === "enroute" || status === "arrived" || status === "in_progress";
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
  request: ServiceRequestRow,
  currentMechanicUserId: string,
): Promise<MechanicPresenceRow | null> {
  const regionFilter = request.region_code ? `&region_code=eq.${request.region_code}` : "";
  const freshnessFilter = `&updated_at=gte.${encodeURIComponent(presenceStaleCutoffIso())}`;
  const rows = await supabaseRest<MechanicPresenceRow[]>(
    `/mechanic_presence?is_online=eq.true${regionFilter}${freshnessFilter}&order=updated_at.asc&select=mechanic_user_id,mechanic_name,is_online,updated_at,region_code`,
    "GET",
    serviceKey,
  );
  const online = filterFreshMechanicPresence(Array.isArray(rows) ? rows : []);
  const candidates = online.filter(
    (mechanic) =>
      mechanic.mechanic_user_id !== currentMechanicUserId &&
      mechanic.mechanic_user_id !== request.customer_user_id,
  );
  const throttled = await fetchThrottledMechanicIds(
    serviceKey,
    candidates.map((m) => m.mechanic_user_id),
  );
  const eligible = excludeThrottledMechanics(candidates, throttled);
  return eligible[0] ?? null;
}

async function getPushToken(serviceKey: string, userId: string): Promise<string | null> {
  const rows = await supabaseRest<ProfilePushRow[]>(
    `/user_profiles?user_id=eq.${encodeURIComponent(userId)}&select=expo_push_token&limit=1`,
    "GET",
    serviceKey,
  );
  const token = Array.isArray(rows) ? rows[0]?.expo_push_token?.trim() : "";
  return token || null;
}

async function notifyCustomerStillSearching(
  serviceKey: string,
  request: ServiceRequestRow,
  reason?: string | null,
  reassigned?: boolean,
): Promise<void> {
  const token = await getPushToken(serviceKey, request.customer_user_id);
  if (!token) return;
  const isNoShow = reason === "customer_no_show";
  const title = isNoShow
    ? "Mechanic couldn't find you"
    : reassigned
      ? "New mechanic matched"
      : "Still looking for a mechanic";
  const body = isNoShow
    ? "Your mechanic arrived but couldn't reach you or find your vehicle, so we're matching you with another mechanic. Make sure your location and vehicle details are accurate."
    : reassigned
      ? "Your mechanic cancelled, but we already matched you with another one — tap to see the update."
      : "Your mechanic cancelled and we're still looking for a replacement. Keep this open — we'll match you as soon as someone's available, or you can rebook from the home screen.";
  await sendExpoPush(token, title, body, {
    requestId: request.id,
    service_request_id: request.id,
    route: "/request-pending",
    event: isNoShow ? "mechanic_reported_no_show" : "mechanic_cancelled_retry",
  });
}

async function notifyNextMechanic(
  serviceKey: string,
  request: ServiceRequestRow,
  mechanic: MechanicPresenceRow,
): Promise<void> {
  const token = await getPushToken(serviceKey, mechanic.mechanic_user_id);
  if (!token) return;
  const content = buildDispatchNotificationContent({
    event: "new_service_request",
    requestId: request.id,
    scheduledFor: request.scheduled_for,
    customerName: request.customer_name,
    mechanicName: mechanic.mechanic_name,
    serviceCode: request.service_code,
  });
  await sendExpoPush(token, content.title, content.body, {
    requestId: request.id,
    service_request_id: request.id,
    route: content.route,
    event: "new_service_request",
  });
}

async function applyMechanicCancelStrike(serviceKey: string, mechanicUserId: string): Promise<void> {
  const rows = await supabaseRest<MechanicPenaltyProfileRow[]>(
    `/user_profiles?user_id=eq.${encodeURIComponent(mechanicUserId)}&select=user_id,mechanic_cancel_strikes,mechanic_last_cancel_at&limit=1`,
    "GET",
    serviceKey,
  ).catch(() => null);
  const profile = Array.isArray(rows) ? rows[0] ?? null : null;
  const currentStrikes = profile?.mechanic_cancel_strikes ?? 0;
  const lastCancelAtMs = profile?.mechanic_last_cancel_at ? Date.parse(profile.mechanic_last_cancel_at) : NaN;
  const { strikes, throttledUntilMs } = computeNextCancelStrikeState({
    currentStrikes,
    lastCancelAtMs: Number.isFinite(lastCancelAtMs) ? lastCancelAtMs : null,
  });
  const nowIso = new Date().toISOString();
  await supabaseRest(`/user_profiles?user_id=eq.${encodeURIComponent(mechanicUserId)}`, "PATCH", serviceKey, {
    mechanic_cancel_strikes: strikes,
    mechanic_last_cancel_at: nowIso,
    // Only overwrite the throttle when this event itself crosses the
    // threshold — don't clear an existing throttle (e.g. from the separate
    // decline-streak system) just because this particular cancel didn't.
    ...(throttledUntilMs ? { mechanic_offer_throttled_until: new Date(throttledUntilMs).toISOString() } : {}),
  }).catch((error) => {
    console.warn("[mechanic-cancel] Failed to record cancel strike:", error);
  });
}

async function applyMechanicDeclineStreak(serviceKey: string, mechanicUserId: string): Promise<void> {
  const rows = await supabaseRest<MechanicPenaltyProfileRow[]>(
    `/user_profiles?user_id=eq.${encodeURIComponent(mechanicUserId)}&select=user_id,mechanic_consecutive_declines,mechanic_last_decline_at&limit=1`,
    "GET",
    serviceKey,
  ).catch(() => null);
  const profile = Array.isArray(rows) ? rows[0] ?? null : null;
  const currentStreak = profile?.mechanic_consecutive_declines ?? 0;
  const lastDeclineAtMs = profile?.mechanic_last_decline_at ? Date.parse(profile.mechanic_last_decline_at) : NaN;
  const { streak, throttledUntilMs } = computeNextDeclineStreakState({
    currentStreak,
    lastDeclineAtMs: Number.isFinite(lastDeclineAtMs) ? lastDeclineAtMs : null,
  });
  const nowIso = new Date().toISOString();
  await supabaseRest(`/user_profiles?user_id=eq.${encodeURIComponent(mechanicUserId)}`, "PATCH", serviceKey, {
    mechanic_consecutive_declines: streak,
    mechanic_last_decline_at: nowIso,
    // Only overwrite the throttle once this streak actually crosses the
    // threshold — don't clear an existing (e.g. cancel-strike) throttle just
    // because this particular decline didn't itself trigger one.
    ...(throttledUntilMs ? { mechanic_offer_throttled_until: new Date(throttledUntilMs).toISOString() } : {}),
  }).catch((error) => {
    console.warn("[mechanic-cancel] Failed to record decline streak:", error);
  });
}

export async function releaseServiceRequestFromMechanic(input: {
  sessionToken: string;
  requestId: unknown;
  reason?: unknown;
}): Promise<MechanicCancelResult> {
  const reason = normalizeText(input.reason) || null;
  try {
    const { supabaseUrl, serviceKey } = getNotificationServiceConfig();
    if (!supabaseUrl || !serviceKey) {
      return { status: 503, body: { error: "Dispatch release service unavailable" } };
    }

    if (!input.sessionToken) {
      return { status: 401, body: { error: "Unauthorized" } };
    }

    const currentUser = await getCurrentUserAuth(supabaseUrl, serviceKey, input.sessionToken);
    if (!currentUser?.id) {
      return { status: 401, body: { error: "Unauthorized" } };
    }

    const requestId = normalizeText(input.requestId);
    if (!requestId) {
      return { status: 400, body: { error: "requestId is required" } };
    }

    const requestRows = await supabaseRest<ServiceRequestRow[]>(
      `/service_requests?id=eq.${encodeURIComponent(requestId)}&select=id,customer_user_id,customer_name,service_code,scheduled_for,customer_note,status,assigned_mechanic_user_id,assigned_mechanic_name,region_code,offered_price,base_offered_price,platform_fee_rate,before_photo_url,after_photo_url,evidence_history&limit=1`,
      "GET",
      serviceKey,
    );
    const serviceRequest = Array.isArray(requestRows) ? requestRows[0] ?? null : null;
    if (!serviceRequest) {
      return { status: 404, body: { error: "Request not found" } };
    }
    if (serviceRequest.assigned_mechanic_user_id !== currentUser.id) {
      return { status: 403, body: { error: "Only the assigned mechanic can cancel this trip." } };
    }
    if (!isReleasableStatus(serviceRequest.status)) {
      return { status: 200, body: { data: { request: serviceRequest, released: false } } };
    }

    const nextMechanic = await fetchNextMechanic(serviceKey, serviceRequest, currentUser.id);
    const now = new Date();
    const nowIso = now.toISOString();
    const reassignmentPatch = nextMechanic
      ? {
          assigned_mechanic_user_id: nextMechanic.mechanic_user_id,
          assigned_mechanic_name: nextMechanic.mechanic_name ?? "Mechanic",
          mechanic_offer_sent_at: nowIso,
          offer_expires_at: new Date(now.getTime() + OFFER_TTL_MS).toISOString(),
          // The new mechanic hasn't sent a price yet — don't inherit the
          // previous mechanic's "don't expire me" flag, or their never-agreed
          // price (see resetOfferedPriceFields above).
          mechanic_offer_price_sent_at: null,
          ...resetOfferedPriceFields(serviceRequest),
        }
      : {
          assigned_mechanic_user_id: null,
          assigned_mechanic_name: null,
          mechanic_offer_sent_at: null,
          offer_expires_at: null,
          mechanic_offer_price_sent_at: null,
          ...resetOfferedPriceFields(serviceRequest),
        };

    // Preserve the departing mechanic's before/after evidence in an
    // append-only history array before clearing the live photo columns for
    // whoever gets matched next — otherwise this evidence is permanently
    // lost, which matters if a dispute surfaces after reassignment.
    const priorEvidence = Array.isArray(serviceRequest.evidence_history) ? serviceRequest.evidence_history : [];
    const hasOutgoingEvidence = Boolean(serviceRequest.before_photo_url || serviceRequest.after_photo_url);
    const evidenceHistory = hasOutgoingEvidence
      ? [
          ...priorEvidence,
          {
            mechanic_user_id: currentUser.id,
            mechanic_name: serviceRequest.assigned_mechanic_name ?? null,
            before_photo_url: serviceRequest.before_photo_url ?? null,
            after_photo_url: serviceRequest.after_photo_url ?? null,
            released_at: nowIso,
            reason,
          },
        ]
      : priorEvidence;

    const releaseFilter = `/service_requests?id=eq.${encodeURIComponent(requestId)}&assigned_mechanic_user_id=eq.${encodeURIComponent(currentUser.id)}`;
    const basePatch: Record<string, unknown> = {
      status: "searching",
      ...reassignmentPatch,
      customer_quote_accepted_at: null,
      mechanic_accepted_at: null,
      mechanic_latitude: null,
      mechanic_longitude: null,
      mechanic_marked_done_at: null,
      mechanic_enroute_at: null,
      mechanic_arrived_at: null,
      job_started_at: null,
      job_completed_at: null,
      before_photo_url: null,
      after_photo_url: null,
      evidence_history: evidenceHistory,
      cancelled_by_role: "mechanic",
      cancelled_by_user_id: currentUser.id,
      cancelled_at: nowIso,
      updated_at: nowIso,
    };
    const patchRelease = (payload: Record<string, unknown>) =>
      supabaseRest<ServiceRequestRow[]>(releaseFilter, "PATCH", serviceKey, payload);
    let updatedRows: ServiceRequestRow[] | null;
    try {
      // no_show_reported_at / cancel_reason are recent additions — degrade
      // gracefully instead of failing the whole release if either migration
      // hasn't run yet on this environment.
      updatedRows = await patchRelease({
        ...basePatch,
        no_show_reported_at: null,
        cancel_reason: reason,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message.toLowerCase() : "";
      if (!msg.includes("does not exist") && !msg.includes("schema cache")) {
        throw error;
      }
      try {
        updatedRows = await patchRelease(basePatch);
      } catch (innerError) {
        const innerMsg = innerError instanceof Error ? innerError.message.toLowerCase() : "";
        if (!innerMsg.includes("does not exist") && !innerMsg.includes("schema cache")) {
          throw innerError;
        }
        // evidence_history migration hasn't run on this environment yet —
        // drop just that field rather than failing the whole cancellation.
        const { evidence_history: _omit, ...basePatchWithoutEvidence } = basePatch;
        updatedRows = await patchRelease(basePatchWithoutEvidence);
      }
    }
    const updated = Array.isArray(updatedRows) ? updatedRows[0] ?? null : null;
    if (!updated) {
      return { status: 409, body: { error: "Request was already updated by another device." } };
    }

    // Only a cancellation of a job the mechanic had already committed to
    // (accepted/enroute/arrived/in_progress) counts as a strike.
    if (reason !== "customer_no_show" && isPenalizableCancelStatus(serviceRequest.status)) {
      void applyMechanicCancelStrike(serviceKey, currentUser.id);
    } else if (serviceRequest.status === "searching") {
      // Releasing an offer that was never accepted is a decline, not a
      // cancellation — tracked separately as a (shorter, lighter) streak.
      void applyMechanicDeclineStreak(serviceKey, currentUser.id);
    }

    void notifyCustomerStillSearching(serviceKey, serviceRequest, reason, Boolean(nextMechanic)).catch((error) => {
      console.warn("[mechanic-cancel] Customer push failed:", error);
    });
    if (nextMechanic) {
      void notifyNextMechanic(serviceKey, serviceRequest, nextMechanic).catch((error) => {
        console.warn("[mechanic-cancel] Next mechanic push failed:", error);
      });
      void recordAnalyticsEvent({
        eventName: "mechanic_matched",
        userId: nextMechanic.mechanic_user_id,
        role: "mechanic",
        properties: {
          request_id: serviceRequest.id,
          customer_user_id: serviceRequest.customer_user_id,
          mechanic_user_id: nextMechanic.mechanic_user_id,
          mechanic_name: nextMechanic.mechanic_name ?? "Mechanic",
          service_code: serviceRequest.service_code,
          region_code: serviceRequest.region_code ?? null,
          match_source: "mechanic_cancel_reassign",
        },
      });
    } else {
      void recordAnalyticsEvent({
        eventName: "match_failed",
        userId: serviceRequest.customer_user_id,
        role: "customer",
        properties: {
          request_id: serviceRequest.id,
          released_mechanic_user_id: currentUser.id,
          service_code: serviceRequest.service_code,
          region_code: serviceRequest.region_code ?? null,
          reason: "no_online_mechanic_after_cancel",
        },
      });
    }

    return {
      status: 200,
      body: {
        data: {
          request: updated,
          released: true,
          reassigned: Boolean(nextMechanic),
          nextMechanicUserId: nextMechanic?.mechanic_user_id ?? null,
        },
      },
    };
  } catch (error) {
    console.error("[mechanic-cancel] Failed:", error);
    return { status: 500, body: { error: "Could not cancel and re-dispatch request" } };
  }
}
