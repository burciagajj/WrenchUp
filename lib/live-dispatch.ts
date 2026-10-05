import { ensureValidAccessToken } from "@/lib/profile-session";
import { getApiUrl, shouldUseSupabaseFallbackForLocalApi } from "@/lib/api-base-url";
import { parseMechanicOfferMessage, type MechanicOffer } from "@/lib/mechanic-offer";
import { notifyDispatchEvent } from "@/lib/dispatch-notifications";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { paymentStateAfterDisputeCheck } from "@/lib/safety-core";
import { filterFreshMechanicPresence, presenceStaleCutoffIso } from "@/lib/mechanic-presence-core";
import { excludeThrottledMechanics } from "@/lib/mechanic-cancel-penalty-core";
import { getCapabilityRequirementForService } from "@/lib/service-capabilities";

export type DispatchStatus =
  | "searching"
  | "accepted"
  | "enroute"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled";

export type DispatchRequest = {
  id: string;
  customer_user_id: string;
  customer_name: string | null;
  customer_photo_url?: string | null;
  service_code: string;
  vehicle_label: string;
  location_label: string;
  offered_price: number;
  // Immutable "what the customer actually authorized" baseline, set once at
  // creation. offered_price gets overwritten by every mechanic counter-offer
  // and needs to be reset back to this on reassignment — see
  // deriveResetOfferedPriceFields() below.
  base_offered_price?: number | null;
  currency: string;
  oil_package?: "conventional" | "synthetic_blend" | "full_synthetic" | null;
  scheduled_for?: string | null;
  customer_note?: string | null;
  customer_has_parts?: boolean | null;
  issue_photo_url?: string | null;
  // Mechanic-proposed, receipt-backed parts reimbursement — a separate money
  // flow from offered_price/base_offered_price above, settled via its own
  // Stripe hold (parts_payment_intent_id). See proposePartsCost(),
  // confirmPartsPaymentAuthorized(), and app/api/parts-payment-intent+api.ts.
  parts_cost?: number | null;
  parts_receipt_path?: string | null;
  parts_payment_intent_id?: string | null;
  parts_payment_status?: "none" | "proposed" | "authorized" | "captured" | "capture_failed" | "declined" | "canceled" | null;
  parts_proposed_at?: string | null;
  parts_authorized_at?: string | null;
  platform_fee_rate?: number | null;
  platform_fee_amount?: number | null;
  mechanic_payout?: number | null;
  status: DispatchStatus;
  assigned_mechanic_user_id: string | null;
  assigned_mechanic_name: string | null;
  mechanic_offer_sent_at?: string | null;
  offer_expires_at?: string | null;
  // Set the moment a mechanic sends an actual priced counter-offer (via
  // updateDispatchOfferedPrice), as opposed to mechanic_offer_sent_at which
  // is set on every initial dispatch/reassignment regardless of whether the
  // mechanic ever responds with a price. Once set, the request is exempt
  // from the 15-minute offer_expires_at TTL reassignment — see
  // isExpiredOffer() below and offer-expiry-sweep+api.ts.
  mechanic_offer_price_sent_at?: string | null;
  customer_quote_accepted_at?: string | null;
  mechanic_accepted_at?: string | null;
  stripe_payment_intent_id?: string | null;
  customer_latitude?: number | null;
  customer_longitude?: number | null;
  mechanic_latitude?: number | null;
  mechanic_longitude?: number | null;
  mechanic_location_updated_at?: string | null;
  mechanic_marked_done_at?: string | null;
  no_show_reported_at?: string | null;
  customer_completed_at?: string | null;
  payment_state?: string | null;
  dispute_window_ends_at?: string | null;
  funds_release_at?: string | null;
  before_photo_url?: string | null;
  after_photo_url?: string | null;
  cancel_reason?: string | null;
  cancelled_at?: string | null;
  cancelled_by_role?: "customer" | "mechanic" | null;
  cancelled_by_user_id?: string | null;
  receipt_number: string | null;
  region_code?: "US" | "MX" | null;
  rating?: number | null;
  tip?: number | null;
  rating_comment?: string | null;
  customer_rating?: number | null;
  customer_rating_comment?: string | null;
  created_at: string;
  updated_at: string;
};

export type ServiceMessage = {
  id: string;
  request_id: string;
  sender_user_id: string;
  sender_role: "customer" | "mechanic";
  message: string;
  created_at: string;
};

type MechanicPresenceRow = {
  mechanic_user_id: string;
  mechanic_name: string | null;
  is_online: boolean;
  updated_at?: string | null;
  region_code?: "US" | "MX" | null;
};

const OPEN_REQUEST_MAX_AGE_MS = 45 * 60 * 1000; // 45 minutes
const BOOKED_REQUEST_PAST_GRACE_MS = 30 * 60 * 1000; // 30 minutes
const BOOKED_REQUEST_LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
const OFFER_TTL_MS = 15 * 60 * 1000;

type DispatchWriteTask<T> = () => Promise<T>;

type QueuedDispatchWrite<T> = {
  key: string;
  task: DispatchWriteTask<T>;
  attempt: number;
  nextDelayMs: number;
};

const dispatchWriteQueue = new Map<string, QueuedDispatchWrite<unknown>>();
let dispatchWriteFlushTimer: ReturnType<typeof setTimeout> | null = null;

export function isNetworkUnavailableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "NETWORK_UNAVAILABLE" ||
      (error as Error & { code?: string }).code === "NETWORK_UNAVAILABLE")
  );
}

function isNetworkUnavailableCause(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    error.name === "AbortError" ||
    message.includes("network request failed") ||
    message === "aborted" ||
    message.includes("request timed out")
  );
}

function asNetworkUnavailableError(cause: unknown): Error {
  const tagged = new Error("NETWORK_UNAVAILABLE");
  const extended = tagged as Error & { cause?: unknown; code?: string };
  extended.cause = cause;
  extended.code = "NETWORK_UNAVAILABLE";
  return tagged;
}

function isRetryableDispatchWriteError(error: unknown): boolean {
  return isNetworkUnavailableError(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scheduleDispatchWriteFlush(delayMs = 1000): void {
  if (dispatchWriteFlushTimer) return;
  dispatchWriteFlushTimer = setTimeout(() => {
    dispatchWriteFlushTimer = null;
    void flushDispatchWriteQueue();
  }, delayMs);
}

function enqueueDispatchWrite<T>(key: string, task: DispatchWriteTask<T>, attempt = 0): void {
  dispatchWriteQueue.set(key, {
    key,
    task: task as DispatchWriteTask<unknown>,
    attempt,
    nextDelayMs: Math.min(30_000, 1000 * Math.max(1, attempt + 1)),
  });
  scheduleDispatchWriteFlush();
}

async function flushDispatchWriteQueue(): Promise<void> {
  if (dispatchWriteQueue.size === 0) return;
  const queue = Array.from(dispatchWriteQueue.values());
  for (const item of queue) {
    try {
      const result = await item.task();
      if (result !== false) {
        dispatchWriteQueue.delete(item.key);
        continue;
      }
      item.attempt += 1;
      item.nextDelayMs = Math.min(30_000, item.nextDelayMs * 2);
      enqueueDispatchWrite(item.key, item.task as DispatchWriteTask<any>, item.attempt);
    } catch (error) {
      if (isRetryableDispatchWriteError(error)) {
        item.attempt += 1;
        item.nextDelayMs = Math.min(30_000, item.nextDelayMs * 2);
        enqueueDispatchWrite(item.key, item.task as DispatchWriteTask<any>, item.attempt);
      } else {
        dispatchWriteQueue.delete(item.key);
        console.warn("[live-dispatch] Dropping non-retryable queued write:", error);
      }
    }
  }
  if (dispatchWriteQueue.size > 0) {
    const nextDelay = Math.min(...Array.from(dispatchWriteQueue.values()).map((item) => item.nextDelayMs));
    scheduleDispatchWriteFlush(nextDelay);
  }
}

async function executeDispatchWrite<T>(
  key: string,
  task: DispatchWriteTask<T>,
): Promise<T | null> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!isRetryableDispatchWriteError(error)) {
        throw error;
      }
      await sleep(250 * (attempt + 1));
    }
  }
  enqueueDispatchWrite(key, task);
  if (lastError) {
    console.warn("[live-dispatch] Queued retryable write:", lastError);
  }
  return null;
}

