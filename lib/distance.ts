import type { RegionCode } from "./types";

const MILES_TO_KM = 1.60934;

export function milesToKm(miles: number): number {
  return miles * MILES_TO_KM;
}

export function formatDistanceByRegion(distanceMiles: number, region: RegionCode): string {
  if (region === "MX") {
    return `${milesToKm(distanceMiles).toFixed(1)} km`;
  }
  return `${distanceMiles.toFixed(1)} mi`;
}

