// Strikes reset if the mechanic's last strike is older than this — a rolling
// window rather than a lifetime count, so one bad week doesn't follow a
// mechanic forever.
export const STRIKE_RESET_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
// Reaching this many strikes within the window triggers a throttle.
export const STRIKE_THROTTLE_THRESHOLD = 3;
// How long a throttled mechanic is excluded from new offers.
export const OFFER_THROTTLE_DURATION_MS = 24 * 60 * 60 * 1000;

export function computeNextCancelStrikeState(input: {
  currentStrikes: number;
  lastCancelAtMs: number | null;
  nowMs?: number;
}): { strikes: number; throttledUntilMs: number | null } {
  const nowMs = input.nowMs ?? Date.now();
  const strikeStillFresh =
    input.lastCancelAtMs != null && nowMs - input.lastCancelAtMs < STRIKE_RESET_AFTER_MS;
  const nextStrikes = strikeStillFresh ? input.currentStrikes + 1 : 1;
  const throttledUntilMs = nextStrikes >= STRIKE_THROTTLE_THRESHOLD ? nowMs + OFFER_THROTTLE_DURATION_MS : null;
  return { strikes: nextStrikes, throttledUntilMs };
}

export function isMechanicOfferThrottled(
  throttledUntilIso: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!throttledUntilIso) return false;
  const t = Date.parse(throttledUntilIso);
  return Number.isFinite(t) && t > nowMs;
}

/** True if cancelling a job in this status should count as a real (penalized) cancellation, vs. releasing an offer that was never accepted. */
export function isPenalizableCancelStatus(status: string): boolean {
  return status === "accepted" || status === "enroute" || status === "arrived" || status === "in_progress";
}

// Consecutive-decline tracking (repeatedly declining offers without ever
// accepting one). Unlike cancel strikes, this resets on a short window — a
// mechanic who's simply been quiet for a couple hours shouldn't still be
// carrying a streak from earlier in their shift.
export const DECLINE_STREAK_RESET_AFTER_MS = 2 * 60 * 60 * 1000;
export const DECLINE_STREAK_THROTTLE_THRESHOLD = 5;
export const DECLINE_OFFER_THROTTLE_DURATION_MS = 20 * 60 * 1000;

export function computeNextDeclineStreakState(input: {
  currentStreak: number;
  lastDeclineAtMs: number | null;
  nowMs?: number;
}): { streak: number; throttledUntilMs: number | null } {
  const nowMs = input.nowMs ?? Date.now();
  const streakStillFresh =
    input.lastDeclineAtMs != null && nowMs - input.lastDeclineAtMs < DECLINE_STREAK_RESET_AFTER_MS;
  const nextStreak = streakStillFresh ? input.currentStreak + 1 : 1;
  const throttledUntilMs =
    nextStreak >= DECLINE_STREAK_THROTTLE_THRESHOLD ? nowMs + DECLINE_OFFER_THROTTLE_DURATION_MS : null;
  return { streak: nextStreak, throttledUntilMs };
}

export function excludeThrottledMechanics<T extends { mechanic_user_id: string }>(
  mechanics: T[],
  throttledUserIds: Set<string> | string[],
): T[] {
  const throttled = throttledUserIds instanceof Set ? throttledUserIds : new Set(throttledUserIds);
  if (throttled.size === 0) return mechanics;
  return mechanics.filter((m) => !throttled.has(m.mechanic_user_id));
}
