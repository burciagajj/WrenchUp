import { haversineMeters, metersToMiles } from "./geo";
import { toChargeableAmount } from "./i18n";
import type { RegionCode } from "./types";

// Flat fee in USD terms; converted to the request's charge currency the same
// way every other price is (see toChargeableAmount). The customer is charged
// the full amount; the mechanic receives it minus Stripe's processing cost
// (see cancellationFeeMechanicShare) so the platform doesn't lose money on it.
export const CANCELLATION_FEE_USD = 5;

// Stripe's standard card processing rates, as an estimate (percent + fixed
// amount in the charge currency). Only used to net the processing cost out of
// the mechanic's share of a cancellation fee.
const PROCESSING_FEE_ESTIMATE: Record<string, { rate: number; fixed: number }> = {
  usd: { rate: 0.029, fixed: 0.3 },
  mxn: { rate: 0.036, fixed: 3 },
};

/**
 * What the mechanic receives from a captured cancellation fee: the fee minus
 * the estimated Stripe processing cost, never below zero.
 */
export function cancellationFeeMechanicShare(feeAmount: number, currency: string | null | undefined): number {
  if (!Number.isFinite(feeAmount) || feeAmount <= 0) return 0;
  const estimate = PROCESSING_FEE_ESTIMATE[(currency || "usd").toLowerCase()] ?? PROCESSING_FEE_ESTIMATE.usd;
  return Math.max(0, +(feeAmount - (feeAmount * estimate.rate + estimate.fixed)).toFixed(2));
}

// Both must hold: a short hop shouldn't charge the customer (the floor), and
// neither should a long-distance mechanic who has barely started (the share).
export const MIN_DRIVEN_MILES = 0.5;
export const MIN_DRIVEN_FRACTION = 0.25;

export type CancellationFeeInput = {
  cancelledByRole: "customer" | "mechanic" | null | undefined;
  hasAssignedMechanic: boolean;
  drivenMiles: number | null | undefined;
  mechanicStart: { latitude: number; longitude: number } | null;
  customer: { latitude: number; longitude: number } | null;
  region: RegionCode;
};

export type CancellationFeeDecision =
  | { applies: false; reason: string }
  | { applies: true; amount: number; drivenMiles: number; startMiles: number };

/**
 * Whether a customer cancellation owes the mechanic a fee, based on how far
 * the mechanic actually drove. Anything we can't measure resolves to no fee —
 * the customer is never charged on missing data. Computed server-side from
 * GPS the mechanic's own app pushed (see migration 044), never from anything
 * the cancelling customer's client sends.
 */
export function computeCancellationFee(input: CancellationFeeInput): CancellationFeeDecision {
  if (input.cancelledByRole !== "customer") return { applies: false, reason: "not cancelled by customer" };
  if (!input.hasAssignedMechanic) return { applies: false, reason: "no mechanic assigned" };
  if (!input.mechanicStart || !input.customer) return { applies: false, reason: "missing location data" };

  const drivenMiles = input.drivenMiles;
  if (typeof drivenMiles !== "number" || !Number.isFinite(drivenMiles) || drivenMiles <= 0) {
    return { applies: false, reason: "mechanic had not driven" };
  }

  const startMiles = metersToMiles(haversineMeters(input.mechanicStart, input.customer));
  if (!Number.isFinite(startMiles) || startMiles <= 0) return { applies: false, reason: "no starting distance" };

  if (drivenMiles < MIN_DRIVEN_MILES) return { applies: false, reason: "below minimum distance" };
  if (drivenMiles / startMiles < MIN_DRIVEN_FRACTION) return { applies: false, reason: "below minimum share of trip" };

  return {
    applies: true,
    amount: toChargeableAmount(CANCELLATION_FEE_USD, input.region),
    drivenMiles,
    startMiles,
  };
}
