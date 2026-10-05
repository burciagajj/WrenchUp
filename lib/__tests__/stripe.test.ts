import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calculateStripeFee,
  formatCardBrand,
  maskCardNumber,
  amountToStripeAmount,
  shouldShowTestCardButton,
} from "../stripe";
import { shouldUseMockPayments } from "../mock-payments";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Stripe Helpers", () => {
  describe("calculateStripeFee", () => {
    it("should calculate 2.9% + $0.30 fee for USD", () => {
      const amount = 100; // $100
      const fee = calculateStripeFee(amount, "usd");
      // 100 * 0.029 + 0.30 = 2.90 + 0.30 = 3.20
      expect(fee).toBeCloseTo(3.2, 1);
    });

    it("should calculate 3.5% + 3 MXN fee for MXN", () => {
      const amount = 1000; // 1000 MXN
      const fee = calculateStripeFee(amount, "mxn");
      // 1000 * 0.035 + 3 = 35 + 3 = 38
      expect(fee).toBeCloseTo(38, 1);
    });

    it("should handle zero amount", () => {
      const fee = calculateStripeFee(0, "usd");
      expect(fee).toBe(0.3);
    });
  });

  describe("formatCardBrand", () => {
    it("should format Visa", () => {
      expect(formatCardBrand("visa")).toBe("Visa");
    });

    it("should format Mastercard", () => {
      expect(formatCardBrand("mastercard")).toBe("Mastercard");
    });

    it("should format Amex", () => {
      expect(formatCardBrand("amex")).toBe("American Express");
    });

    it("should format Discover", () => {
      expect(formatCardBrand("discover")).toBe("Discover");
    });

    it("should handle unknown brands", () => {
      expect(formatCardBrand("unknown")).toBe("unknown");
    });
  });

  describe("maskCardNumber", () => {
    it("should mask card number keeping last 4 digits", () => {
      const masked = maskCardNumber("4242");
      expect(masked).toBe("•••• •••• •••• 4242");
    });

    it("should handle short card numbers", () => {
      const masked = maskCardNumber("42");
      expect(masked).toBe("•••• •••• •••• 42");
    });
  });

  describe("amountToStripeAmount", () => {
    it("should convert USD to cents", () => {
      const cents = amountToStripeAmount(99.99, "usd");
      expect(cents).toBe(9999);
    });

    it("should convert MXN to cents", () => {
      const cents = amountToStripeAmount(500, "mxn");
      expect(cents).toBe(50000);
    });

    it("should handle zero amount", () => {
      const cents = amountToStripeAmount(0, "usd");
      expect(cents).toBe(0);
    });

    it("should round to nearest cent", () => {
      const cents = amountToStripeAmount(99.999, "usd");
      expect(cents).toBe(10000);
    });
  });

  describe("shouldShowTestCardButton", () => {
    it("should show the test card button in dev when a test publishable key is configured", () => {
      vi.stubEnv("EXPO_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY", "pk_test_1234567890");
      vi.stubEnv("EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");
      vi.stubEnv("EXPO_PUBLIC_ENABLE_MOCK_PAYMENTS", "false");

      expect(shouldShowTestCardButton({ isDev: true })).toBe(true);
    });

    it("should hide the test card button when no test key is configured", () => {
      vi.stubEnv("EXPO_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY", "");
      vi.stubEnv("EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_live_1234567890");
      vi.stubEnv("EXPO_PUBLIC_ENABLE_MOCK_PAYMENTS", "false");

      expect(shouldShowTestCardButton({ isDev: true })).toBe(false);
    });

    it("should show the test card button when mock payments are enabled in development", () => {
      expect(
        shouldShowTestCardButton({
          isDev: true,
          appOwnership: "expo",
          platform: "ios",
          mockPaymentsFlag: "false",
        }),
      ).toBe(true);
    });

    it("should hide the test card button in a production build even if a test key leaked in", () => {
      vi.stubEnv("EXPO_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY", "pk_test_1234567890");
      vi.stubEnv("EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");
      vi.stubEnv("EXPO_PUBLIC_ENABLE_MOCK_PAYMENTS", "false");

      // A misconfigured production build could still end up with a pk_test_
      // key bundled — isDev: false must still hide the button regardless.
      expect(shouldShowTestCardButton({ isDev: false })).toBe(false);
    });
  });

  describe("shouldUseMockPayments", () => {
    it("should enable mock payments when the explicit dev flag is set", () => {
      expect(
        shouldUseMockPayments({
          isDev: true,
          appOwnership: "standalone",
          platform: "ios",
          mockPaymentsFlag: "true",
        }),
      ).toBe(true);
    });

    it("should auto-enable mock payments in Expo Go during development", () => {
      expect(
        shouldUseMockPayments({
          isDev: true,
          appOwnership: "expo",
          platform: "ios",
          mockPaymentsFlag: "false",
        }),
      ).toBe(true);
    });

    it("should auto-enable mock payments on web during development", () => {
      expect(
        shouldUseMockPayments({
          isDev: true,
          appOwnership: "standalone",
          platform: "web",
          mockPaymentsFlag: "false",
        }),
      ).toBe(true);
    });

    it("should not enable mock payments in production", () => {
      expect(
        shouldUseMockPayments({
          isDev: false,
          appOwnership: "expo",
          platform: "web",
          mockPaymentsFlag: "true",
        }),
      ).toBe(false);
    });
  });
});
