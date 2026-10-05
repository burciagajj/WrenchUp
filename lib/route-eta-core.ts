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

/** Parses a Routes API computeRoutes response (fields distanceMeters, duration "123s"). */
export function parseRoutesResponse(data: unknown): Omit<DriveEta, "source"> | null {
  const route = (data as { routes?: Array<{ distanceMeters?: number; duration?: string }> } | null)?.routes?.[0];
  if (!route) return null;
  const meters = Number(route.distanceMeters);
  const seconds = typeof route.duration === "string" ? Number(route.duration.replace(/s$/, "")) : Number.NaN;
  if (!Number.isFinite(meters) || meters < 0 || !Number.isFinite(seconds) || seconds < 0) return null;
  return {
    distanceMiles: +(meters / METERS_PER_MILE).toFixed(1),
    durationMinutes: Math.max(1, Math.ceil(seconds / 60)),
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
