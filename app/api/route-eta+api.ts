// Real driving distance + traffic-aware ETA between two points, for the
// mechanic's incoming-offer screen (straight-line distance at a fixed 24 mph
// was shown before). Uses Google's Routes API with the server-only
// GOOGLE_PLACES_API_KEY (see places-autocomplete+api.ts for why the Android
// Maps key can't be used server-side). The "Routes API" must be enabled for
// that key's Google Cloud project; until it is, this returns 502 and the app
// shows a labeled estimate instead.
//
// Signed-in users only, rate limited per user, since every call is billed.
import { getCurrentUserId, getNotificationServiceConfig } from "@/lib/notification-service";
import { checkDurableRateLimit } from "@/lib/admin-auth";
import { isRoutableCoords, parseRoutesResponse } from "@/lib/route-eta-core";

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const RATE_LIMIT = { requests: 30, windowSeconds: 300 };

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const sessionToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!sessionToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const origin = body?.origin;
    const destination = body?.destination;
    // The road path (for drawing the route on a map) is only fetched when asked.
    const includePath = body?.includePath === true;
    if (!isRoutableCoords(origin) || !isRoutableCoords(destination)) {
      return Response.json({ error: "origin and destination coordinates are required" }, { status: 400 });
    }

    const { supabaseUrl, serviceKey } = getNotificationServiceConfig();
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || "";
    if (!supabaseUrl || !serviceKey || !apiKey) {
      return Response.json({ code: "route_not_configured", error: "Routing is not configured" }, { status: 503 });
    }

    const userId = await getCurrentUserId(supabaseUrl, serviceKey, sessionToken);
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const allowed = await checkDurableRateLimit(
      `route-eta:${userId}`,
      RATE_LIMIT.requests,
      RATE_LIMIT.windowSeconds,
      serviceKey,
    ).catch(() => false);
    if (!allowed) {
      return Response.json({ code: "rate_limited", error: "Too many route requests" }, { status: 429 });
    }

    const res = await fetch(ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": includePath
          ? "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline"
          : "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { location: { latLng: origin } },
        destination: { location: { latLng: destination } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
      }),
    });
    const data = await res.json().catch(() => null);
    const route = res.ok ? parseRoutesResponse(data) : null;
    if (!route) {
      console.warn("[api/route-eta] Routes API failed:", res.status, data?.error?.status ?? "");
      return Response.json({ code: "route_unavailable", error: "Route unavailable" }, { status: 502 });
    }
    return Response.json(route);
  } catch (error) {
    console.error("[api/route-eta] Error:", error);
    return Response.json({ code: "route_unavailable", error: "Route unavailable" }, { status: 500 });
  }
}
