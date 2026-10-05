import type { Mechanic, ServiceType } from "./types";

// Platform/booking fee applied on top of the service price. Kept as a single
// exported constant so every caller (confirm.tsx, dispatch fee math, tests)
// uses the exact same rate instead of a second hardcoded copy of this value
// drifting out of sync.
// Raised from 0.12 to 0.15 so the fee covers Stripe's processing cost on small
// jobs. Every request stores the rate it was booked at (platform_fee_rate), and
// the payout math reads that stored rate, so jobs booked at 12% still pay out
// at 12%; the 0.12 DEFAULT_PLATFORM_FEE_RATE fallbacks elsewhere are only for
// legacy rows that never stored a rate.
export const QUICK_SERVICE_BOOKING_FEE_RATE = 0.15;

/**
 * Fare for a quick-service (mechanic-already-known) booking. Returns
 * USD-denominated amounts — callers must convert via
 * lib/i18n.ts's toChargeableAmount() before charging Stripe or persisting a
 * price, since MX charges in pesos at a discount, not raw USD numbers.
 *
 * There is deliberately no distance/per-mile component: pricing used to
 * include a per-mile "dispatch" fee, but the app doesn't do metered mileage
 * billing, so that line item was removed. The service price already accounts
 * for the mechanic via the premium below.
 */
export function computeFare(mechanic: Mechanic, service: ServiceType) {
  // service base price * a small mechanic premium based on rate
  const premium = mechanic.hourlyRate >= 95 ? 1.1 : mechanic.hourlyRate >= 85 ? 1.0 : 0.95;
  const serviceCost = +(service.basePrice * premium).toFixed(2);
  const bookingFee = +(serviceCost * QUICK_SERVICE_BOOKING_FEE_RATE).toFixed(2);
  const total = +(serviceCost + bookingFee).toFixed(2);
  return {
    service: serviceCost,
    bookingFee,
    total,
  };
}

/**
 * Inverse of the service->total math above: given a TOTAL price (what the
 * customer actually pays — whether that's the original estimate or a price
 * either side adjusted via a counter-offer/manual edit), back out the real
 * service portion and the platform fee actually being taken from it.
 *
 * The fee must always be exactly feeRate of the service price, not of the
 * total — so this can't just do `total * feeRate`. Since total =
 * service * (1 + feeRate), service = total / (1 + feeRate). This mirrors the
 * server-side derivation in lib/live-dispatch.ts and the payout sweep, so
 * whatever gets shown here matches what's actually charged/paid out.
 */
export function deriveServiceAndFeeFromTotal(
  total: number,
  feeRate: number = QUICK_SERVICE_BOOKING_FEE_RATE,
): { service: number; fee: number } {
  if (!Number.isFinite(total) || total <= 0) return { service: 0, fee: 0 };
  const service = +(total / (1 + feeRate)).toFixed(2);
  const fee = +(total - service).toFixed(2);
  return { service, fee };
}
