import { describe, it, expect } from "vitest";
import { computePayoutSplit, DISPUTE_WINDOW_MS, PAYOUT_DEPOSIT_FRACTION } from "../payout-split-core";

describe("computePayoutSplit", () => {
  it("pays half the service price as a deposit and the rest after the window", () => {
    // $15.43 customer total at 12% => $13.78 service price.
    const split = computePayoutSplit({ offeredPrice: 15.43, tip: 0, feeRate: 0.12 });
    expect(split.totalCents).toBe(1378);
    // The deposit rounds down, so any odd cent goes to the remainder.
    expect(split.depositCents).toBe(688);
    expect(split.remainderCents).toBe(690);
  });

  it("always sums back to exactly what the mechanic is owed", () => {
    for (const price of [10, 15, 15.43, 29.99, 33.33, 100, 187.5]) {
      for (const tip of [0, 1, 5.5]) {
        const split = computePayoutSplit({ offeredPrice: price, tip, feeRate: 0.15 });
        expect(split.depositCents + split.remainderCents).toBe(split.totalCents);
        expect(split.depositCents).toBeGreaterThanOrEqual(0);
        expect(split.remainderCents).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("keeps the tip out of the deposit", () => {
    const withoutTip = computePayoutSplit({ offeredPrice: 30, tip: 0, feeRate: 0.15 });
    const withTip = computePayoutSplit({ offeredPrice: 30, tip: 6, feeRate: 0.15 });
    expect(withTip.depositCents).toBe(withoutTip.depositCents);
    expect(withTip.remainderCents).toBe(withoutTip.remainderCents + 600);
  });

  it("matches the original single-transfer total at the stored fee rate", () => {
    const split = computePayoutSplit({ offeredPrice: 15, tip: 0, feeRate: 0.12 });
    expect(split.totalCents).toBe(1339);
  });

  it("returns zeros for an invalid or zero price", () => {
    expect(computePayoutSplit({ offeredPrice: 0, tip: 0, feeRate: 0.12 })).toEqual({
      totalCents: 0,
      depositCents: 0,
      remainderCents: 0,
    });
    expect(computePayoutSplit({ offeredPrice: NaN, tip: NaN, feeRate: 0.12 }).totalCents).toBe(0);
  });

  it("uses a 50% deposit and a 2 hour dispute window", () => {
    expect(PAYOUT_DEPOSIT_FRACTION).toBe(0.5);
    expect(DISPUTE_WINDOW_MS).toBe(2 * 60 * 60 * 1000);
  });
});
