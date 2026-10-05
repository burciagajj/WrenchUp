/**
 * Pure helpers for the mechanic background trip tracker
 * (lib/mechanic-trip-tracking.ts), kept free of native imports so they can be
 * unit tested.
 */

export type TripTrackingContext = {
  requestId: string;
  mechanicUserId: string;
  startedAt: number;
};

/** Safety net: never keep a trip tracker alive longer than this. */
export const MAX_TRIP_TRACKING_MS = 6 * 60 * 60 * 1000;

/** How long to wait before re-asking a mechanic who declined background location. */
export const BACKGROUND_PERMISSION_REASK_MS = 24 * 60 * 60 * 1000;

export function parseTripTrackingContext(raw: string | null | undefined): TripTrackingContext | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TripTrackingContext>;
    if (
      typeof parsed.requestId === "string" &&
      parsed.requestId &&
      typeof parsed.mechanicUserId === "string" &&
      parsed.mechanicUserId &&
      typeof parsed.startedAt === "number" &&
      Number.isFinite(parsed.startedAt)
    ) {
      return { requestId: parsed.requestId, mechanicUserId: parsed.mechanicUserId, startedAt: parsed.startedAt };
    }
  } catch {
    // fall through
  }
  return null;
}

export function isTripTrackingExpired(context: TripTrackingContext, now: number): boolean {
  return now - context.startedAt > MAX_TRIP_TRACKING_MS;
}

type TimedLocation = { timestamp: number; coords: { latitude: number; longitude: number } };

/**
 * The newest fix in a batch. Only this one is sent: the distance trigger
 * judges plausibility by the time each fix reaches the server, so replaying
 * a backlog of older fixes milliseconds apart would read as impossible speed.
 */
export function latestLocation<T extends TimedLocation>(locations: readonly T[] | null | undefined): T | null {
  if (!locations || locations.length === 0) return null;
  let latest: T | null = null;
  for (const location of locations) {
    if (
      !Number.isFinite(location?.coords?.latitude) ||
      !Number.isFinite(location?.coords?.longitude)
    ) {
      continue;
    }
    if (!latest || location.timestamp >= latest.timestamp) latest = location;
  }
  return latest;
}

export function shouldReaskBackgroundPermission(declinedAt: number | null, now: number): boolean {
  return declinedAt === null || now - declinedAt > BACKGROUND_PERMISSION_REASK_MS;
}
