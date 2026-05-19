import { describe, it, expect } from "vitest";
import {
  haversineMeters,
  metersToMiles,
  offsetMeters,
  interpolate,
  mechanicCoords,
  regionFor,
} from "../geo";
import { MECHANICS } from "../seed";

const SF = { latitude: 37.7762, longitude: -122.4154 };

describe("geo", () => {
  it("haversine returns ~0 for same point", () => {
    expect(haversineMeters(SF, SF)).toBeLessThan(0.5);
  });

  it("haversine matches a known distance (SF -> ~1km north)", () => {
    const target = { latitude: SF.latitude + 0.009, longitude: SF.longitude };
    const meters = haversineMeters(SF, target);
    expect(meters).toBeGreaterThan(950);
    expect(meters).toBeLessThan(1050);
  });

  it("offsetMeters east/north both move the coordinate in the right direction", () => {
    const eastPoint = offsetMeters(SF, 1000, 0);
    expect(eastPoint.longitude).toBeGreaterThan(SF.longitude);
    expect(Math.abs(eastPoint.latitude - SF.latitude)).toBeLessThan(0.0001);

    const northPoint = offsetMeters(SF, 0, 1000);
    expect(northPoint.latitude).toBeGreaterThan(SF.latitude);
    // 1000 meters north is ~1000 m
    expect(haversineMeters(SF, northPoint)).toBeGreaterThan(900);
    expect(haversineMeters(SF, northPoint)).toBeLessThan(1100);
  });

  it("interpolate at t=0 returns a, at t=1 returns b, midpoint between", () => {
    const a = SF;
    const b = { latitude: 37.79, longitude: -122.4 };
    expect(interpolate(a, b, 0)).toEqual(a);
    expect(interpolate(a, b, 1)).toEqual(b);
    const mid = interpolate(a, b, 0.5);
    expect(mid.latitude).toBeCloseTo((a.latitude + b.latitude) / 2, 6);
  });

  it("metersToMiles converts correctly", () => {
    expect(metersToMiles(1609.344)).toBeCloseTo(1, 5);
  });

  it("mechanicCoords offsets by the mechanic's offsetMeters", () => {
    const m = MECHANICS[0];
    const coords = mechanicCoords(m, SF);
    const expected = offsetMeters(SF, m.offsetMeters.east, m.offsetMeters.north);
    expect(coords.latitude).toBeCloseTo(expected.latitude, 8);
    expect(coords.longitude).toBeCloseTo(expected.longitude, 8);
  });

  it("regionFor returns a sensible region containing all points", () => {
    const a = SF;
    const b = { latitude: SF.latitude + 0.02, longitude: SF.longitude + 0.02 };
    const r = regionFor([a, b]);
    expect(r.latitudeDelta).toBeGreaterThan(0);
    expect(r.longitudeDelta).toBeGreaterThan(0);
    expect(r.latitude).toBeCloseTo((a.latitude + b.latitude) / 2, 6);
  });
});
