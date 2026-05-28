import type { Mechanic, ServiceType } from "./types";

const US_DISTANCE_RATE_PER_MILE_USD = 0.4;
const MX_DISTANCE_RATE_PER_KM_MXN = 5.5;
const MILES_TO_KM = 1.60934;
// Keep fare outputs in USD-equivalent so existing app totals + formatPrice() keep working.
// formatPrice() applies (USD * 0.4 * 17.5) for MX display.
const MX_DISPLAY_MULTIPLIER = 0.4 * 17.5;
const BOOKING_FEE = 0;

export function computeFare(mechanic: Mechanic, service: ServiceType, region: "US" | "MX" = "US") {
  const base = +(BOOKING_FEE).toFixed(2);
  const distance =
    region === "MX"
      ? +(((mechanic.distanceMiles * MILES_TO_KM * MX_DISTANCE_RATE_PER_KM_MXN) / MX_DISPLAY_MULTIPLIER).toFixed(2))
      : +(mechanic.distanceMiles * US_DISTANCE_RATE_PER_MILE_USD).toFixed(2);
  // service base price * a small mechanic premium based on rate
  const premium = mechanic.hourlyRate >= 95 ? 1.1 : mechanic.hourlyRate >= 85 ? 1.0 : 0.95;
  const serviceCost = +(service.basePrice * premium).toFixed(2);
  const total = +(base + distance + serviceCost).toFixed(2);
  return {
    base,
    distance,
    service: serviceCost,
    total,
  };
}