function headers(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Prefer: "return=representation",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
  };
}

async function api(endpoint: string, token: string, method: "GET" | "POST" | "PATCH", body?: Record<string, unknown>) {
  try {
    const accessToken = await ensureValidAccessToken(token);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(`${SUPABASE_URL}/rest/v1${endpoint}`, {
      method,
      headers: headers(accessToken),
      signal: controller.signal,
      body: body ? JSON.stringify(body) : undefined,
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) {
      const text = await res.text();
      let message = text || `Dispatch API failed (${res.status})`;
      try {
        const parsed = text ? JSON.parse(text) : null;
        message = parsed?.message || parsed?.error || message;
      } catch {
        // keep raw text
      }
      throw new Error(message);
    }
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Invalid response from dispatch API");
    }
  } catch (error) {
    if (isNetworkUnavailableCause(error)) throw asNetworkUnavailableError(error);
    throw error;
  }
}

export async function updateDispatchRequest(
  token: string,
  requestId: string,
  updates: Record<string, unknown>,
): Promise<DispatchRequest | null> {
  const rows = await executeDispatchWrite(
    `patch-request:${requestId}`,
    () =>
      api(
        `/service_requests?id=eq.${requestId}`,
        token,
        "PATCH",
        {
          ...updates,
          updated_at: new Date().toISOString(),
        },
      ),
  );
  return Array.isArray(rows) ? (rows[0] as DispatchRequest | undefined) ?? null : (rows as DispatchRequest | null);
}

function isMissingColumnError(
  error: unknown,
  column: string,
  table?: string,
): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  const anyTablePattern = new RegExp(`column\\s+[a-z_]+\\.${column}\\s+does not exist`, "i");
  const tablePattern = table ? new RegExp(`column\\s+${table}\\.${column}\\s+does not exist`, "i") : null;
  const schemaCachePattern = table
    ? new RegExp(`could not find the ['"]${column}['"] column of ['"]${table}['"] in the schema cache`, "i")
    : new RegExp(`could not find the ['"]${column}['"] column of ['"][a-z_]+['"] in the schema cache`, "i");
  return (
    (tablePattern ? tablePattern.test(msg) : anyTablePattern.test(msg)) ||
    schemaCachePattern.test(msg)
  );
}

function isStaleDispatchRequest(req: DispatchRequest, nowMs = Date.now()): boolean {
  const createdAtMs = Date.parse(req.created_at);
  const scheduledForMs = req.scheduled_for ? Date.parse(req.scheduled_for) : NaN;
  const isBooked = Number.isFinite(scheduledForMs);
  if (isBooked) {
    return (
      scheduledForMs < nowMs - BOOKED_REQUEST_PAST_GRACE_MS ||
      scheduledForMs > nowMs + BOOKED_REQUEST_LOOKAHEAD_MS
    );
  }
  return !Number.isFinite(createdAtMs) || createdAtMs < nowMs - OPEN_REQUEST_MAX_AGE_MS;
}

function getMissingServiceRequestsColumn(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const msg = error.message;
  const pgMatch = msg.match(/column\s+[a-z_]+\.([a-z_]+)\s+does not exist/i);
  if (pgMatch?.[1]) return pgMatch[1];
  const pgrstMatch = msg.match(/could not find the ['"]([a-z_]+)['"] column of ['"][a-z_]+['"] in the schema cache/i);
  return pgrstMatch?.[1] ?? null;
}

function buildOfferStatePatch(
  request: { offered_price: number; base_offered_price?: number | null; platform_fee_rate?: number | null },
  now = new Date(),
): Record<string, unknown> {
  return {
    mechanic_offer_sent_at: now.toISOString(),
    offer_expires_at: new Date(now.getTime() + OFFER_TTL_MS).toISOString(),
    customer_quote_accepted_at: null,
    mechanic_accepted_at: null,
    // A newly (re)assigned mechanic hasn't sent a price yet — clear any
    // stale flag left over from whoever had this request before.
    mechanic_offer_price_sent_at: null,
    // The previous mechanic's counter-offer (if any) was never agreed to by
    // the customer — don't let it silently carry over to whoever's matched
    // next. See deriveResetOfferedPriceFields() (also resets parts_* fields).
    ...deriveResetOfferedPriceFields(request),
  };
}

function isExpiredOffer(request: DispatchRequest, nowMs = Date.now()): boolean {
  if (request.status !== "searching") return false;
  if (!request.assigned_mechanic_user_id) return false;
  if (request.mechanic_accepted_at) return false;
  // A mechanic who already sent a real priced counter-offer should never be
  // timed out — the customer should always be able to see and act on it,
  // regardless of how long it's been. Only an explicit accept, decline, or
  // trip cancellation should move the request on from here.
  if (request.mechanic_offer_price_sent_at) return false;
  if (!request.offer_expires_at) return false;
  const expiresAtMs = Date.parse(request.offer_expires_at);
  return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;
}

async function releaseExpiredOffer(
  token: string,
  request: DispatchRequest,
): Promise<DispatchRequest | null> {
  if (!isExpiredOffer(request)) {
    return request;
  }

  const now = new Date().toISOString();
  await api(
    `/service_requests?id=eq.${request.id}&status=eq.searching&assigned_mechanic_user_id=eq.${request.assigned_mechanic_user_id}`,
    token,
    "PATCH",
    {
      assigned_mechanic_user_id: null,
      assigned_mechanic_name: null,
      mechanic_offer_sent_at: null,
      offer_expires_at: null,
      customer_quote_accepted_at: null,
      updated_at: now,
    },
  ).catch(() => {});

  await routeDispatchRequestToNextMechanic(token, request.id, {
    excludeMechanicUserId: request.assigned_mechanic_user_id,
    regionCode: request.region_code ?? undefined,
  }).catch(() => {});

  return fetchDispatchRequest(token, request.id).catch(() => null);
}

export async function setMechanicPresence(
  token: string,
  mechanicUserId: string,
  mechanicName: string,
  isOnline: boolean,
  regionCode?: "US" | "MX",
): Promise<boolean> {
  try {
    const accessToken = await ensureValidAccessToken(token);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(getApiUrl("/api/mechanic-presence"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        isOnline,
        mechanicName,
        regionCode,
      }),
    }).finally(() => clearTimeout(timeout));
    if (res.ok) return true;
    if (res.status === 403) {
      console.warn("[live-dispatch] mechanic-presence API rejected request:", res.status);
      return false;
    }
    if (res.status !== 404 && res.status !== 503) {
      console.warn("[live-dispatch] mechanic-presence API failed:", res.status);
    }
  } catch (error) {
    console.warn("[live-dispatch] mechanic-presence API unavailable, using direct REST:", error);
  }
  return setMechanicPresenceDirect(token, mechanicUserId, mechanicName, isOnline, regionCode);
}

async function setMechanicPresenceDirect(
  token: string,
  mechanicUserId: string,
  mechanicName: string,
  isOnline: boolean,
  regionCode?: "US" | "MX",
): Promise<boolean> {
  const withRegionPayload: Record<string, unknown> = {
    is_online: isOnline,
    mechanic_name: mechanicName,
    region_code: regionCode ?? undefined,
    updated_at: new Date().toISOString(),
  };
  const basePayload: Record<string, unknown> = {
    is_online: isOnline,
    mechanic_name: mechanicName,
    updated_at: withRegionPayload.updated_at,
  };
  try {
    const updated = await api(`/mechanic_presence?mechanic_user_id=eq.${mechanicUserId}`, token, "PATCH", withRegionPayload);
    if (Array.isArray(updated) && updated.length > 0) return true;
  } catch (error) {
    if (!isMissingColumnError(error, "region_code")) {
      // ignore and try insert fallback
    } else {
      const updated = await api(`/mechanic_presence?mechanic_user_id=eq.${mechanicUserId}`, token, "PATCH", basePayload);
      if (Array.isArray(updated) && updated.length > 0) return true;
    }
  }
  try {
    const created = await api("/mechanic_presence", token, "POST", {
      mechanic_user_id: mechanicUserId,
      ...withRegionPayload,
    });
    if (Array.isArray(created) ? created.length > 0 : !!created) return true;
  } catch (error) {
    if (!isMissingColumnError(error, "region_code")) throw error;
    const created = await api("/mechanic_presence", token, "POST", {
      mechanic_user_id: mechanicUserId,
      ...basePayload,
    });
    if (Array.isArray(created) ? created.length > 0 : !!created) return true;
  }
  return false;
}

