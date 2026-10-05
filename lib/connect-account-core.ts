import type { RegionCode } from "./types";

function asRegion(value: unknown): RegionCode | null {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return normalized === "US" || normalized === "MX" ? normalized : null;
}

/**
 * Country for a new Stripe Express connected account. A Stripe account's
 * country can never be changed after creation, and Stripe only lets a
 * mechanic link a bank account from that country — so a Mexican mechanic
 * created as a US account can never finish onboarding.
 *
 * Prefers the region the app reports, then the mechanic's last presence
 * region (older app builds don't send one), and falls back to US.
 */
export function resolveConnectAccountCountry(requested: unknown, presenceRegion: unknown): RegionCode {
  return asRegion(requested) ?? asRegion(presenceRegion) ?? "US";
}

/**
 * Country-specific params for POST /v1/accounts. The platform is a US Stripe
 * account, so a Mexican mechanic is a cross-border payout recipient: Stripe
 * requires the "recipient" service agreement for that (transfers only, no
 * card payments — which matches capabilities[transfers] being the only
 * capability requested).
 */
export function connectAccountCountryParams(country: RegionCode): Record<string, string> {
  if (country === "MX") {
    return { country: "MX", "tos_acceptance[service_agreement]": "recipient" };
  }
  return { country: "US" };
}
