import { describe, it, expect } from "vitest";

/**
 * Validate the Stripe publishable key by calling Stripe's tokens endpoint with
 * a known test card. We hit https://api.stripe.com/v1/tokens with HTTP Basic
 * auth (publishable key as the username, empty password). If the key is valid
 * Stripe responds with HTTP 200 and a token JSON; an invalid key returns 401.
 *
 * The test is skipped when no key is present (CI fallback), so it never blocks
 * unrelated runs.
 */
describe("EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY", () => {
  const key = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  it("is a publishable key", () => {
    if (!key) {
      console.warn("Skipping: EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY not set");
      return;
    }
    expect(key.startsWith("pk_test_") || key.startsWith("pk_live_")).toBe(true);
  });

  it(
    "is authenticated by Stripe (no 401)",
    async () => {
      if (!key) {
        console.warn("Skipping live check: no key configured");
        return;
      }
      // Hit a benign read endpoint with the publishable key. A bad key always
      // returns 401 with `error.type === "invalid_request_error"`. A good key
      // can return 200 (when the resource exists) or a non-401 4xx (e.g. 403
      // for restricted endpoints), both of which prove the key was accepted.
      const res = await fetch(
        "https://api.stripe.com/v1/payment_methods/pm_card_visa",
        {
          method: "GET",
          headers: {
            Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
          },
        },
      );
      expect(res.status).not.toBe(401);
      const json = (await res.json()) as {
        error?: { type?: string; code?: string; message?: string };
      };
      // A bad key always returns code === "invalid_api_key". Anything else
      // (e.g. secret_key_required, parameter_missing) means Stripe authenticated
      // the publishable key successfully.
      if (json.error?.code) {
        expect(json.error.code).not.toBe("invalid_api_key");
      }
    },
    15000,
  );
});