async function filterOutThrottledMechanics(
  token: string,
  mechanics: MechanicPresenceRow[],
): Promise<MechanicPresenceRow[]> {
  if (mechanics.length === 0) return mechanics;
  try {
    const rows = await api("/rpc/mechanic_offer_throttled_ids", token, "POST", {
      candidate_ids: mechanics.map((m) => m.mechanic_user_id),
    });
    const throttled = new Set(
      (Array.isArray(rows) ? rows : [])
        .map((row: { user_id?: string }) => row?.user_id)
        .filter((id: unknown): id is string => typeof id === "string"),
    );
    return excludeThrottledMechanics(mechanics, throttled);
  } catch {
    // RPC missing (migration not applied yet) or transient failure —
    // don't let a penalty-enforcement lookup block routing/booking.
    return mechanics;
  }
}

async function filterOutIneligibleMechanics(
  token: string,
  mechanics: MechanicPresenceRow[],
  serviceCode?: string,
): Promise<MechanicPresenceRow[]> {
  if (mechanics.length === 0) return mechanics;
  const requirement = serviceCode ? getCapabilityRequirementForService(serviceCode) : null;
  if (!requirement) return mechanics;
  try {
    const rows = await api("/rpc/mechanic_service_eligible_ids", token, "POST", {
      candidate_ids: mechanics.map((m) => m.mechanic_user_id),
      required_capability: requirement.capabilityCode,
    });
    const eligible = new Set(
      (Array.isArray(rows) ? rows : [])
        .map((row: { user_id?: string }) => row?.user_id)
        .filter((id: unknown): id is string => typeof id === "string"),
    );
    return mechanics.filter((m) => eligible.has(m.mechanic_user_id));
  } catch {
    // RPC missing (migration not applied yet) or transient failure. Fail
    // closed for a gated service — routing an unverified mechanic a job
    // that requires proof-of-capability (e.g. legally transporting gas) is
    // worse than that job staying unmatched a bit longer.
    return [];
  }
}

async function isMechanicEligibleForService(
  token: string,
  mechanicUserId: string,
  serviceCode?: string,
): Promise<boolean> {
  const requirement = serviceCode ? getCapabilityRequirementForService(serviceCode) : null;
  if (!requirement) return true;
  try {
    const rows = await api("/rpc/mechanic_service_eligible_ids", token, "POST", {
      candidate_ids: [mechanicUserId],
      required_capability: requirement.capabilityCode,
    });
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    // Fail closed — see filterOutIneligibleMechanics for rationale.
    return false;
  }
}

async function fetchOnlineMechanics(
  token: string,
  regionCode?: "US" | "MX",
  serviceCode?: string,
): Promise<MechanicPresenceRow[]> {
  const selectClause = "mechanic_user_id,mechanic_name,is_online,updated_at,region_code";
  // Stale presence (no heartbeat in a while — e.g. the mechanic's app crashed or
  // was killed and never flipped is_online back to false) must not be routable.
  const freshnessFilter = `&updated_at=gte.${encodeURIComponent(presenceStaleCutoffIso())}`;
  try {
    const rows = await api(
      `/mechanic_presence?is_online=eq.true${freshnessFilter}&order=updated_at.asc&select=${selectClause}`,
      token,
      "GET",
    );
    const fresh = selectOnlineMechanicsForRegion(
      filterFreshMechanicPresence(Array.isArray(rows) ? (rows as MechanicPresenceRow[]) : []),
      regionCode,
    );
    const throttleFiltered = await filterOutThrottledMechanics(token, fresh);
    return filterOutIneligibleMechanics(token, throttleFiltered, serviceCode);
  } catch (error) {
    if (isMissingColumnError(error, "region_code")) {
      const rows = await api(
        `/mechanic_presence?is_online=eq.true${freshnessFilter}&order=updated_at.asc&select=mechanic_user_id,mechanic_name,is_online,updated_at`,
        token,
        "GET",
      );
      const fresh = selectOnlineMechanicsForRegion(
        filterFreshMechanicPresence(Array.isArray(rows) ? (rows as MechanicPresenceRow[]) : []),
        regionCode,
      );
      const throttleFiltered = await filterOutThrottledMechanics(token, fresh);
      return filterOutIneligibleMechanics(token, throttleFiltered, serviceCode);
    }
    // If mechanic_presence table/schema is missing, do not break booking flow.
    if (
      error instanceof Error &&
      (error.message.includes("PGRST205") ||
        error.message.toLowerCase().includes("mechanic_presence") ||
        error.message.toLowerCase().includes("schema cache"))
    ) {
      return [];
    }
    throw error;
  }
}

export function selectOnlineMechanicsForRegion(
  rows: MechanicPresenceRow[],
  regionCode?: "US" | "MX",
): MechanicPresenceRow[] {
  if (!regionCode) return rows;

  const exactMatches = rows.filter((row) => row.region_code === regionCode);
  if (exactMatches.length > 0) return exactMatches;

  // Legacy/regionless mechanics should still receive MX (or US) requests until their
  // presence row is updated with a proper region_code.
  return rows.filter((row) => row.region_code == null);
}

export async function routeDispatchRequestToNextMechanic(
  token: string,
  requestId: string,
  opts?: { excludeMechanicUserId?: string | null; regionCode?: "US" | "MX"; initiatorUserId?: string | null },
): Promise<DispatchRequest | null> {
  try {
    const request = await fetchDispatchRequest(token, requestId);
    if (!request || request.status !== "searching") return request;
    if (isStaleDispatchRequest(request)) {
      await api(`/service_requests?id=eq.${requestId}&status=eq.searching`, token, "PATCH", {
        status: "cancelled",
        updated_at: new Date().toISOString(),
      }).catch(() => {});
      return fetchDispatchRequest(token, requestId);
    }

    const region = opts?.regionCode ?? request.region_code ?? undefined;
    const online = await fetchOnlineMechanics(token, region, request.service_code);
    const next = online.find((m) => m.mechanic_user_id !== (opts?.excludeMechanicUserId ?? null));

    // Optimistic-concurrency guard: only touch the row if it's still assigned
    // to whoever we just read (or still unassigned, if that's what we read).
    // Without this, a customer decline and a mechanic decline/cancel racing
    // on the same request could each read a "current" mechanic, and the
    // second write to land would blindly reassign away from whoever the
    // first write already matched — silently bumping a mechanic who was
    // never notified, and re-resetting their offer window.
    const ownerFilter = request.assigned_mechanic_user_id
      ? `&assigned_mechanic_user_id=eq.${request.assigned_mechanic_user_id}`
      : `&assigned_mechanic_user_id=is.null`;

    // No online mechanic available in this region right now.
    if (!next) {
      await api(`/service_requests?id=eq.${requestId}&status=eq.searching${ownerFilter}`, token, "PATCH", {
        assigned_mechanic_user_id: null,
        assigned_mechanic_name: null,
        mechanic_offer_price_sent_at: null,
        ...deriveResetOfferedPriceFields(request),
        updated_at: new Date().toISOString(),
      }).catch(() => {});
      return fetchDispatchRequest(token, requestId);
    }

    const rows = await api(`/service_requests?id=eq.${requestId}&status=eq.searching${ownerFilter}`, token, "PATCH", {
      assigned_mechanic_user_id: next.mechanic_user_id,
      assigned_mechanic_name: next.mechanic_name ?? "Mechanic",
      ...buildOfferStatePatch(request),
      updated_at: new Date().toISOString(),
    });
    const assigned = Array.isArray(rows) ? rows[0] : rows;
    if (
      assigned &&
      request.assigned_mechanic_user_id !== next.mechanic_user_id &&
      next.mechanic_user_id
    ) {
      void trackAnalyticsEvent({
        eventName: "mechanic_matched",
        userId: next.mechanic_user_id,
        role: "mechanic",
        properties: {
          request_id: request.id,
          customer_user_id: request.customer_user_id,
          mechanic_user_id: next.mechanic_user_id,
          mechanic_name: next.mechanic_name ?? "Mechanic",
          service_code: request.service_code,
          region_code: region ?? request.region_code ?? null,
          match_source: "auto_route",
        },
      });
      void notifyDispatchEvent({
        sessionToken: token,
        requestId: request.id,
        event: "new_service_request",
        initiatorUserId: opts?.initiatorUserId ?? request.customer_user_id,
        actorUserId: request.customer_user_id,
      });
      void notifyDispatchEvent({
        sessionToken: token,
        requestId: request.id,
        event: "mechanic_matched",
        initiatorUserId: next.mechanic_user_id,
        actorUserId: next.mechanic_user_id,
      });
    }
    return (assigned as DispatchRequest | null) ?? null;
  } catch {
    // Routing issues must never block customer booking flow.
    return fetchDispatchRequest(token, requestId).catch(() => null);
  }
}

