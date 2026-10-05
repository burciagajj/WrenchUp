import { describe, it, expect } from "vitest";
import { cancellationFeeMechanicShare, computeCancellationFee, CANCELLATION_FEE_USD } from "../cancellation-fee-core";
import { offsetMeters } from "../geo";

const customer = { latitude: 31.7619, longitude: -106.485 };
const MILE = 1609.344;
// Mechanic who started exactly `miles` from the customer.
const startedAway = (miles: number) => offsetMeters(customer, 0, miles * MILE);

const base = {
  cancelledByRole: "customer" as const,
  hasAssignedMechanic: true,
  customer,
  region: "US" as const,
};

describe("computeCancellationFee", () => {
  it("charges when the mechanic drove 1.2 of a 2 mile trip", () => {
    const result = computeCancellationFee({ ...base, mechanicStart: startedAway(2), drivenMiles: 1.2 });
    expect(result.applies).toBe(true);
    if (result.applies) expect(result.amount).toBe(CANCELLATION_FEE_USD);
  });

  it("does not charge when the mechanic only drove 0.2 of a 2 mile trip", () => {
    const result = computeCancellationFee({ ...base, mechanicStart: startedAway(2), drivenMiles: 0.2 });
    expect(result.applies).toBe(false);
  });

  it("needs at least half a mile even when that is most of a short trip", () => {
    const result = computeCancellationFee({ ...base, mechanicStart: startedAway(0.6), drivenMiles: 0.45 });
    expect(result.applies).toBe(false);
  });

  it("needs at least 25% of the trip for a long-distance mechanic", () => {
    expect(computeCancellationFee({ ...base, mechanicStart: startedAway(10), drivenMiles: 2 }).applies).toBe(false);
    expect(computeCancellationFee({ ...base, mechanicStart: startedAway(10), drivenMiles: 2.6 }).applies).toBe(true);
  });

  it("never charges for mechanic or system cancellations", () => {
    for (const cancelledByRole of ["mechanic", null, undefined] as const) {
      const result = computeCancellationFee({
        ...base,
        cancelledByRole,
        mechanicStart: startedAway(2),
        drivenMiles: 1.5,
      });
      expect(result.applies).toBe(false);
    }
  });

  it("never charges on missing data", () => {
    expect(computeCancellationFee({ ...base, mechanicStart: null, drivenMiles: 1.5 }).applies).toBe(false);
    expect(computeCancellationFee({ ...base, customer: null, mechanicStart: startedAway(2), drivenMiles: 1.5 }).applies).toBe(false);
    expect(computeCancellationFee({ ...base, mechanicStart: startedAway(2), drivenMiles: null }).applies).toBe(false);
    expect(computeCancellationFee({ ...base, hasAssignedMechanic: false, mechanicStart: startedAway(2), drivenMiles: 1.5 }).applies).toBe(false);
  });

  it("converts the fee into pesos for Mexico", () => {
    const result = computeCancellationFee({ ...base, region: "MX", mechanicStart: startedAway(2), drivenMiles: 1.2 });
    expect(result.applies).toBe(true);
    if (result.applies) expect(result.amount).toBe(52.5);
  });

  it("nets Stripe's processing cost out of the mechanic's share", () => {
    expect(cancellationFeeMechanicShare(5, "usd")).toBe(4.55);
    expect(cancellationFeeMechanicShare(52.5, "mxn")).toBe(47.61);
    expect(cancellationFeeMechanicShare(5, null)).toBe(4.55);
  });

  it("never returns a negative or invalid mechanic share", () => {
    expect(cancellationFeeMechanicShare(0.2, "usd")).toBe(0);
    expect(cancellationFeeMechanicShare(NaN, "usd")).toBe(0);
    expect(cancellationFeeMechanicShare(-5, "usd")).toBe(0);
  });
});
