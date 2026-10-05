/**
 * How stale a mechanic's last-known GPS coordinate can be before the customer
 * app stops presenting it as a confident "live" position/ETA.
 *
 * Mechanics push location at minimum every 2 minutes (heartbeat in
 * app/mechanic/active.tsx) plus much more frequently while actually driving
 * (watchPositionAsync). 3x the heartbeat gives headroom for normal network/poll
 * lag without hiding a location that's merely a little behind.
 */
export const STALE_LOCATION_THRESHOLD_MS = 3 * 60 * 1000;

/**
 * True if a mechanic's last known location should no longer be presented as
 * live. A missing/unknown timestamp (null/undefined) is treated as stale —
 * we'd rather under-claim freshness than show a confident ETA we can't back up.
 */
export function isMechanicLocationStale(
  locationUpdatedAtMs: number | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (locationUpdatedAtMs == null || !Number.isFinite(locationUpdatedAtMs)) return true;
  return nowMs - locationUpdatedAtMs > STALE_LOCATION_THRESHOLD_MS;
}