async function routeOldestUnassignedRequest(
  token: string,
  regionCode?: "US" | "MX",
  initiatorUserId?: string | null,
): Promise<void> {
  let list: DispatchRequest[] = [];
  try {
    const regionFilter = regionCode ? `&region_code=eq.${regionCode}` : "";
    const rows = await api(
      `/service_requests?status=eq.searching&assigned_mechanic_user_id=is.null${regionFilter}&order=created_at.asc&limit=5&select=*`,
      token,
      "GET",
    );
    list = (Array.isArray(rows) ? rows : []) as DispatchRequest[];
  } catch (error) {
    if (!isMissingColumnError(error, "region_code")) throw error;
    const rows = await api(
      `/service_requests?status=eq.searching&assigned_mechanic_user_id=is.null&order=created_at.asc&limit=5&select=*`,
      token,
      "GET",
    );
    list = (Array.isArray(rows) ? rows : []) as DispatchRequest[];
  }
  if (list.length === 0) return;
  for (const req of list) {
    if (isStaleDispatchRequest(req)) {
      await api(`/service_requests?id=eq.${req.id}&status=eq.searching`, token, "PATCH", {
        status: "cancelled",
        updated_at: new Date().toISOString(),
      }).catch(() => {});
      continue;
    }
    await routeDispatchRequestToNextMechanic(token, req.id, { regionCode, initiatorUserId });
    return;
  }
}

export async function createDispatchRequest(
  token: string,
  input: {
    customerUserId: string;
    customerName: string;
    customerPhotoUrl?: string | null;
    serviceCode: string;
    vehicleLabel: string;
    locationLabel: string;
    customerLatitude?: number | null;
    customerLongitude?: number | null;
    offeredPrice: number;
    oilPackage?: "conventional" | "synthetic_blend" | "full_synthetic" | null;
    scheduledFor?: string | null;
    customerNote?: string | null;
    customerHasParts?: boolean | null;
    issuePhotoUrl?: string | null;
    platformFeeRate?: number;
    platformFeeAmount?: number;
    mechanicPayout?: number;
    currency: string;
    regionCode?: "US" | "MX";
    stripePaymentIntentId?: string | null;
  },
): Promise<DispatchRequest> {
  try {
    const payload: Record<string, unknown> = {
      customer_user_id: input.customerUserId,
      customer_name: input.customerName,
      customer_photo_url: input.customerPhotoUrl ?? undefined,
      service_code: input.serviceCode,
      vehicle_label: input.vehicleLabel,
      location_label: input.locationLabel,
      customer_latitude: input.customerLatitude ?? undefined,
      customer_longitude: input.customerLongitude ?? undefined,
      offered_price: input.offeredPrice,
      base_offered_price: input.offeredPrice,
      oil_package: input.oilPackage ?? undefined,
      scheduled_for: input.scheduledFor ?? undefined,
      customer_note: input.customerNote ?? undefined,
      customer_has_parts: input.customerHasParts ?? undefined,
      issue_photo_url: input.issuePhotoUrl ?? undefined,
      platform_fee_rate: input.platformFeeRate ?? undefined,
      platform_fee_amount: input.platformFeeAmount ?? undefined,
      mechanic_payout: input.mechanicPayout ?? undefined,
      region_code: input.regionCode ?? undefined,
      stripe_payment_intent_id: input.stripePaymentIntentId ?? undefined,
      currency: input.currency,
      payment_state: "escrow_hold",
      status: "searching",
    };
    let rows: DispatchRequest[] | DispatchRequest | null = null;
    const mutablePayload: Record<string, unknown> = { ...payload };
    for (let tries = 0; tries < 8; tries += 1) {
      try {
        rows = await api("/service_requests", token, "POST", mutablePayload);
        break;
      } catch (error) {
        const missingColumn = getMissingServiceRequestsColumn(error);
        if (!missingColumn || !(missingColumn in mutablePayload)) {
          throw error;
        }
        delete mutablePayload[missingColumn];
      }
    }
    if (!rows) {
      // Last-resort fallback for very old schemas.
      rows = await api("/service_requests", token, "POST", {
        customer_user_id: input.customerUserId,
        customer_name: input.customerName,
        service_code: input.serviceCode,
        vehicle_label: input.vehicleLabel,
        location_label: input.locationLabel,
        offered_price: input.offeredPrice,
        scheduled_for: input.scheduledFor ?? undefined,
        customer_note: input.customerNote ?? undefined,
        currency: input.currency,
        stripe_payment_intent_id: input.stripePaymentIntentId ?? undefined,
        status: "searching",
      });
    }
    const created = (Array.isArray(rows) ? rows[0] : rows) as DispatchRequest;
    void trackAnalyticsEvent({
      eventName: "request_created",
      userId: input.customerUserId,
      role: "customer",
      properties: {
        request_id: created.id,
        region_code: input.regionCode ?? null,
        service_code: input.serviceCode,
        offered_price: input.offeredPrice,
        platform_fee_rate: input.platformFeeRate ?? null,
        platform_fee_amount: input.platformFeeAmount ?? null,
        mechanic_payout: input.mechanicPayout ?? null,
        currency: input.currency,
      },
    });
    let finalRequest = created;
    let verifiedRequest: DispatchRequest | null = null;
    try {
      const routedRequest = await routeDispatchRequestToNextMechanic(token, created.id, {
        regionCode: input.regionCode,
        initiatorUserId: input.customerUserId,
      });
      verifiedRequest = routedRequest ?? (await fetchDispatchRequest(token, created.id).catch(() => null));
      if (verifiedRequest) {
        finalRequest = verifiedRequest;
      }
    } catch (error) {
      console.warn("[live-dispatch] Initial mechanic routing skipped", error);
    }
    if (verifiedRequest && !verifiedRequest.assigned_mechanic_user_id) {
      void trackAnalyticsEvent({
        eventName: "match_failed",
        userId: input.customerUserId,
        role: "customer",
        properties: {
          request_id: verifiedRequest.id,
          region_code: input.regionCode ?? null,
          service_code: input.serviceCode,
          reason: "no_mechanic_available",
        },
      });
    }
    return finalRequest;
  } catch (error) {
    const failure = error as { code?: unknown; message?: unknown };
    void trackAnalyticsEvent({
      eventName: "request_failed",
      userId: input.customerUserId,
      role: "customer",
      properties: {
        region_code: input.regionCode ?? null,
        service_code: input.serviceCode,
        offered_price: input.offeredPrice,
        code: typeof failure.code === "string" ? failure.code : "request_failed",
        message: typeof failure.message === "string" ? failure.message : "Failed to create request",
      },
    });
    throw error;
  }
}

export async function fetchDispatchRequest(token: string, requestId: string): Promise<DispatchRequest | null> {
  const rows = await api(`/service_requests?id=eq.${requestId}&select=*`, token, "GET");
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const request = rows[0] as DispatchRequest;
  return releaseExpiredOffer(token, request).catch(() => request);
}

