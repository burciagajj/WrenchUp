import { describe, it, expect } from "vitest";
import {
  estimateDriveEta,
  formatEtaMinutes,
  isRoutableCoords,
  parseRoutesResponse,
  ROAD_DETOUR_FACTOR,
} from "../route-eta-core";
import { offsetMeters } from "../geo";

const origin = { latitude: 31.7619, longitude: -106.485 };

describe("parseRoutesResponse", () => {
  it("reads distance and duration from the Routes API shape", () => {
    expect(parseRoutesResponse({ routes: [{ distanceMeters: 3862, duration: "468s" }] })).toEqual({
      distanceMiles: 2.4,
      durationMinutes: 8,
    });
  });

  it("returns null for errors or missing fields", () => {
    expect(parseRoutesResponse({ error: { code: 403 } })).toBeNull();
    expect(parseRoutesResponse({ routes: [] })).toBeNull();
    expect(parseRoutesResponse({ routes: [{ distanceMeters: 100 }] })).toBeNull();
    expect(parseRoutesResponse(null)).toBeNull();
  });
});

describe("estimateDriveEta", () => {
  it("applies the road detour factor to the straight-line distance", () => {
    const twoMilesAway = offsetMeters(origin, 0, 2 * 1609.344);
    const eta = estimateDriveEta(origin, twoMilesAway);
    expect(eta.source).toBe("estimate");
    expect(eta.distanceMiles).toBeCloseTo(2 * ROAD_DETOUR_FACTOR, 1);
    expect(eta.durationMinutes).toBe(7);
  });

  it("never shows 0 minutes", () => {
    expect(estimateDriveEta(origin, origin).durationMinutes).toBe(1);
  });
});

describe("formatEtaMinutes", () => {
  it("marks estimates and handles long trips and unknowns", () => {
    expect(formatEtaMinutes({ distanceMiles: 2, durationMinutes: 8, source: "route" })).toBe("8 min");
    expect(formatEtaMinutes({ distanceMiles: 2, durationMinutes: 8, source: "estimate" })).toBe("~8 min");
    expect(formatEtaMinutes({ distanceMiles: 60, durationMinutes: 75, source: "route" })).toBe("1 h 15 min");
    expect(formatEtaMinutes(null)).toBe("—");
  });
});

describe("isRoutableCoords", () => {
  it("accepts real coordinates only", () => {
    expect(isRoutableCoords(origin)).toBe(true);
    expect(isRoutableCoords({ latitude: 0, longitude: 0 })).toBe(false);
    expect(isRoutableCoords({ latitude: "31", longitude: -106 })).toBe(false);
    expect(isRoutableCoords(null)).toBe(false);
  });
});
