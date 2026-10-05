import { describe, it, expect } from "vitest";
import {
  BACKGROUND_PERMISSION_REASK_MS,
  isTripTrackingExpired,
  latestLocation,
  MAX_TRIP_TRACKING_MS,
  parseTripTrackingContext,
  shouldReaskBackgroundPermission,
} from "../mechanic-trip-tracking-core";

const fix = (timestamp: number, latitude = 31.76, longitude = -106.48) => ({
  timestamp,
  coords: { latitude, longitude },
});

describe("parseTripTrackingContext", () => {
  it("reads a stored context", () => {
    const raw = JSON.stringify({ requestId: "r1", mechanicUserId: "m1", startedAt: 1000 });
    expect(parseTripTrackingContext(raw)).toEqual({ requestId: "r1", mechanicUserId: "m1", startedAt: 1000 });
  });

  it("rejects missing, malformed, or incomplete values", () => {
    expect(parseTripTrackingContext(null)).toBeNull();
    expect(parseTripTrackingContext("not json")).toBeNull();
    expect(parseTripTrackingContext(JSON.stringify({ requestId: "r1", startedAt: 1 }))).toBeNull();
    expect(parseTripTrackingContext(JSON.stringify({ requestId: "", mechanicUserId: "m1", startedAt: 1 }))).toBeNull();
  });
});

describe("isTripTrackingExpired", () => {
  it("expires only after the safety window", () => {
    const context = { requestId: "r1", mechanicUserId: "m1", startedAt: 0 };
    expect(isTripTrackingExpired(context, MAX_TRIP_TRACKING_MS)).toBe(false);
    expect(isTripTrackingExpired(context, MAX_TRIP_TRACKING_MS + 1)).toBe(true);
  });
});

describe("latestLocation", () => {
  it("picks the newest fix in a batch regardless of order", () => {
    expect(latestLocation([fix(3000, 1), fix(1000, 2), fix(2000, 3)])?.coords.latitude).toBe(1);
  });

  it("skips fixes without coordinates and handles empty batches", () => {
    expect(latestLocation([fix(5000, Number.NaN), fix(1000, 2)])?.coords.latitude).toBe(2);
    expect(latestLocation([])).toBeNull();
    expect(latestLocation(undefined)).toBeNull();
  });
});

describe("shouldReaskBackgroundPermission", () => {
  it("asks when never declined, then waits a day after a decline", () => {
    expect(shouldReaskBackgroundPermission(null, 0)).toBe(true);
    expect(shouldReaskBackgroundPermission(0, BACKGROUND_PERMISSION_REASK_MS)).toBe(false);
    expect(shouldReaskBackgroundPermission(0, BACKGROUND_PERMISSION_REASK_MS + 1)).toBe(true);
  });
});