export async function fetchOpenDispatchRequests(
  token: string,
  mechanicUserId: string,
  mechanicName?: string,
  regionCode?: "US" | "MX",
): Promise<DispatchRequest[]> {
  // Ensure newly created unassigned requests get routed when mechanics are online.
  await routeOldestUnassignedRequest(token, regionCode, mechanicUserId).catch(() => {});

  // Fallback claim path: if presence-routing misses, this mechanic can claim one unassigned request.
  if (mechanicName) {
    await claimOldestOpenDispatchRequest(token, mechanicUserId, mechanicName, regionCode, mechanicUserId).catch(() => {});
  }

  const withRegion = `/service_requests?status=eq.searching&assigned_mechanic_user_id=eq.${mechanicUserId}&customer_user_id=neq.${mechanicUserId}${
    regionCode ? `&region_code=eq.${regionCode}` : ""
  }&order=created_at.asc&limit=5&select=*`;
  try {
    const rows = await api(withRegion, token, "GET");
    const list = Array.isArray(rows) ? (rows as DispatchRequest[]) : [];
    const now = Date.now();
    return list.filter((req) => !isStaleDispatchRequest(req, now));
  } catch (error) {
    if (!isMissingColumnError(error, "region_code")) throw error;
    const fallback = await api(
      `/service_requests?status=eq.searching&assigned_mechanic_user_id=eq.${mechanicUserId}&customer_user_id=neq.${mechanicUserId}&order=created_at.asc&limit=5&select=*`,
      token,
      "GET",
    );
    const list = Array.isArray(fallback) ? (fallback as DispatchRequest[]) : [];
    const now = Date.now();
    return list.filter((req) => !isStaleDispatchRequest(req, now));
  }
}

async function claimOldestOpenDispatchRequest(
  token: string,
  mechanicUserId: string,
  mechanicName: string,
  regionCode?: "US" | "MX",
  initiatorUserId?: string | null,
): Promise<DispatchRequest | null> {
  let list: DispatchRequest[] = [];
  try {
    const regionFilter = regionCode ? `&region_code=eq.${regionCode}` : "";
    const rows = await api(
      `/service_requests?status=eq.searching&assigned_mechanic_user_id=is.null&customer_user_id=neq.${mechanicUserId}${regionFilter}&order=created_at.asc&limit=8&select=*`,
      token,
      "GET",
    );
    list = (Array.isArray(rows) ? rows : []) as DispatchRequest[];
  } catch (error) {
    if (!isMissingColumnError(error, "region_code")) throw error;
    const rows = await api(
      `/service_requests?status=eq.searching&assigned_mechanic_user_id=is.null&customer_user_id=neq.${mechanicUserId}&order=created_at.asc&limit=8&select=*`,
      token,
      "GET",
    );
    list = (Array.isArray(rows) ? rows : []) as DispatchRequest[];
  }
  const now = Date.now();
  let candidate: DispatchRequest | null = null;
  for (const req of list) {
    if (isStaleDispatchRequest(req, now)) continue;
    // eslint-disable-next-line no-await-in-loop -- small bounded list (limit 8), needs to stop at the first eligible match
    if (await isMechanicEligibleForService(token, mechanicUserId, req.service_code)) {
      candidate = req;
      break;
    }
  }
  if (!candidate) return null;

  const claimed = await api(
    `/service_requests?id=eq.${candidate.id}&status=eq.searching&assigned_mechanic_user_id=is.null`,
    token,
    "PATCH",
    {
      assigned_mechanic_user_id: mechanicUserId,
      assigned_mechanic_name: mechanicName,
      ...buildOfferStatePatch(candidate),
      updated_at: new Date().toISOString(),
    },
  );
  if (!Array.isArray(claimed) || claimed.length === 0) return null;
  void trackAnalyticsEvent({
    eventName: "mechanic_matched",
    userId: mechanicUserId,
    role: "mechanic",
    properties: {
      request_id: candidate.id,
      customer_user_id: candidate.customer_user_id,
      mechanic_user_id: mechanicUserId,
      mechanic_name: mechanicName,
      service_code: candidate.service_code,
      region_code: regionCode ?? candidate.region_code ?? null,
      match_source: "claim",
    },
  });
  void notifyDispatchEvent({
    sessionToken: token,
    requestId: candidate.id,
    event: "new_service_request",
    initiatorUserId: initiatorUserId ?? mechanicUserId,
    actorUserId: candidate.customer_user_id,
  });
  void notifyDispatchEvent({
    sessionToken: token,
    requestId: candidate.id,
    event: "mechanic_matched",
    initiatorUserId: initiatorUserId ?? mechanicUserId,
    actorUserId: mechanicUserId,
  });
  return claimed[0] as DispatchRequest;
}

export async function fetchMechanicBookedRequests(
  token: string,
  mechanicUserId: string,
  regionCode?: "US" | "MX",
): Promise<DispatchRequest[]> {
  try {
    const regionFilter = regionCode ? `&region_code=eq.${regionCode}` : "";
    const rows = await api(
      `/service_requests?or=(and(status.eq.searching,scheduled_for.not.is.null,assigned_mechanic_user_id.eq.${mechanicUserId}),and(status.eq.accepted,assigned_mechanic_user_id.eq.${mechanicUserId}))${regionFilter}&order=scheduled_for.asc.nullslast,created_at.asc&select=*`,
      token,
      "GET",
    );
    return Array.isArray(rows) ? (rows as DispatchRequest[]) : [];
  } catch (error) {
    if (!isMissingColumnError(error, "scheduled_for") && !isMissingColumnError(error, "region_code")) {
      throw error;
    }
    // Backward-compatible fallback for older schemas without scheduled_for.
    const fallback = await api(
      `/service_requests?or=(and(status.eq.searching,assigned_mechanic_user_id.eq.${mechanicUserId}),and(status.eq.accepted,assigned_mechanic_user_id.eq.${mechanicUserId}))&order=created_at.asc&select=*`,
      token,
      "GET",
    );
    return Array.isArray(fallback) ? (fallback as DispatchRequest[]) : [];
  }
}

export async function fetchDispatchHistoryForUser(
  token: string,
  userId: string,
): Promise<DispatchRequest[]> {
  const rows = await api(
    `/service_requests?or=(customer_user_id.eq.${userId},assigned_mechanic_user_id.eq.${userId})&order=updated_at.desc.nullslast,created_at.desc&select=*`,
    token,
    "GET",
  );
  return Array.isArray(rows) ? (rows as DispatchRequest[]) : [];
}

// Platform's standard booking fee rate — kept in sync with QUICK_SERVICE_BOOKING_FEE_RATE
// (lib/fare.ts) and BOOKING_FEE_RATE (book-service.tsx). Used as the fallback when a
// row's own platform_fee_rate isn't available at the point a price is being updated.
const DEFAULT_PLATFORM_FEE_RATE = 0.12;

/**
 * A negotiated/updated `offered_price` is always the customer-facing TOTAL,
 * i.e. service*(1+feeRate) — see confirm.tsx / book-service.tsx. Whenever we
 * write a new offered_price (a mechanic's counter-offer, or a customer
 * accepting one), we must also recompute platform_fee_amount and
 * mechanic_payout from it so every screen that reads those columns
 * (earnings, booked-job cards, mechanic dispatch view) reflects the real
 * negotiated price instead of the stale original quote.
 */
function deriveOfferedPriceFields(
  offeredPrice: number,
  feeRate: number = DEFAULT_PLATFORM_FEE_RATE,
): { platform_fee_amount: number; mechanic_payout: number } {
  const servicePortion = +(offeredPrice / (1 + feeRate)).toFixed(2);
  const platformFeeAmount = +(offeredPrice - servicePortion).toFixed(2);
  return { platform_fee_amount: platformFeeAmount, mechanic_payout: servicePortion };
}

/**
 * Every path that reassigns a request away from its current mechanic
 * (declines, cancels, TTL expiry, offer-expiry sweep) must reset
 * offered_price/platform_fee_amount/mechanic_payout back to what the
 * customer actually authorized (base_offered_price) — otherwise a departing
 * mechanic's never-agreed-to counter-offer silently survives onto whoever
 * gets matched next, and that stale number would flow straight through to
 * Stripe capture and mechanic payout. Falls back to the request's current
 * offered_price only for legacy rows that predate the base_offered_price
 * column (backfilled to equal offered_price at migration time, so this
 * fallback is just defense-in-depth).
 */
