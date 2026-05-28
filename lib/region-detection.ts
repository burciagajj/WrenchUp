/**
 * Region detection for locale (es-MX) and MXN pricing.
 * 1) Device locale hint — instant, no permission
 * 2) GPS + reverse geocode — refines when permission granted
 */

import { Platform } from "react-native";
import type { RegionCode } from "./types";
import { fetchLocationAndAddress, type LocationResult } from "./location";

/** Module-level guard so sign-in + root bootstrap share one GPS request. */
let locationDetectionInFlight = false;

export function isLocationDetectionInFlight(): boolean {
  return locationDetectionInFlight;
}

/**
 * Infer MX vs US from device language/region settings (no GPS).
 * Works on iOS/Android via Intl; on web via navigator.languages.
 */
export function getDeviceRegionHint(): RegionCode | null {
  try {
    const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale ?? "";
    const normalized = intlLocale.replace("_", "-");
    const upper = normalized.toUpperCase();
    if (upper.includes("MX") || upper.endsWith("-MX")) return "MX";
    if (upper.includes("US") || upper.endsWith("-US")) return "US";

    // Parse locale region safely when available, e.g. "es-MX"
    const parts = normalized.split("-");
    const regionPart = parts[parts.length - 1]?.toUpperCase();
    if (regionPart === "MX") return "MX";
    if (regionPart === "US") return "US";

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    if (
      /Mexico/i.test(timeZone) ||
      /Ciudad_Juarez/i.test(timeZone) ||
      /Monterrey/i.test(timeZone) ||
      /Chihuahua/i.test(timeZone) ||
      /Merida/i.test(timeZone) ||
      /Matamoros/i.test(timeZone) ||
      /Tijuana/i.test(timeZone) ||
      /Mazatlan/i.test(timeZone) ||
      /Ojinaga/i.test(timeZone) ||
      /Hermosillo/i.test(timeZone)
    ) {
      return "MX";
    }
  } catch {
    // ignore
  }

  if (Platform.OS === "web" && typeof navigator !== "undefined") {
    const candidates = [navigator.language, ...(navigator.languages ?? [])];
    for (const tag of candidates) {
      const t = tag.toLowerCase();
      if (t.includes("mx") || t === "es-mx") return "MX";
      if (t.includes("us") || t === "en-us") return "US";
    }
  }

  return null;
}

export type RegionFromLocation = {
  countryCode: RegionCode;
  coords?: LocationResult["coords"];
  address?: string;
  status: LocationResult["status"];
};

/**
 * Request foreground location and resolve country (MX / US).
 * Call once per app session; use isLocationDetectionInFlight() to avoid duplicates.
 */
export async function detectRegionFromLocation(): Promise<RegionFromLocation | null> {
  if (locationDetectionInFlight) return null;
  locationDetectionInFlight = true;

  try {
    const res = await fetchLocationAndAddress();
    if (res.status === "granted" && res.coords) {
      const code =
        res.countryCode === "MX" || res.countryCode === "US" ? res.countryCode : undefined;
      if (code) {
        return {
          countryCode: code,
          coords: res.coords,
          address: res.address,
          status: "granted",
        };
      }
    }
    return res.status === "denied"
      ? { countryCode: getDeviceRegionHint() ?? "US", status: "denied" }
      : null;
  } finally {
    locationDetectionInFlight = false;
  }
}
