import {
  ANALYTICS_EVENT_NAMES,
  AUTHENTICATED_ANALYTICS_EVENTS,
  normalizeAnalyticsProperties,
} from "@/lib/analytics-core";
import {
  getAnalyticsServiceConfig,
  getCurrentUserId,
  recordAnalyticsEvent,
} from "@/lib/analytics-service";
import { supabaseRest } from "@/lib/notification-service";

function getSessionToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

async function resolveRoleForUser(supabaseUrl: string, serviceKey: string, userId: string): Promise<"customer" | "mechanic" | null> {
  const rows = await supabaseRest<{ role: "customer" | "mechanic" | null }[]>(
    `/user_profiles?user_id=eq.${encodeURIComponent(userId)}&select=role`,
    "GET",
    serviceKey,
  );
  return Array.isArray(rows) ? rows[0]?.role ?? null : null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const eventName = String(body?.eventName || body?.event_name || "").trim();

    if (!ANALYTICS_EVENT_NAMES.includes(eventName as (typeof ANALYTICS_EVENT_NAMES)[number])) {
      return Response.json({ error: "Invalid analytics event name" }, { status: 400 });
    }

    const { supabaseUrl, serviceKey } = getAnalyticsServiceConfig();
    if (!supabaseUrl || !serviceKey) {
      return Response.json({ error: "Analytics service unavailable" }, { status: 503 });
    }

    const sessionToken = getSessionToken(request);
    const requiresAuth = AUTHENTICATED_ANALYTICS_EVENTS.has(eventName as (typeof ANALYTICS_EVENT_NAMES)[number]);
    // userId/role are never trusted from the client body — without this, any
    // caller could attribute an event to an arbitrary userId/role just by
    // putting it in the request. They're only ever derived from a verified
    // session below; anonymous (no-session) events are recorded with
    // userId: null rather than whatever the client claimed.
    let resolvedUserId: string | null = null;
    let resolvedRole: "customer" | "mechanic" | null = null;

    if (sessionToken) {
      const currentUserId = await getCurrentUserId(supabaseUrl, serviceKey, sessionToken);
      if (!currentUserId) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      resolvedUserId = currentUserId;
      resolvedRole = await resolveRoleForUser(supabaseUrl, serviceKey, currentUserId);
    } else if (requiresAuth) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const properties = normalizeAnalyticsProperties(body?.properties);
    const rawRegionCode = typeof properties.region_code === "string" ? properties.region_code.trim().toUpperCase() : null;
    const regionCode = rawRegionCode === "US" || rawRegionCode === "MX" ? rawRegionCode : null;

    await recordAnalyticsEvent({
      eventName: eventName as (typeof ANALYTICS_EVENT_NAMES)[number],
      userId: resolvedUserId,
      role: resolvedRole,
      properties: {
        ...properties,
        region_code: regionCode,
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[analytics] Error:", error);
    return Response.json({ error: "Analytics request failed" }, { status: 500 });
  }
}
