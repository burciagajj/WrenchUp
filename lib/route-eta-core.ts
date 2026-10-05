import { haversineMeters, metersToMiles } from "./geo";
import type { LatLng } from "./types";

export type DriveEta = {
  distanceMiles: number;
  durationMinutes: number;
  /** "route" = real driving route from Google; "estimate" = straight-line fallback. */
  source: "route" | "estimate";
};

/** Roads are rarely straight: typical city detour over straight-line distance. */
export const ROAD_DETOUR_FACTOR = 1.3;
/** Average city driving speed used only for the fallback estimate. */
export const ESTIMATE_SPEED_MPH = 25;

const METERS_PER_MILE = 1609.344;

/**
 * Parses a Routes API computeRoutes response (fields distanceMeters,
 * duration "123s", optional polyline.encodedPolyline).
 */
export function parseRoutesResponse(
  data: unknown,
): (Omit<DriveEta, "source"> & { encodedPath?: string }) | null {
  const route = (
    data as {
      routes?: Array<{ distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }>;
    } | null
  )?.routes?.[0];
  if (!route) return null;
  const meters = Number(route.distanceMeters);
  const seconds = typeof route.duration === "string" ? Number(route.duration.replace(/s$/, "")) : Number.NaN;
  if (!Number.isFinite(meters) || meters < 0 || !Number.isFinite(seconds) || seconds < 0) return null;
  const encodedPath = route.polyline?.encodedPolyline;
  return {
    distanceMiles: +(meters / METERS_PER_MILE).toFixed(1),
    durationMinutes: Math.max(1, Math.ceil(seconds / 60)),
    ...(typeof encodedPath === "string" && encodedPath ? { encodedPath } : {}),
  };
}

/** Fallback when routing is unavailable: straight line x detour factor at city speed. */
export function estimateDriveEta(from: LatLng, to: LatLng): DriveEta {
  const roadMiles = metersToMiles(haversineMeters(from, to)) * ROAD_DETOUR_FACTOR;
  return {
    distanceMiles: +roadMiles.toFixed(1),
    durationMinutes: Math.max(1, Math.ceil((roadMiles / ESTIMATE_SPEED_MPH) * 60)),
    source: "estimate",
  };
}

export function isRoutableCoords(value: unknown): value is LatLng {
  const c = value as LatLng | null;
  return (
    !!c &&
    typeof c.latitude === "number" &&
    typeof c.longitude === "number" &&
    Number.isFinite(c.latitude) &&
    Number.isFinite(c.longitude) &&
    Math.abs(c.latitude) <= 90 &&
    Math.abs(c.longitude) <= 180 &&
    !(c.latitude === 0 && c.longitude === 0)
  );
}

/** Display strings for the offer tiles. "~" marks an estimate, "—" unknown. */
export function formatEtaMinutes(eta: DriveEta | null): string {
  if (!eta) return "—";
  const prefix = eta.source === "estimate" ? "~" : "";
  if (eta.durationMinutes >= 60) {
    const hours = Math.floor(eta.durationMinutes / 60);
    const minutes = eta.durationMinutes % 60;
    return `${prefix}${hours} h ${minutes} min`;
  }
  return `${prefix}${eta.durationMinutes} min`;
}

/**
 * Decodes a Google encoded polyline (precision 5) — the road path returned
 * by the Routes API — into coordinates.
 */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        if (index >= encoded.length) return points;
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

export function pathLengthMiles(path: readonly LatLng[]): number {
  let meters = 0;
  for (let i = 1; i < path.length; i++) meters += haversineMeters(path[i - 1], path[i]);
  return metersToMiles(meters);
}

/**
 * The part of a road path still ahead of `current`: everything after the
 * path point closest to it, starting from `current` itself. Lets the map
 * line shrink as the mechanic drives without re-fetching the route.
 */
export function remainingPath(path: readonly LatLng[], current: LatLng): LatLng[] {
  if (path.length === 0) return [];
  let nearest = 0;
  let nearestMeters = Number.POSITIVE_INFINITY;
  for (let i = 0; i < path.length; i++) {
    const meters = haversineMeters(path[i], current);
    if (meters < nearestMeters) {
      nearestMeters = meters;
      nearest = i;
    }
  }
  return [current, ...path.slice(nearest + 1)];
}
