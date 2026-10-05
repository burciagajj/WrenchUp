import { describe, it, expect } from "vitest";
import { computeFare, QUICK_SERVICE_BOOKING_FEE_RATE } from "../fare";
import { MECHANICS, SERVICE_TYPES, getServiceType, getMechanic } from "../seed";

describe("computeFare", () => {
  it("returns positive service, bookingFee, and total with no distance component", () => {
    const m = MECHANICS[0];
    const s = SERVICE_TYPES[0];
    const fare = computeFare(m, s);
    expect(fare.service).toBeGreaterThan(0);
    expect(fare.bookingFee).toBeGreaterThan(0);
    expect(fare.total).toBeCloseTo(+(fare.service + fare.bookingFee).toFixed(2), 2);
    expect((fare as any).distance).toBeUndefined();
    expect((fare as any).base).toBeUndefined();
  });

  it("booking fee is exactly QUICK_SERVICE_BOOKING_FEE_RATE of the service price, nothing else", () => {
    const m = MECHANICS[0];
    const s = SERVICE_TYPES[0];
    const fare = computeFare(m, s);
    expect(fare.bookingFee).toBeCloseTo(+(fare.service * QUICK_SERVICE_BOOKING_FEE_RATE).toFixed(2), 2);
  });

  it("higher hourly rate yields service premium", () => {
    const expensive = MECHANICS.find((m) => m.hourlyRate >= 95)!;
    const cheap = MECHANICS.find((m) => m.hourlyRate < 85)!;
    const s = getServiceType("oil_change")!;
    const a = computeFare(expensive, s);
    const b = computeFare(cheap, s);
    expect(a.service).toBeGreaterThan(b.service);
  });

  it("distance does not affect price (per-mile pricing was removed)", () => {
    const near = MECHANICS.reduce((p, c) => (c.distanceMiles < p.distanceMiles ? c : p));
    const far = MECHANICS.reduce((p, c) => (c.distanceMiles > p.distanceMiles ? c : p));
    const s = SERVICE_TYPES[0];
    if (near.hourlyRate === far.hourlyRate) {
      expect(computeFare(far, s).total).toBe(computeFare(near, s).total);
    }
  });

  it("seed helpers find items by id/code", () => {
    expect(getMechanic("m_marcus")?.name).toBe("Marcus Reed");
    expect(getServiceType("oil_change")?.name).toBe("Oil Change");
    expect(getMechanic("missing")).toBeUndefined();
  });
});
