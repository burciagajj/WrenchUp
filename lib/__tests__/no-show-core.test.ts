import { describe, expect, it } from "vitest";
import {
  hasNoShowGracePeriodElapsed,
  minutesSinceNoShowReport,
  NO_SHOW_GRACE_PERIOD_MS,
} from "@/lib/no-show-core";

describe("hasNoShowGracePeriodElapsed", () => {
  const now = 1_800_000_000_000;

  it("has not elapsed immediately after reporting", () => {
    expect(hasNoShowGracePeriodElapsed(now, now)).toBe(false);
  });

  it("has not elapsed just under the grace period", () => {
    expect(hasNoShowGracePeriodElapsed(now - (NO_SHOW_GRACE_PERIOD_MS - 1), now)).toBe(false);
  });

  it("has elapsed once the grace period is reached", () => {
    expect(hasNoShowGracePeriodElapsed(now - NO_SHOW_GRACE_PERIOD_MS, now)).toBe(true);
  });

  it("is false when nothing has been reported", () => {
    expect(hasNoShowGracePeriodElapsed(null, now)).toBe(false);
    expect(hasNoShowGracePeriodElapsed(undefined, now)).toBe(false);
  });
});

describe("minutesSinceNoShowReport", () => {
  const now = 1_800_000_000_000;

  it("computes whole minutes elapsed", () => {
    expect(minutesSinceNoShowReport(now - 150_000, now)).toBe(2);
  });

  it("returns 0 for unreported/invalid input", () => {
    expect(minutesSinceNoShowReport(null, now)).toBe(0);
    expect(minutesSinceNoShowReport(undefined, now)).toBe(0);
  });
});
