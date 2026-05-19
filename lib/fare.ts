import type { Mechanic, ServiceType } from "./types";

const DISTANCE_RATE_PER_MILE = 1.75; // dispatch fee per mile
const BOOKING_FEE = 4.99;

export function computeFare(mechanic: Mechanic, service: ServiceType) {
  const base = +(BOOKING_FEE).toFixed(2);
  const distance = +(mechanic.distanceMiles * DISTANCE_RATE_PER_MILE).toFixed(2);
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
