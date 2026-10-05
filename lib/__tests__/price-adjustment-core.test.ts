import { describe, expect, it } from "vitest";
import {
  clampPriceToAdjustmentBounds,
  getPriceAdjustmentBounds,
  isPriceWithinAdjustmentBounds,
} from "@/lib/price-adjustment-core";

describe("getPriceAdjustmentBounds", () => {
  it("computes a 50%-150% band around the estimate", () => {
    expect(getPriceAdjustmentBounds(100)).toEqual({ min: 50, max: 150 });
  });

  it("returns a zero band for an invalid/zero estimate", () => {
    expect(getPriceAdjustmentBounds(0)).toEqual({ min: 0, max: 0 });
    expect(getPriceAdjustmentBounds(NaN)).toEqual({ min: 0, max: 0 });
  });
});

describe("isPriceWithinAdjustmentBounds", () => {
  it("allows prices inside the band", () => {
    expect(isPriceWithinAdjustmentBounds(60, 100)).toBe(true);
    expect(isPriceWithinAdjustmentBounds(150, 100)).toBe(true);
    expect(isPriceWithinAdjustmentBounds(50, 100)).toBe(true);
  });

  it("blocks prices far below or above the estimate", () => {
    expect(isPriceWithinAdjustmentBounds(0.5, 89)).toBe(false);
    expect(isPriceWithinAdjustmentBounds(5000, 60)).toBe(false);
  });

  it("blocks non-positive or non-finite prices", () => {
    expect(isPriceWithinAdjustmentBounds(0, 100)).toBe(false);
    expect(isPriceWithinAdjustmentBounds(-10, 100)).toBe(false);
    expect(isPriceWithinAdjustmentBounds(NaN, 100)).toBe(false);
  });

  it("doesn't block anything when the estimate itself is invalid", () => {
    expect(isPriceWithinAdjustmentBounds(9999, 0)).toBe(true);
  });
});

describe("clampPriceToAdjustmentBounds", () => {
  it("clamps down to the max", () => {
    expect(clampPriceToAdjustmentBounds(5000, 60)).toBe(90);
  });

  it("clamps up to the min", () => {
    expect(clampPriceToAdjustmentBounds(0.5, 89)).toBe(44.5);
  });

  it("leaves in-band prices untouched", () => {
    expect(clampPriceToAdjustmentBounds(75, 100)).toBe(75);
  });
});
