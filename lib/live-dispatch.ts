import { ensureValidAccessToken } from "@/lib/profile-session";

type DispatchStatus =
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
  currency: string;
  oil_package?: "conventional" | "synthetic_blend" | "full_synthetic" | null;
  scheduled_for?: string | null;
  customer_note?: string | null;
  customer_has_parts?: boolean | null;
  issue_photo_url?: string | null;
  platform_fee_rate?: number | null;
  platform_fee_amount?: number | null;
  mechanic_payout?: number | null;
  status: DispatchStatus;
  assigned_mechanic_user_id: string | null;
  assigned_mechanic_name: string | null;
  mechanic_latitude?: number | null;
  mechanic_longitude?: number | null;
  mechanic_marked_done_at?: string | null;
  customer_completed_at?: string | null;
  payment_state?: string | null;
  dispute_window_ends_at?: string | null;
  funds_release_at?: string | null;
  before_photo_url?: string | null;
  after_photo_url?: string | null;
  receipt_number: string | null;
  region_code?: "US" | "MX" | null;
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

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

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
    const res = await fetch(`${SUPABASE_URL}/rest/v1${endpoint}`, {
      method,
      headers: headers(accessToken),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Dispatch API failed (${res.status})`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("network request failed")) {
      const tagged = new Error("NETWORK_UNAVAILABLE");
      (tagged as Error & { cause?: unknown }).cause = error;
      throw tagged;
    }
    throw error;
  }
}

function isMissingColumnError(error: unknown, column: string): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes(`column service_requests.${column}`.toLowerCase()) && msg.includes("does not exist");
}

function getMissingServiceRequestsColumn(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const msg = error.message;
  const pgMatch = msg.match(/column\s+service_requests\.([a-z_]+)\s+does not exist/i);
  if (pgMatch?.[1]) return pgMatch[1];
  const pgrstMatch = msg.match(/could not find the ['"]([a-z_]+)['"] column of ['"]service_requests['"] in the schema cache/i);
  return pgrstMatch?.[1] ?? null;
}

export async function setMechanicPresence(
  token: string,
  mechanicUserId: string,
  mechanicName: string,
  isOnline: boolean,
) {
  await api(`/mechanic_presence?mechanic_user_id=eq.${mechanicUserId}`, token, "PATCH", {
    is_online: isOnline,
    mechanic_name: mechanicName,
    updated_at: new Date().toISOString(),
  }).catch(async () => {
    await api("/mechanic_presence", token, "POST", {
      mechanic_user_id: mechanicUserId,
      is_online: isOnline,
      mechanic_name: mechanicName,
      updated_at: new Date().toISOString(),
    });
  });
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
  },
): Promise<DispatchRequest> {
  const payload: Record<string, unknown> = {
    customer_user_id: input.customerUserId,
    customer_name: input.customerName,
    customer_photo_url: input.customerPhotoUrl ?? undefined,
    service_code: input.serviceCode,
    vehicle_label: input.vehicleLabel,
    location_label: input.locationLabel,
    offered_price: input.offeredPrice,
    oil_package: input.oilPackage ?? undefined,
    scheduled_for: input.scheduledFor ?? undefined,
    customer_note: input.customerNote ?? undefined,
    customer_has_parts: input.customerHasParts ?? undefined,
    issue_photo_url: input.issuePhotoUrl ?? undefined,
    platform_fee_rate: input.platformFeeRate ?? undefined,
    platform_fee_amount: input.platformFeeAmount ?? undefined,
    mechanic_payout: input.mechanicPayout ?? undefined,
    region_code: input.regionCode ?? undefined,
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
      status: "searching",
    });
  }
  return (Array.isArray(rows) ? rows[0] : rows) as DispatchRequest;
}

export async function fetchDispatchRequest(token: string, requestId: string): Promise<DispatchRequest | null> {
  const rows = await api(`/service_requests?id=eq.${requestId}&select=*`, token, "GET");
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0] as DispatchRequest;
}

export async function fetchOpenDispatchRequests(
  token: string,
  mechanicUserId: string,
  regionCode?: "US" | "MX",
): Promise<DispatchRequest[]> {
  const withRegion = `/service_requests?status=eq.searching&assigned_mechanic_user_id=is.null&customer_user_id=neq.${mechanicUserId}${
    regionCode ? `&region_code=eq.${regionCode}` : ""
  }&order=created_at.asc&limit=5&select=*`;
  try {
    const rows = await api(withRegion, token, "GET");
    return Array.isArray(rows) ? (rows as DispatchRequest[]) : [];
  } catch (error) {
    if (!isMissingColumnError(error, "region_code")) throw error;
    const fallback = await api(
      `/service_requests?status=eq.searching&assigned_mechanic_user_id=is.null&customer_user_id=neq.${mechanicUserId}&order=created_at.asc&limit=5&select=*`,
      token,
      "GET",
    );
    return Array.isArray(fallback) ? (fallback as DispatchRequest[]) : [];
  }
}

export async function fetchMechanicBookedRequests(
  token: string,
  mechanicUserId: string,
  regionCode?: "US" | "MX",
): Promise<DispatchRequest[]> {
  try {
    const regionFilter = regionCode ? `&region_code=eq.${regionCode}` : "";
    const rows = await api(
      `/service_requests?or=(and(status.eq.searching,scheduled_for.not.is.null),and(status.eq.accepted,assigned_mechanic_user_id.eq.${mechanicUserId}))${regionFilter}&order=scheduled_for.asc.nullslast,created_at.asc&select=*`,
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
      `/service_requests?or=(status.eq.searching,and(status.eq.accepted,assigned_mechanic_user_id.eq.${mechanicUserId}))&order=created_at.asc&select=*`,
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

export async function acceptDispatchRequest(
  token: string,
  requestId: string,
  mechanicUserId: string,
  mechanicName: string,
): Promise<DispatchRequest | null> {
  const rows = await api(
    `/service_requests?id=eq.${requestId}&status=eq.searching&assigned_mechanic_user_id=is.null`,
    token,
    "PATCH",
    {
      status: "accepted",
      assigned_mechanic_user_id: mechanicUserId,
      assigned_mechanic_name: mechanicName,
      updated_at: new Date().toISOString(),
    },
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0] as DispatchRequest;
}

export async function assignDispatchToMechanic(
  token: string,
  requestId: string,
  mechanicUserId: string,
  mechanicName: string,
) {
  const rows = await api(
    `/service_requests?id=eq.${requestId}&status=eq.searching`,
    token,
    "PATCH",
    {
      status: "accepted",
      assigned_mechanic_user_id: mechanicUserId,
      assigned_mechanic_name: mechanicName,
      updated_at: new Date().toISOString(),
    },
  );
  return Array.isArray(rows) ? (rows[0] as DispatchRequest | undefined) ?? null : (rows as DispatchRequest | null);
}

export async function updateDispatchOfferedPrice(
  token: string,
  requestId: string,
  offeredPrice: number,
) {
  const rows = await api(
    `/service_requests?id=eq.${requestId}`,
    token,
    "PATCH",
    {
      offered_price: offeredPrice,
      updated_at: new Date().toISOString(),
    },
  );
  return Array.isArray(rows) ? (rows[0] as DispatchRequest | undefined) ?? null : (rows as DispatchRequest | null);
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
    customerCompletedAt?: string | null;
    paymentState?: "escrow_hold" | "ready_for_release" | "released";
    disputeWindowEndsAt?: string | null;
    fundsReleaseAt?: string | null;
    beforePhotoUrl?: string | null;
    afterPhotoUrl?: string | null;
  },
) {
  const payload: Record<string, unknown> = {
    status,
    receipt_number: opts?.receiptNumber ?? undefined,
    mechanic_latitude: opts?.mechanicLatitude ?? undefined,
    mechanic_longitude: opts?.mechanicLongitude ?? undefined,
    mechanic_marked_done_at: opts?.mechanicMarkedDoneAt ?? undefined,
    customer_completed_at: opts?.customerCompletedAt ?? undefined,
    payment_state: opts?.paymentState ?? undefined,
    dispute_window_ends_at: opts?.disputeWindowEndsAt ?? undefined,
    funds_release_at: opts?.fundsReleaseAt ?? undefined,
    before_photo_url: opts?.beforePhotoUrl ?? undefined,
    after_photo_url: opts?.afterPhotoUrl ?? undefined,
    updated_at: new Date().toISOString(),
  };
  try {
    await api(`/service_requests?id=eq.${requestId}`, token, "PATCH", payload);
  } catch (error) {
    // If optional columns are missing, retry with minimal payload.
    if (!(error instanceof Error) || error.message !== "NETWORK_UNAVAILABLE") {
      await api(`/service_requests?id=eq.${requestId}`, token, "PATCH", {
        status,
        updated_at: new Date().toISOString(),
      });
      return;
    }
    // Network is unavailable: keep local flow moving and let sync loops retry later.
    console.warn("[live-dispatch] Skipped status sync due to network outage");
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
