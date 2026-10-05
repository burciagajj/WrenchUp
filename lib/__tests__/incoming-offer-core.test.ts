import { describe, expect, it } from "vitest";
import { shouldAutoDeclineOnExpiry } from "@/lib/incoming-offer-core";

describe("shouldAutoDeclineOnExpiry", () => {
  it("auto-declines an untouched request when the countdown expires", () => {
    expect(shouldAutoDeclineOnExpiry({ alreadyResolved: false, counterOfferSent: false })).toBe(true);
  });

  it("does not auto-decline once a counteroffer has been sent", () => {
    expect(shouldAutoDeclineOnExpiry({ alreadyResolved: false, counterOfferSent: true })).toBe(false);
  });

  it("does not auto-decline once already resolved (accepted/declined)", () => {
    expect(shouldAutoDeclineOnExpiry({ alreadyResolved: true, counterOfferSent: false })).toBe(false);
  });

  it("does not auto-decline when both are true", () => {
    expect(shouldAutoDeclineOnExpiry({ alreadyResolved: true, counterOfferSent: true })).toBe(false);
  });
});
