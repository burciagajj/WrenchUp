import { Platform } from "react-native";
import * as Location from "expo-location";
import type { LatLng } from "./types";
import { isValidCoords } from "./service-location-core";

const FRESH_FIX_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/**
 * A GPS fix from right now (or the OS's last fix if it's under a minute old).
 * Null if permission is missing or no fix arrives in time — never the app's
 * persisted userCoords, which can be from a previous day.
 */
export async function getFreshDeviceCoords(): Promise<LatLng | null> {
  if (Platform.OS === "web") {
    if (typeof navigator === "undefined" || !navigator.geolocation) return null;
    return withTimeout(
      new Promise<LatLng | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: FRESH_FIX_TIMEOUT_MS, maximumAge: 60_000 },
        );
      }),
      FRESH_FIX_TIMEOUT_MS,
    );
  }
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") {
      const asked = await Location.requestForegroundPermissionsAsync();
      if (asked.status !== "granted") return null;
    }
    const recent = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 200 }).catch(() => null);
    if (recent && isValidCoords(recent.coords)) {
      return { latitude: recent.coords.latitude, longitude: recent.coords.longitude };
    }
    const current = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      FRESH_FIX_TIMEOUT_MS,
    );
    return current && isValidCoords(current.coords)
      ? { latitude: current.coords.latitude, longitude: current.coords.longitude }
      : null;
  } catch {
    return null;
  }
}

/** Coordinates for a typed address, or null if it can't be found. */
export async function geocodeServiceAddress(address: string): Promise<LatLng | null> {
  const query = address.trim();
  if (!query || Platform.OS === "web") return null;
  try {
    const results = await Location.geocodeAsync(query);
    const first = results.find((r) => isValidCoords(r));
    return first ? { latitude: first.latitude, longitude: first.longitude } : null;
  } catch {
    return null;
  }
}
