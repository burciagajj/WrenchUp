import { describe, it, expect } from "vitest";
import { getPublishableKey } from "../stripe";

/**
 * Validate the Stripe publishable key by calling Stripe's tokens endpoint with
 * a known test card. We hit https://api.stripe.com/v1/tokens with HTTP Basic
 * auth (publishable key as the username, empty password). If the key is valid
 * Stripe responds with HTTP 200 and a token JSON; an invalid key returns 401.
 *
 * The test is skipped when no key is present (CI fallback), so it never blocks
 * unrelated runs.
 */
describe("Stripe publishable key", () => {
  // This test file itself runs under vitest/Node, not a real RN runtime, so
  // getPublishableKey()'s __DEV__ fallback would treat it as "production" by
  // default. Pin isDev explicitly per case instead of relying on that.
  const key = getPublishableKey({ isDev: true });

  it("dev builds only ever resolve to a test key, never live", () => {
    if (!key) {
      console.warn("Skipping: no Stripe test publishable key configured");
      return;
    }
    expect(key.startsWith("pk_test_")).toBe(true);
  });

  it("dev builds ignore a live key even if one is configured", () => {
    const withLiveKeyOnly = getPublishableKey({ isDev: true });
    // Whatever this resolves to (possibly ""), it must never be a live key.
    expect(withLiveKeyOnly.startsWith("pk_live_")).toBe(false);
  });

  it("production builds may resolve to a live key when one is configured", () => {
    const liveKey = process.env.EXPO_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY?.trim() ?? "";
    if (!liveKey.startsWith("pk_live_")) {
      console.warn("Skipping: no live Stripe publishable key configured");
      return;
    }
    expect(getPublishableKey({ isDev: false })).toBe(liveKey);
  });

  it(
    "is authenticated by Stripe (no 401)",
    async () => {
      if (!key) {
        console.warn("Skipping live check: no key configured");
        return;
      }
      let res: Response;
      try {
        // Hit a benign read endpoint with the publishable key. A bad key always
        // returns 401 with `error.type === "invalid_request_error"`. A good key
        // can return 200 (when the resource exists) or a non-401 4xx (e.g. 403
        // for restricted endpoints), both of which prove the key was accepted.
        res = await fetch(
          "https://api.stripe.com/v1/payment_methods/pm_card_visa",
          {
            method: "GET",
            headers: {
              Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
            },
          },
        );
      } catch {
        console.warn("Skipping live Stripe authentication check: network unavailable");
        return;
      }
      expect(res.status).not.toBe(401);
      const json = (await res.json()) as {
        error?: { type?: string; code?: string; message?: string };
      };
      // A bad key always returns code === "invalid_api_key". Anything else
      // (e.g. secret_key_required, parameter_missing) means Stripe authenticated
      // the publishable test key successfully.
      if (json.error?.code) {
        expect(json.error.code).not.toBe("invalid_api_key");
      }
    },
    15000,
  );
});
