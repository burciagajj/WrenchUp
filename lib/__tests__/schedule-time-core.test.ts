import { describe, expect, it } from "vitest";
import { MIN_SCHEDULE_LEAD_MS, earliestAllowedScheduleTime, isScheduledTimeTooSoon } from "@/lib/schedule-time-core";

describe("schedule-time-core", () => {
  const now = new Date("2026-07-28T12:00:00.000Z").getTime();

  it("rejects a time in the past", () => {
    expect(isScheduledTimeTooSoon(now - 60_000, now)).toBe(true);
  });

  it("rejects a time inside the lead buffer", () => {
    expect(isScheduledTimeTooSoon(now + MIN_SCHEDULE_LEAD_MS - 1, now)).toBe(true);
  });

  it("accepts a time at exactly the lead buffer boundary", () => {
    expect(isScheduledTimeTooSoon(now + MIN_SCHEDULE_LEAD_MS, now)).toBe(false);
  });

  it("accepts a time well in the future", () => {
    expect(isScheduledTimeTooSoon(now + 60 * 60 * 1000, now)).toBe(false);
  });

  it("computes the earliest allowed time", () => {
    expect(earliestAllowedScheduleTime(now)).toBe(now + MIN_SCHEDULE_LEAD_MS);
  });
});
