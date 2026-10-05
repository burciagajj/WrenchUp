import type { LatLng } from "./types";

/** A cached GPS fix older than this is not trusted for a new request. */
export const REQUEST_GPS_MAX_AGE_MS = 2 * 60 * 1000;

export type RequestLocationSource = "chosen_address" | "gps" | "recent_gps";

/**
 * Where a new service request should send the mechanic.
 *
 * userCoords is persisted across app launches, so on its own it can be hours
 * or miles out of date — requests used to go to wherever the phone was when
 * the app was first opened. Order of preference:
 *   1. an address the customer explicitly chose (geocoded),
 *   2. a GPS fix taken right now,
 *   3. the cached GPS fix, only if it's from the last couple of minutes.
 * Returns null when none is trustworthy; the caller must not send the request.
 */
export function chooseRequestLocation(input: {
  chosenAddressCoords: LatLng | null | undefined;
  freshGps: LatLng | null | undefined;
  cachedGps: LatLng | null | undefined;
  cachedGpsAt: number | null | undefined;
  now: number;
}): { coords: LatLng; source: RequestLocationSource } | null {
  if (isValidCoords(input.chosenAddressCoords)) return { coords: input.chosenAddressCoords, source: "chosen_address" };
  if (isValidCoords(input.freshGps)) return { coords: input.freshGps, source: "gps" };
  if (
    isValidCoords(input.cachedGps) &&
    typeof input.cachedGpsAt === "number" &&
    input.now - input.cachedGpsAt <= REQUEST_GPS_MAX_AGE_MS
  ) {
    return { coords: input.cachedGps, source: "recent_gps" };
  }
  return null;
}

export function isValidCoords(coords: LatLng | null | undefined): coords is LatLng {
  return (
    !!coords &&
    Number.isFinite(coords.latitude) &&
    Number.isFinite(coords.longitude) &&
    Math.abs(coords.latitude) <= 90 &&
    Math.abs(coords.longitude) <= 180 &&
    !(coords.latitude === 0 && coords.longitude === 0)
  );
}

/** Whether a typed booking address differs from the current service label. */
export function isDifferentAddress(typed: string, currentLabel: string): boolean {
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  return normalize(typed) !== normalize(currentLabel);
}
