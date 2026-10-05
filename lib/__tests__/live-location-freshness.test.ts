import { describe, expect, it } from "vitest";
import { isMechanicLocationStale, STALE_LOCATION_THRESHOLD_MS } from "@/lib/live-location-freshness";

describe("isMechanicLocationStale", () => {
  const now = 1_800_000_000_000;

  it("is not stale just after an update", () => {
    expect(isMechanicLocationStale(now - 1000, now)).toBe(false);
  });

  it("is not stale right at the threshold boundary", () => {
    expect(isMechanicLocationStale(now - STALE_LOCATION_THRESHOLD_MS, now)).toBe(false);
  });

  it("is stale just past the threshold", () => {
    expect(isMechanicLocationStale(now - STALE_LOCATION_THRESHOLD_MS - 1, now)).toBe(true);
  });

  it("treats a missing timestamp as stale, not fresh", () => {
    expect(isMechanicLocationStale(null, now)).toBe(true);
    expect(isMechanicLocationStale(undefined, now)).toBe(true);
    expect(isMechanicLocationStale(NaN, now)).toBe(true);
  });
});
