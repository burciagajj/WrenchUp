// Minimum lead time required between "now" and a customer-chosen scheduled
// service time. Prevents booking a mechanic for a time that's already passed
// (or is about to, before anyone could realistically act on it).
export const MIN_SCHEDULE_LEAD_MS = 15 * 60 * 1000;

export function isScheduledTimeTooSoon(scheduledForMs: number, nowMs: number = Date.now()): boolean {
  return scheduledForMs < nowMs + MIN_SCHEDULE_LEAD_MS;
}

export function earliestAllowedScheduleTime(nowMs: number = Date.now()): number {
  return nowMs + MIN_SCHEDULE_LEAD_MS;
}