function deriveResetOfferedPriceFields(request: {
  offered_price: number;
  base_offered_price?: number | null;
  platform_fee_rate?: number | null;
}): {
  offered_price: number;
  platform_fee_amount: number;
  mechanic_payout: number;
  parts_cost: null;
  parts_receipt_path: null;
  parts_payment_intent_id: null;
  parts_payment_status: "none";
  parts_proposed_at: null;
  parts_authorized_at: null;
} {
  const baseline =
    typeof request.base_offered_price === "number" && request.base_offered_price > 0
      ? request.base_offered_price
      : request.offered_price;
  const feeRate = request.platform_fee_rate ?? DEFAULT_PLATFORM_FEE_RATE;
  return {
    offered_price: baseline,
    ...deriveOfferedPriceFields(baseline, feeRate),
    // A departing mechanic's parts-cost proposal (and any authorized hold —
    // best-effort canceled by the caller, see cancelPartsHold) must never
    // survive onto whoever gets matched next.
    parts_cost: null,
    parts_receipt_path: null,
    parts_payment_intent_id: null,
    parts_payment_status: "none",
    parts_proposed_at: null,
    parts_authorized_at: null,
  };
}

/**
 * Distinguishes "the accept just couldn't land on this exact price yet"
 * from every other null-return reason in acceptDispatchRequest (already
 * taken, cancelled, network issue, etc). incoming.tsx uses this to show the
 * mechanic an accurate message instead of a misleading "already taken".
 */
export class AwaitingCustomerPriceConfirmationError extends Error {
  constructor() {
    super("AWAITING_CUSTOMER_PRICE_CONFIRMATION");
    this.name = "AwaitingCustomerPriceConfirmationError";
  }
}

export async function acceptDispatchRequest(
  token: string,
  requestId: string,
  mechanicUserId: string,
  mechanicName: string,
): Promise<DispatchRequest | null> {
  const current = await fetchDispatchRequest(token, requestId).catch(() => null);
  if (!current) return null;
  const baseline =
    typeof current.base_offered_price === "number" && current.base_offered_price > 0
      ? current.base_offered_price
      : current.offered_price;
  // A mechanic may tap "Accept" to finalize the job outright only at the
  // original, customer-authorized price. If they've sent a counter-offer
  // that changed offered_price, the customer must have explicitly agreed to
  // it first (via the offers screen -> assignDispatchToMechanic, which sets
  // customer_quote_accepted_at) — otherwise a mechanic could unilaterally
  // lock in their own self-proposed price with zero customer consent.
  // Encoded into the PATCH filter itself (not just checked here) so a client
  // that skips this check can't silently bypass it either.
  const priceConfirmed = current.offered_price === baseline || !!current.customer_quote_accepted_at;
  if (!priceConfirmed) {
    throw new AwaitingCustomerPriceConfirmationError();
  }
  const priceGuard =
    `&or=(offered_price.eq.${baseline},customer_quote_accepted_at.not.is.null)`;

  const rows = await executeDispatchWrite(
    `accept:${requestId}:${mechanicUserId}`,
    () =>
      api(
        `/service_requests?id=eq.${requestId}&status=eq.searching&assigned_mechanic_user_id=eq.${mechanicUserId}${priceGuard}`,
        token,
        "PATCH",
        {
          status: "accepted",
          mechanic_accepted_at: new Date().toISOString(),
          offer_expires_at: null,
          assigned_mechanic_user_id: mechanicUserId,
          assigned_mechanic_name: mechanicName,
          updated_at: new Date().toISOString(),
        },
      ),
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0] as DispatchRequest;
}

