import { useEffect, useState } from "react";
import { getApiUrl } from "@/lib/api-base-url";
import { getSessionToken } from "@/lib/session-tokens";
import { getFreshDeviceCoords } from "@/lib/service-location";
import { estimateDriveEta, isRoutableCoords, type DriveEta } from "@/lib/route-eta-core";
import type { LatLng } from "@/lib/types";

const ROUTE_TIMEOUT_MS = 8000;

async function fetchRouteEta(origin: LatLng, destination: LatLng): Promise<DriveEta | null> {
  const token = await getSessionToken().catch(() => null);
  if (!token) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);
  try {
    const res = await fetch(getApiUrl("/api/route-eta"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ origin, destination }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as { distanceMiles?: number; durationMinutes?: number } | null;
    if (typeof data?.distanceMiles !== "number" || typeof data?.durationMinutes !== "number") return null;
    return { distanceMiles: data.distanceMiles, durationMinutes: data.durationMinutes, source: "route" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Driving distance + ETA from the mechanic's current position to a pickup.
 * Shows a straight-line estimate immediately, then the real driving route
 * (traffic-aware) once /api/route-eta answers. `eta` stays null when there
 * is no usable location at all — callers should show "—", not a made-up
 * number.
 */
export function useDriveEta(
  pickup: LatLng | null | undefined,
  fallbackOrigin?: LatLng | null,
): { eta: DriveEta | null; loading: boolean } {
  const [eta, setEta] = useState<DriveEta | null>(null);
  const [loading, setLoading] = useState(true);
  const pickupLat = pickup?.latitude;
  const pickupLng = pickup?.longitude;
  const fallbackLat = fallbackOrigin?.latitude;
  const fallbackLng = fallbackOrigin?.longitude;

  useEffect(() => {
    let alive = true;
    const destination = { latitude: pickupLat as number, longitude: pickupLng as number };
    (async () => {
      if (!isRoutableCoords(destination)) return;
      const fresh = await getFreshDeviceCoords();
      const fallback = { latitude: fallbackLat as number, longitude: fallbackLng as number };
      const origin = fresh ?? (isRoutableCoords(fallback) ? fallback : null);
      if (!origin || !alive) return;
      setEta(estimateDriveEta(origin, destination));
      const route = await fetchRouteEta(origin, destination);
      if (route && alive) setEta(route);
    })()
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [pickupLat, pickupLng, fallbackLat, fallbackLng]);

  return { eta, loading };
}
