import type { LatLng } from "./types";

export const CURRENT_LOCATION_LABEL = "Current location";
export const LEGACY_SAN_FRANCISCO_LOCATION = "1245 Mission St, San Francisco, CA";

export function isLegacyFallbackLocation(value?: string | null): boolean {
  if (!value) return false;
  return value.trim().toLowerCase() === LEGACY_SAN_FRANCISCO_LOCATION.toLowerCase();
}

export function formatCoordinateLocation(coords: LatLng): string {
  return CURRENT_LOCATION_LABEL;
}

export function resolveServiceLocationLabel(
  currentLabel: string | undefined,
  coords?: LatLng | null,
  address?: string | null
): string {
  const cleanAddress = address?.trim();
  if (cleanAddress) return cleanAddress;
  if (currentLabel && !isLegacyFallbackLocation(currentLabel)) return currentLabel;
  if (coords) return formatCoordinateLocation(coords);
  return CURRENT_LOCATION_LABEL;
}
