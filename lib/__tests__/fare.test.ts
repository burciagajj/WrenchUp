import { describe, it, expect } from "vitest";
import { computeFare } from "../fare";
import { MECHANICS, SERVICE_TYPES, getServiceType, getMechanic } from "../seed";

describe("computeFare", () => {
  it("returns positive base, distance, service, and total", () => {
    const m = MECHANICS[0];
    const s = SERVICE_TYPES[0];
    const fare = computeFare(m, s);
    expect(fare.base).toBeGreaterThan(0);
    expect(fare.distance).toBeGreaterThan(0);
    expect(fare.service).toBeGreaterThan(0);
    expect(fare.total).toBeCloseTo(+(fare.base + fare.distance + fare.service).toFixed(2), 2);
  });

  it("higher hourly rate yields service premium", () => {
    const expensive = MECHANICS.find((m) => m.hourlyRate >= 95)!;
    const cheap = MECHANICS.find((m) => m.hourlyRate < 85)!;
    const s = getServiceType("oil_change")!;
    const a = computeFare(expensive, s);
    const b = computeFare(cheap, s);
    expect(a.service).toBeGreaterThan(b.service);
  });

  it("longer distance increases dispatch cost", () => {
    const near = MECHANICS.reduce((p, c) => (c.distanceMiles < p.distanceMiles ? c : p));
    const far = MECHANICS.reduce((p, c) => (c.distanceMiles > p.distanceMiles ? c : p));
    const s = SERVICE_TYPES[0];
    expect(computeFare(far, s).distance).toBeGreaterThan(computeFare(near, s).distance);
  });

  it("seed helpers find items by id/code", () => {
    expect(getMechanic("m_marcus")?.name).toBe("Marcus Reed");
    expect(getServiceType("oil_change")?.name).toBe("Oil Change");
    expect(getMechanic("missing")).toBeUndefined();
  });
});
