import type { LatLng, Mechanic } from "./types";

const EARTH_RADIUS_M = 6_371_000;
const METERS_PER_DEG_LAT = 111_320;

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Haversine distance in meters between two points. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function metersToMiles(m: number): number {
  return m / 1609.344;
}

/** Offset a coordinate by an east/north meter delta. */
export function offsetMeters(origin: LatLng, eastMeters: number, northMeters: number): LatLng {
  const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos(toRad(origin.latitude));
  return {
    latitude: origin.latitude + northMeters / METERS_PER_DEG_LAT,
    longitude: origin.longitude + eastMeters / Math.max(1, metersPerDegLon),
  };
}

/** Linearly interpolate between two coordinates. t = 0..1. */
export function interpolate(a: LatLng, b: LatLng, t: number): LatLng {
  const clamped = Math.min(1, Math.max(0, t));
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * clamped,
    longitude: a.longitude + (b.longitude - a.longitude) * clamped,
  };
}

/** Compute a mechanic's live coordinate based on the user's location and the mechanic's seeded offset. */
export function mechanicCoords(mechanic: Mechanic, userCoords: LatLng): LatLng {
  return offsetMeters(userCoords, mechanic.offsetMeters.east, mechanic.offsetMeters.north);
}

/**
 * A region (for react-native-maps) that comfortably contains both points with padding.
 */
export function regionFor(points: LatLng[], paddingFactor = 1.7) {
  if (points.length === 0) {
    return { latitude: 0, longitude: 0, latitudeDelta: 0.05, longitudeDelta: 0.05 };
  }
  if (points.length === 1) {
    return {
      latitude: points[0].latitude,
      longitude: points[0].longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
  }
  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLon = points[0].longitude;
  let maxLon = points[0].longitude;
  for (const p of points) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLon = Math.min(minLon, p.longitude);
    maxLon = Math.max(maxLon, p.longitude);
  }
  const latDelta = Math.max(0.005, (maxLat - minLat) * paddingFactor);
  const lonDelta = Math.max(0.005, (maxLon - minLon) * paddingFactor);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lonDelta,
  };
}
