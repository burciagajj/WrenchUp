import { describe, expect, it } from "vitest";
import { validatePaymentIntentSnapshot } from "@/lib/payment-verification-core";

const expected = {
  paymentIntentId: "pi_test",
  amount: 8900,
  currency: "usd",
  userId: "user-1",
};

describe("validatePaymentIntentSnapshot", () => {
  it("allows authorized PaymentIntents that are ready to capture", () => {
    expect(
      validatePaymentIntentSnapshot(
        { id: "pi_test", amount: 8900, currency: "usd", status: "requires_capture", userId: "user-1" },
        expected,
      ),
    ).toEqual({ ok: true });
  });

  it("blocks canceled, failed, or incomplete payments before dispatch", () => {
    expect(
      validatePaymentIntentSnapshot(
        { id: "pi_test", amount: 8900, currency: "usd", status: "canceled", userId: "user-1" },
        expected,
      ).ok,
    ).toBe(false);
  });

  it("blocks amount, currency, and user mismatches", () => {
    expect(
      validatePaymentIntentSnapshot(
        { id: "pi_test", amount: 5000, currency: "usd", status: "requires_capture", userId: "user-1" },
        expected,
      ).ok,
    ).toBe(false);
    expect(
      validatePaymentIntentSnapshot(
        { id: "pi_test", amount: 8900, currency: "mxn", status: "requires_capture", userId: "user-1" },
        expected,
      ).ok,
    ).toBe(false);
    expect(
      validatePaymentIntentSnapshot(
        { id: "pi_test", amount: 8900, currency: "usd", status: "requires_capture", userId: "user-2" },
        expected,
      ).ok,
    ).toBe(false);
  });
});
