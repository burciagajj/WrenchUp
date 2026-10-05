/**
 * Grace period between a mechanic reporting "can't find the customer" (while
 * arrived) and being offered a no-penalty cancel. Gives the customer a
 * realistic window to respond before the mechanic gives up and the job goes
 * back to search for another mechanic.
 */
export const NO_SHOW_GRACE_PERIOD_MS = 7 * 60 * 1000;

/** True once enough time has passed since a no-show report to offer a no-penalty cancel. */
export function hasNoShowGracePeriodElapsed(
  noShowReportedAtMs: number | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (noShowReportedAtMs == null || !Number.isFinite(noShowReportedAtMs)) return false;
  return nowMs - noShowReportedAtMs >= NO_SHOW_GRACE_PERIOD_MS;
}

/** Minutes elapsed since the no-show report, floored, for display ("reported 3m ago"). */
export function minutesSinceNoShowReport(
  noShowReportedAtMs: number | null | undefined,
  nowMs: number = Date.now(),
): number {
  if (noShowReportedAtMs == null || !Number.isFinite(noShowReportedAtMs)) return 0;
  return Math.max(0, Math.floor((nowMs - noShowReportedAtMs) / 60000));
}
