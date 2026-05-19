import { Platform } from "react-native";
import * as Location from "expo-location";
import type { LatLng } from "./types";

export type LocationResult = {
  status: "granted" | "denied" | "error";
  coords?: LatLng;
  address?: string;
  /** ISO 3166-1 alpha-2 country code, e.g. "US", "MX". */
  countryCode?: string;
};

/**
 * Request foreground permission and fetch a current location + reverse-geocoded address.
 * On web, falls back to navigator.geolocation; if anything fails, returns status "denied"/"error".
 */
export async function fetchLocationAndAddress(): Promise<LocationResult> {
  // Web fallback uses browser geolocation; reverse-geocoding via expo-location is not supported on web.
  if (Platform.OS === "web") {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return { status: "denied" };
    }
    try {
      const coords = await new Promise<LatLng>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
          (err) => reject(err),
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
        );
      });
      // No reverse geocoding on web in this template; infer country roughly by longitude/latitude
      // bounding box for the contiguous US vs Mexico for demo purposes.
      const countryCode = inferCountryFromCoords(coords);
      return { status: "granted", coords, countryCode };
    } catch {
      return { status: "denied" };
    }
  }

  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== "granted") {
      return { status: "denied" };
    }
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const coords: LatLng = {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    };
    let address: string | undefined;
    let countryCode: string | undefined;
    try {
      const results = await Location.reverseGeocodeAsync(coords);
      const r = results[0];
      if (r) {
        const parts = [
          [r.streetNumber, r.street].filter(Boolean).join(" "),
          r.city ?? r.subregion,
          r.region,
        ].filter(Boolean);
        address = parts.join(", ");
        // r.isoCountryCode is the ISO 3166-1 alpha-2 code on Expo SDK 54.
        countryCode = (r as { isoCountryCode?: string | null }).isoCountryCode ?? undefined;
      }
    } catch {
      // ignore reverse-geocode failure
    }
    if (!countryCode) countryCode = inferCountryFromCoords(coords);
    return { status: "granted", coords, address, countryCode };
  } catch {
    return { status: "error" };
  }
}

/**
 * Demo-quality country inference for cases where reverse-geocoding is unavailable
 * (e.g. on web). Uses simple latitude/longitude bounding boxes for MX vs US.
 */
export function inferCountryFromCoords(coords: LatLng): "MX" | "US" | undefined {
  const { latitude: lat, longitude: lon } = coords;
  // Mexico approx bounding box.
  if (lat >= 14.5 && lat <= 32.7 && lon >= -118.5 && lon <= -86.7) return "MX";
  // Contiguous US approx bounding box.
  if (lat >= 24.5 && lat <= 49.5 && lon >= -125 && lon <= -66.9) return "US";
  return undefined;
}
