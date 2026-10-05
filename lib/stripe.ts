import type { RegionCode } from "./types";
import type { MockPaymentsRuntime } from "./mock-payments";
import { shouldUseMockPayments } from "./mock-payments";

/**
 * Client-safe Stripe helpers and types for the WrenchUp app.
 *
 * IMPORTANT: This file MUST NOT import the Node-only `stripe` package, since it
 * pulls in `crypto`, `fs`, `http`, etc. and breaks Metro / React Native bundling.
 * All real Stripe API calls (PaymentIntents, customers, refunds) live on the
 * backend (`server/`) and are reached through tRPC. The client only handles UI,
 * formatting, and the React Native PaymentSheet via `@stripe/stripe-react-native`.
 */

/** Stripe currency code we currently support. */
export type StripeCurrency = "usd" | "mxn";

/** Local representation of a saved card. Mirrors what we persist in AsyncStorage. */
export type StripePaymentMethod = {
  id: string;
  type: "card";
  card: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
  billingDetails?: {
    name?: string;
    email?: string;
  };
};

/** PaymentIntent shape returned by our backend (subset of Stripe.PaymentIntent). */
export type StripePaymentIntent = {
  id: string;
  clientSecret: string;
  amount: number;
  currency: StripeCurrency;
  status:
    | "requires_payment_method"
    | "requires_confirmation"
    | "requires_action"
    | "processing"
    | "requires_capture"
    | "canceled"
    | "succeeded";
  paymentMethod?: string;
};

export type StripeCustomer = {
  id: string;
  email: string;
  name?: string;
  defaultPaymentMethod?: string;
};

/**
 * Public publishable key, exposed to the client through EXPO_PUBLIC_*.
 *
 * Dev builds (including Expo Go) only ever resolve to a pk_test_ key,
 * regardless of what's configured — a live key can never accidentally be
 * exercised while developing, even if one leaks into a dev .env. Real
 * production builds (isDev === false) may resolve to either a live key
 * (EXPO_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY) or a test key (useful for a
 * staging/TestFlight build still pointed at Stripe test mode). Takes an
 * optional runtime object (same shape as shouldUseMockPayments /
 * shouldShowTestCardButton) so callers — and tests — can pin the environment
 * explicitly instead of relying on the ambient __DEV__ global, which isn't
 * defined at all outside a real RN/Expo runtime (e.g. under vitest).
 */
export function getPublishableKey(runtime: MockPaymentsRuntime = {}): string {
  const globalIsDev = typeof __DEV__ !== "undefined" ? __DEV__ : false;
  const isDev = runtime.isDev ?? globalIsDev;

  const testKey = process.env.EXPO_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY?.trim() ?? "";
  const liveKey = process.env.EXPO_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY?.trim() ?? "";
  const legacyKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";

  if (isDev) {
    if (testKey.startsWith("pk_test_")) return testKey;
    if (legacyKey.startsWith("pk_test_")) return legacyKey;
    return "";
  }

  if (liveKey.startsWith("pk_live_")) return liveKey;
  if (testKey.startsWith("pk_test_")) return testKey;
  if (legacyKey.startsWith("pk_live_") || legacyKey.startsWith("pk_test_")) return legacyKey;
  return "";
}

/**
 * Returns true when the app should expose the test-card helper button.
 *
 * Gated on build environment, not just the key prefix. getPublishableKey()
 * can now resolve to a live key in a real production build, but this stays
 * hard-gated on isDev regardless of what key is configured, so a misconfigured
 * production build can never expose the "Use Test Card" shortcut to real
 * customers even if a test key or live key slips into the wrong build.
 */
export function shouldShowTestCardButton(runtime: MockPaymentsRuntime = {}): boolean {
  const globalIsDev = typeof __DEV__ !== "undefined" ? __DEV__ : false;
  const isDev = runtime.isDev ?? globalIsDev;
  return (isDev && Boolean(getPublishableKey(runtime))) || shouldUseMockPayments(runtime);
}

/** Resolve the right Stripe currency for a region. */
export function getCurrencyForRegion(region: RegionCode): StripeCurrency {
  return region === "MX" ? "mxn" : "usd";
}

/** Stripe charges in the smallest currency unit. USD and MXN both use cents/centavos. */
export function amountToStripeAmount(amount: number, _currency: StripeCurrency): number {
  return Math.round(amount * 100);
}

/** Inverse of amountToStripeAmount for display. */
export function stripeAmountToDisplay(amount: number, _currency: StripeCurrency): number {
  return amount / 100;
}

/** Format any error from Stripe / network into a user-facing string. */
export function formatStripeError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string" && msg.length > 0) return msg;
  }
  if (error instanceof Error && error.message) return error.message;
  return "An unexpected error occurred. Please try again.";
}

/** Returns true if a card is past its expiration based on current date. */
export function isCardExpired(expMonth: number, expYear: number): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (expYear < currentYear) return true;
  if (expYear === currentYear && expMonth < currentMonth) return true;
  return false;
}

/** Show a card number with only the last 4 digits visible. */
export function maskCardNumber(last4: string): string {
  return `•••• •••• •••• ${last4}`;
}

/** Pretty card brand label for the UI. */
export function formatCardBrand(brand: string): string {
  const brandMap: Record<string, string> = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "American Express",
    discover: "Discover",
    diners: "Diners Club",
    jcb: "JCB",
    unionpay: "UnionPay",
  };
  return brandMap[brand.toLowerCase()] || brand;
}

/**
 * Approximate processing fee for a transaction so we can preview it in the UI.
 * Stripe's published rates: 2.9% + $0.30 (US), 3.6% + 3 MXN (Mexico).
 */
export function calculateStripeFee(amount: number, currency: StripeCurrency): number {
  if (currency === "mxn") return amount * 0.035 + 3;
  return amount * 0.029 + 0.3;
}

/** Lightweight email validator used for billing details capture. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