export async function assignDispatchToMechanic(
  token: string,
  requestId: string,
  mechanicUserId: string,
  mechanicName: string,
  // Pass the mechanic's proposed total when the customer is accepting a
  // counter-offer, so the agreed price actually gets saved instead of the
  // request's original (possibly stale) offered_price.
  acceptedOffer?: { offeredPrice: number; feeRate?: number },
) {
  const patch: Record<string, unknown> = {
    assigned_mechanic_user_id: mechanicUserId,
    assigned_mechanic_name: mechanicName,
    customer_quote_accepted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (acceptedOffer && Number.isFinite(acceptedOffer.offeredPrice) && acceptedOffer.offeredPrice > 0) {
    patch.offered_price = acceptedOffer.offeredPrice;
    let feeRate = acceptedOffer.feeRate;
    if (feeRate === undefined) {
      // Caller didn't have the rate handy (e.g. mechanic-offers.tsx) — fall
      // back to the request's own configured rate rather than silently
      // assuming the app-wide default, matching booked-requests.tsx's
      // sendOffer() which already threads platform_fee_rate through.
      const current = await fetchDispatchRequest(token, requestId).catch(() => null);
      feeRate = current?.platform_fee_rate ?? undefined;
    }
    const { platform_fee_amount, mechanic_payout } = deriveOfferedPriceFields(
      acceptedOffer.offeredPrice,
      feeRate,
    );
    patch.platform_fee_amount = platform_fee_amount;
    patch.mechanic_payout = mechanic_payout;
  }
  const rows = await executeDispatchWrite(
    `quote:${requestId}:${mechanicUserId}`,
    () =>
      api(
        `/service_requests?id=eq.${requestId}&status=eq.searching&assigned_mechanic_user_id=eq.${mechanicUserId}`,
        token,
        "PATCH",
        patch,
      ),
  );
  return Array.isArray(rows) ? (rows[0] as DispatchRequest | undefined) ?? null : (rows as DispatchRequest | null);
}

export async function updateDispatchOfferedPrice(
  token: string,
  requestId: string,
  offeredPrice: number,
  feeRate?: number,
) {
  const { platform_fee_amount, mechanic_payout } = deriveOfferedPriceFields(offeredPrice, feeRate);
  const rows = await executeDispatchWrite(
    `offer-price:${requestId}`,
    () =>
      api(
        `/service_requests?id=eq.${requestId}`,
        token,
        "PATCH",
        {
          offered_price: offeredPrice,
          platform_fee_amount,
          mechanic_payout,
          // Marks this as a real priced counter-offer so the timer-based
          // expiry sweep leaves it alone — see isExpiredOffer().
          mechanic_offer_price_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ),
  );
  return Array.isArray(rows) ? (rows[0] as DispatchRequest | undefined) ?? null : (rows as DispatchRequest | null);
}

/**
 * Mechanic proposes a parts reimbursement (with an already-uploaded receipt
 * photo path) — a separate money flow from offered_price, see
 * app/mechanic/incoming.tsx and app/mechanic/active.tsx. Does not touch
 * Stripe; the customer must explicitly authorize a real hold for it via
 * app/api/parts-payment-intent+api.ts before it's real money.
 */
export async function proposePartsCost(
  token: string,
  requestId: string,
  partsCost: number,
  receiptPath: string,
) {
  const rows = await executeDispatchWrite(
    `parts-propose:${requestId}`,
    () =>
      api(
        `/service_requests?id=eq.${requestId}`,
        token,
        "PATCH",
        {
          parts_cost: partsCost,
          parts_receipt_path: receiptPath,
          parts_payment_status: "proposed",
          parts_proposed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ),
  );
  return Array.isArray(rows) ? (rows[0] as DispatchRequest | undefined) ?? null : (rows as DispatchRequest | null);
}

/**
 * Customer declines a proposed parts cost — mechanic sees it was turned
 * down and can proceed labor-only or send a revised amount.
 */
export async function declinePartsCost(token: string, requestId: string) {
  const rows = await executeDispatchWrite(
    `parts-decline:${requestId}`,
    () =>
      api(
        `/service_requests?id=eq.${requestId}&parts_payment_status=eq.proposed`,
        token,
        "PATCH",
        { parts_payment_status: "declined", updated_at: new Date().toISOString() },
      ),
  );
  return Array.isArray(rows) ? (rows[0] as DispatchRequest | undefined) ?? null : (rows as DispatchRequest | null);
}

/**
 * Called by the client immediately after usePaymentSheet().present()
 * resolves "completed" for the parts hold — mirrors the trust model the
 * main booking flow already uses (client reports success, the 24h capture
 * sweep is the real backstop/reconciliation, not this flag).
 */
export async function confirmPartsPaymentAuthorized(token: string, requestId: string) {
  const rows = await executeDispatchWrite(
    `parts-authorized:${requestId}`,
    () =>
      api(
        `/service_requests?id=eq.${requestId}&parts_payment_status=eq.proposed`,
        token,
        "PATCH",
        {
          parts_payment_status: "authorized",
          parts_authorized_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ),
  );
  return Array.isArray(rows) ? (rows[0] as DispatchRequest | undefined) ?? null : (rows as DispatchRequest | null);
}

export type DispatchStatusSyncResult = {
  /** True when the request row was updated at all (even if degraded). */
  ok: boolean;
  /**
   * True when the write only succeeded after dropping some of the requested
   * fields (e.g. a schema-cache/missing-column error on this environment).
   * The status itself was saved, but anything in droppedFields — which can
   * include rating, tip, before/after photos, cancel details, etc. — was
   * NOT persisted. Callers that pass along user-entered data (ratings,
   * tips, photos) should surface this rather than treating ok as full
   * success.
   */
  degraded: boolean;
  droppedFields: string[];
};

function warnDegradedStatusSync(requestId: string, status: DispatchStatus, droppedFields: string[]): void {
  if (droppedFields.length === 0) return;
  console.warn(
    `[live-dispatch] Status update to "${status}" for request ${requestId} saved, but dropped field(s): ${droppedFields.join(", ")}. This usually means the DB schema is missing a column the app expects.`,
  );
}

export async function updateDispatchStatus(
  token: string,
  requestId: string,
  status: DispatchStatus,
  opts?: {
    receiptNumber?: string | null;
    mechanicLatitude?: number | null;
    mechanicLongitude?: number | null;
    mechanicMarkedDoneAt?: string | null;
    noShowReportedAt?: string | null;
    customerCompletedAt?: string | null;
    paymentState?: "escrow_hold" | "ready_for_release" | "released" | "dispute_hold";
    disputeWindowEndsAt?: string | null;
    fundsReleaseAt?: string | null;
    beforePhotoUrl?: string | null;
    afterPhotoUrl?: string | null;
    cancelReason?: string | null;
    cancelledByRole?: "customer" | "mechanic" | null;
    cancelledByUserId?: string | null;
    rating?: number | null;
    tip?: number | null;
    ratingComment?: string | null;
    customerRating?: number | null;
    customerRatingComment?: string | null;
  },
): Promise<DispatchStatusSyncResult> {
  let requestedPaymentState = opts?.paymentState;
  let hasOpenDispute = false;
  if (requestedPaymentState === "ready_for_release") {
    const disputes = await api(
      `/service_disputes?request_id=eq.${requestId}&status=in.(open,reviewing)&select=id&limit=1`,
      token,
      "GET",
    ).catch(() => null);
    hasOpenDispute = Array.isArray(disputes) && disputes.length > 0;
    requestedPaymentState = paymentStateAfterDisputeCheck(requestedPaymentState, hasOpenDispute);
  }
  const statusTimestampPatch: Record<string, string> = {};
  const nowIso = new Date().toISOString();
  if (status === "enroute") statusTimestampPatch.mechanic_enroute_at = nowIso;
  if (status === "arrived") statusTimestampPatch.mechanic_arrived_at = nowIso;
  if (status === "in_progress") statusTimestampPatch.job_started_at = nowIso;
  if (status === "completed") statusTimestampPatch.job_completed_at = nowIso;
  const payload: Record<string, unknown> = {
    status,
    ...statusTimestampPatch,
    receipt_number: opts?.receiptNumber ?? undefined,
    mechanic_latitude: opts?.mechanicLatitude ?? undefined,
    mechanic_longitude: opts?.mechanicLongitude ?? undefined,
    // Only stamped when a real coordinate is included in this PATCH, so the
    // customer app can tell "last known position" apart from "just updated".
    mechanic_location_updated_at:
      opts?.mechanicLatitude != null && opts?.mechanicLongitude != null ? nowIso : undefined,
    mechanic_marked_done_at: opts?.mechanicMarkedDoneAt ?? undefined,
    no_show_reported_at: opts?.noShowReportedAt ?? undefined,
    customer_completed_at: opts?.customerCompletedAt ?? undefined,
    payment_state: requestedPaymentState ?? undefined,
    dispute_window_ends_at: opts?.disputeWindowEndsAt ?? undefined,
    funds_release_at: requestedPaymentState === "dispute_hold" ? null : opts?.fundsReleaseAt ?? undefined,
    before_photo_url: opts?.beforePhotoUrl ?? undefined,
    after_photo_url: opts?.afterPhotoUrl ?? undefined,
    cancel_reason: status === "cancelled" ? opts?.cancelReason ?? undefined : undefined,
    cancelled_by_role: status === "cancelled" ? opts?.cancelledByRole ?? undefined : undefined,
    cancelled_by_user_id: status === "cancelled" ? opts?.cancelledByUserId ?? undefined : undefined,
    cancelled_at: status === "cancelled" ? nowIso : undefined,
    rating: opts?.rating ?? undefined,
    tip: opts?.tip ?? undefined,
    rating_comment: opts?.ratingComment ?? undefined,
    customer_rating: opts?.customerRating ?? undefined,
    customer_rating_comment: opts?.customerRatingComment ?? undefined,
    updated_at: nowIso,
  };
  // Fields actually requested beyond the bare status/updated_at, so we can
  // report exactly what got dropped if a fallback tier below has to shed them.
  const requestedExtraFields = Object.keys(payload).filter(
    (key) => key !== "status" && key !== "updated_at" && payload[key] !== undefined,
  );

  try {
    const result = await executeDispatchWrite(
      `status:${requestId}:${status}`,
      () => api(`/service_requests?id=eq.${requestId}`, token, "PATCH", payload),
    );
    const ok = Array.isArray(result) ? result.length > 0 : !!result;
    if (
      ok &&
      status === "cancelled" &&
      opts?.cancelledByRole &&
      opts?.cancelledByUserId
    ) {
      void notifyDispatchEvent({
        sessionToken: token,
        requestId,
        event:
          opts.cancelledByRole === "mechanic"
            ? "job_cancelled_by_mechanic"
            : "job_cancelled_by_customer",
        initiatorUserId: opts.cancelledByUserId,
        actorUserId: opts.cancelledByUserId,
      });
    }
    return { ok, degraded: false, droppedFields: [] };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "NETWORK_UNAVAILABLE") {
      const missing = getMissingServiceRequestsColumn(error);

      // Single-column retry: a brand-new column (e.g. one whose migration
      // hasn't run yet on this environment) shouldn't take unrelated fields
      // like GPS coords down with it. Drop just the offending field and
      // resubmit everything else intact before falling back further.
      if (missing && missing in payload) {
        const retryPayload: Record<string, unknown> = { ...payload };
        delete retryPayload[missing];
        try {
          const retryResult = await executeDispatchWrite(
            `status:${requestId}:${status}:drop-${missing}`,
            () => api(`/service_requests?id=eq.${requestId}`, token, "PATCH", retryPayload),
          );
          const ok = Array.isArray(retryResult) ? retryResult.length > 0 : !!retryResult;
          const droppedFields = ok ? [missing] : [];
          if (ok) warnDegradedStatusSync(requestId, status, droppedFields);
          return { ok, degraded: ok, droppedFields };
        } catch {
          // fall through to the broader fallback below
        }
      }

      // Retry stripping optional new columns (rating etc) if the error indicates missing column
      const hasNewFields =
        "rating" in payload || "tip" in payload || "rating_comment" in payload ||
        "customer_rating" in payload || "customer_rating_comment" in payload;
      if (
        missing &&
        (missing === "rating" || missing === "tip" || missing === "rating_comment" ||
          missing === "customer_rating" || missing === "customer_rating_comment" || hasNewFields)
      ) {
        const minimalPayload: Record<string, unknown> = {
          status,
          updated_at: nowIso,
          ...(payload.mechanic_latitude !== undefined ? { mechanic_latitude: payload.mechanic_latitude } : {}),
          ...(payload.mechanic_longitude !== undefined ? { mechanic_longitude: payload.mechanic_longitude } : {}),
          ...(payload.mechanic_marked_done_at !== undefined ? { mechanic_marked_done_at: payload.mechanic_marked_done_at } : {}),
          ...(payload.no_show_reported_at !== undefined ? { no_show_reported_at: payload.no_show_reported_at } : {}),
          ...(payload.after_photo_url !== undefined ? { after_photo_url: payload.after_photo_url } : {}),
          ...(payload.before_photo_url !== undefined ? { before_photo_url: payload.before_photo_url } : {}),
          ...(payload.customer_completed_at !== undefined ? { customer_completed_at: payload.customer_completed_at } : {}),
        };
        const minimalResult = await executeDispatchWrite(
          `status:${requestId}:${status}:minimal-plus`,
          () => api(`/service_requests?id=eq.${requestId}`, token, "PATCH", minimalPayload),
        );
        const ok = Array.isArray(minimalResult) ? minimalResult.length > 0 : !!minimalResult;
        const droppedFields = ok
          ? requestedExtraFields.filter((key) => !(key in minimalPayload))
          : [];
        if (ok) warnDegradedStatusSync(requestId, status, droppedFields);
        return { ok, degraded: ok && droppedFields.length > 0, droppedFields };
      }
      const fallback = await executeDispatchWrite(
        `status:${requestId}:${status}:minimal`,
        () =>
          api(`/service_requests?id=eq.${requestId}`, token, "PATCH", {
            status,
            updated_at: new Date().toISOString(),
          }),
      );
      const ok = Array.isArray(fallback) ? fallback.length > 0 : !!fallback;
      const droppedFields = ok ? requestedExtraFields : [];
      if (ok) warnDegradedStatusSync(requestId, status, droppedFields);
      return { ok, degraded: ok && droppedFields.length > 0, droppedFields };
    }
    console.warn("[live-dispatch] Skipped status sync due to network outage");
    return { ok: false, degraded: false, droppedFields: [] };
  }
}

async function releaseDispatchFromMechanicViaSupabase(
  token: string,
  requestId: string,
): Promise<DispatchRequest | null> {
  const released = await api(
    "/rpc/release_service_request_from_mechanic",
    token,
    "POST",
    { p_request_id: requestId },
  );
  if (Array.isArray(released)) {
    return (released[0] as DispatchRequest | undefined) ?? null;
  }
  return released as DispatchRequest | null;
}

export async function releaseDispatchFromMechanic(
  token: string,
  requestId: string,
  opts?: { reason?: string | null; safetyReason?: boolean },
): Promise<DispatchRequest | null> {
  if (shouldUseSupabaseFallbackForLocalApi()) {
    return releaseDispatchFromMechanicViaSupabase(token, requestId);
  }

  try {
    const accessToken = await ensureValidAccessToken(token);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(getApiUrl("/api/mechanic-cancel"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        requestId,
        reason: opts?.reason ?? null,
        safetyReason: Boolean(opts?.safetyReason),
      }),
    }).finally(() => clearTimeout(timeout));
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text };
      }
    }
    if (!res.ok) {
      const message =
        typeof data === "object" && data && "error" in data
          ? String((data as { error?: unknown }).error ?? "Could not cancel and re-dispatch request")
          : "Could not cancel and re-dispatch request";
      throw new Error(message);
    }
    const payload = data as { data?: { request?: DispatchRequest | null } };
    return payload.data?.request ?? null;
  } catch (error) {
    if (isNetworkUnavailableCause(error)) {
      try {
        // Expo tunnel exposes Metro, not the local API server. This RPC keeps
        // mechanic cancellation durable while still enforcing ownership in SQL.
        return await releaseDispatchFromMechanicViaSupabase(token, requestId);
      } catch (fallbackError) {
        if (isNetworkUnavailableError(fallbackError) || isNetworkUnavailableCause(fallbackError)) {
          throw asNetworkUnavailableError(fallbackError);
        }
        throw fallbackError;
      }
    }
    throw error;
  }
}

