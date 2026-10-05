import { getApiUrl } from "@/lib/api-base-url";
import { getSessionToken } from "@/lib/session-tokens";
import { decodePolyline, type DriveEta } from "@/lib/route-eta-core";
import type { LatLng } from "@/lib/types";

const ROUTE_TIMEOUT_MS = 8000;

export type RouteResult = DriveEta & { path?: LatLng[] };

/**
 * Real driving route via /api/route-eta (Google Routes API). Null on any
 * failure — callers fall back to an estimate. `includePath` also returns the
 * road geometry for drawing on a map.
 */
export async function fetchRouteEta(
  origin: LatLng,
  destination: LatLng,
  options: { includePath?: boolean } = {},
): Promise<RouteResult | null> {
  const token = await getSessionToken().catch(() => null);
  if (!token) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);
  try {
    const res = await fetch(getApiUrl("/api/route-eta"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ origin, destination, includePath: options.includePath === true }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      distanceMiles?: number;
      durationMinutes?: number;
      encodedPath?: string;
    } | null;
    if (typeof data?.distanceMiles !== "number" || typeof data?.durationMinutes !== "number") return null;
    const path = typeof data.encodedPath === "string" ? decodePolyline(data.encodedPath) : undefined;
    return {
      distanceMiles: data.distanceMiles,
      durationMinutes: data.durationMinutes,
      source: "route",
      ...(path && path.length >= 2 ? { path } : {}),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
