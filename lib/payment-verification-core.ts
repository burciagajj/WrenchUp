export type StripeIntentSnapshot = {
  id: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  userId: string | null;
};

export type PaymentVerificationExpected = {
  paymentIntentId: string;
  amount: number;
  currency: string;
  userId: string;
};

export function validatePaymentIntentSnapshot(
  snapshot: StripeIntentSnapshot,
  expected: PaymentVerificationExpected,
): { ok: true } | { ok: false; reason: string } {
  if (snapshot.id !== expected.paymentIntentId) {
    return { ok: false, reason: "Payment intent id mismatch" };
  }
  if (snapshot.userId !== expected.userId) {
    return { ok: false, reason: "Payment intent user mismatch" };
  }
  if (snapshot.amount !== expected.amount) {
    return { ok: false, reason: "Payment amount mismatch" };
  }
  if ((snapshot.currency || "").toLowerCase() !== expected.currency.toLowerCase()) {
    return { ok: false, reason: "Payment currency mismatch" };
  }
  if (snapshot.status !== "requires_capture" && snapshot.status !== "succeeded") {
    return { ok: false, reason: `Payment status ${snapshot.status || "unknown"} cannot be dispatched` };
  }
  return { ok: true };
}
