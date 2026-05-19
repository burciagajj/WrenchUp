/**
 * Mock Payment Intent helpers for end-to-end testing of the PaymentSheet flow.
 * These are hardcoded test values that simulate Stripe's API responses.
 *
 * Once the backend `payments.createPaymentIntent` tRPC procedure is wired,
 * replace these with real API calls.
 */

import type { StripePaymentIntent, StripeCurrency } from "./stripe";

/**
 * Mock Stripe test mode publishable key (pk_test_*) and corresponding
 * test client secrets. These are valid Stripe test fixtures.
 */
export const MOCK_TEST_KEYS = {
  // Test card that always succeeds
  success: {
    clientSecret: "pi_1234567890_secret_abcdefghij",
    paymentIntentId: "pi_1234567890",
  },
  // Test card that requires 3D Secure (simulates challenge)
  requires3ds: {
    clientSecret: "pi_3ds_secret_requires_action",
    paymentIntentId: "pi_3ds",
  },
  // Test card that always declines
  declined: {
    clientSecret: "pi_declined_secret_card_declined",
    paymentIntentId: "pi_declined",
  },
};

/**
 * Create a mock PaymentIntent for testing. In production, this is replaced
 * with a real backend call to `stripe.paymentIntents.create()`.
 */
export function createMockPaymentIntent(
  amount: number,
  currency: StripeCurrency,
): StripePaymentIntent {
  // For testing, always use the success key. In a real app, you'd vary
  // based on test card numbers or user selection.
  const mock = MOCK_TEST_KEYS.success;
  return {
    id: mock.paymentIntentId,
    clientSecret: mock.clientSecret,
    amount,
    currency,
    status: "requires_payment_method",
    paymentMethod: undefined,
  };
}

/**
 * Simulate the PaymentSheet result based on the clientSecret.
 * In production, the real PaymentSheet returns these based on user interaction.
 */
export function simulatePaymentSheetResult(
  clientSecret: string,
): { status: "succeeded" | "requires_action" | "processing" } {
  // Simulate different outcomes based on the secret (for testing different flows).
  if (clientSecret.includes("3ds")) {
    return { status: "requires_action" };
  }
  if (clientSecret.includes("declined")) {
    return { status: "processing" }; // Will fail after a delay
  }
  // Default: success
  return { status: "succeeded" };
}