export async function sendServiceMessage(
  token: string,
  input: {
    requestId: string;
    senderUserId: string;
    senderRole: "customer" | "mechanic";
    message: string;
  },
) {
  const rows = await api("/service_messages", token, "POST", {
    request_id: input.requestId,
    sender_user_id: input.senderUserId,
    sender_role: input.senderRole,
    message: input.message,
  });
  return Array.isArray(rows) ? (rows[0] as ServiceMessage) : (rows as ServiceMessage);
}

export async function fetchServiceMessages(
  token: string,
  requestId: string,
): Promise<ServiceMessage[]> {
  const rows = await api(
    `/service_messages?request_id=eq.${requestId}&order=created_at.asc&select=*`,
    token,
    "GET",
  );
  return Array.isArray(rows) ? (rows as ServiceMessage[]) : [];
}

export async function fetchLatestMechanicOffer(
  token: string,
  requestId: string,
  // The offer's sender must still be the currently-assigned mechanic. If a
  // mechanic sends an offer and then declines/cancels, the dispatch request
  // reassigns (or clears) assigned_mechanic_user_id but the old OFFER_JSON
  // chat message still exists — without this check callers would keep
  // showing a stale "mechanic offer received" card for a mechanic who's no
  // longer even on the job.
  expectedMechanicUserId?: string | null,
): Promise<MechanicOffer | null> {
  const rows = await api(
    `/service_messages?request_id=eq.${requestId}&sender_role=eq.mechanic&order=created_at.desc&limit=20&select=*`,
    token,
    "GET",
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  for (const row of rows as ServiceMessage[]) {
    const offer = parseMechanicOfferMessage(row);
    if (!offer) continue;
    if (expectedMechanicUserId && offer.mechanicUserId !== expectedMechanicUserId) continue;
    return offer;
  }
  return null;
}

/**
 * Every distinct mechanic offer ever sent on this request, newest first —
 * the "stacked" list the customer sees on the dedicated offers screen. If a
 * mechanic revised their price more than once, only their latest proposal is
 * included (a mechanic doesn't get two rows).
 *
 * Deliberately does NOT bake in "is this offer still actionable" — callers
 * should derive that live from the current job/request status and assigned
 * mechanic (which can change while this list is on screen), rather than
 * from whatever was true at fetch time.
 */
export async function fetchMechanicOffers(
  token: string,
  requestId: string,
): Promise<MechanicOffer[]> {
  const rows = await api(
    `/service_messages?request_id=eq.${requestId}&sender_role=eq.mechanic&order=created_at.desc&limit=50&select=*`,
    token,
    "GET",
  );
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const seenMechanics = new Set<string>();
  const offers: MechanicOffer[] = [];
  for (const row of rows as ServiceMessage[]) {
    const offer = parseMechanicOfferMessage(row);
    if (!offer || seenMechanics.has(offer.mechanicUserId)) continue;
    seenMechanics.add(offer.mechanicUserId);
    offers.push(offer);
  }
  return offers;
}

/**
 * Customer-initiated equivalent of a mechanic declining: releases the
 * specific mechanic's hold on this request (without cancelling the whole
 * trip) and routes to the next available mechanic, so the customer can keep
 * looking after turning down an offer they didn't like.
 */
export async function declineMechanicOffer(
  token: string,
  requestId: string,
  mechanicUserId: string,
): Promise<DispatchRequest | null> {
  const request = await fetchDispatchRequest(token, requestId).catch(() => null);
  if (!request || request.status !== "searching") return request;
  // Only clear/reroute if this mechanic is still the one actually assigned —
  // otherwise their offer is already inert and there's nothing to release.
  if (request.assigned_mechanic_user_id !== mechanicUserId) return request;
  return routeDispatchRequestToNextMechanic(token, requestId, {
    excludeMechanicUserId: mechanicUserId,
    regionCode: request.region_code ?? undefined,
  });
}
