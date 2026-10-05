/**
 * Shared bounds for the customer "Adjust Price" field on the confirm screen.
 * Used both client-side (app/confirm.tsx, for live UI feedback) and server-side
 * (app/api/payment-intent+api.ts, so the bound can't be bypassed by calling the
 * API directly) — keep this the single source of truth for the allowed range.
 *
 * A customer can suggest a different price (the mechanic can still accept or
 * counter it), but nothing should let them authorize $0.50 for a job estimated
 * at $150, or $5,000 for a job estimated at $60.
 */
import { USD_TO_MXN_DISPLAY } from "@/lib/i18n";
import type { RegionCode } from "@/lib/types";

/** Lowest a customer may offer, as a fraction of the computed fare estimate. */
export const PRICE_ADJUSTMENT_MIN_RATIO = 0.5;
/** Highest a customer may offer, as a fraction of the computed fare estimate. */
export const PRICE_ADJUSTMENT_MAX_RATIO = 1.5;

export type PriceAdjustmentBounds = { min: number; max: number };

/** Returns the allowed [min, max] price range for a given fare estimate. */
export function getPriceAdjustmentBounds(estimatedTotal: number): PriceAdjustmentBounds {
  const safeEstimate = Number.isFinite(estimatedTotal) && estimatedTotal > 0 ? estimatedTotal : 0;
  return {
    min: +(safeEstimate * PRICE_ADJUSTMENT_MIN_RATIO).toFixed(2),
    max: +(safeEstimate * PRICE_ADJUSTMENT_MAX_RATIO).toFixed(2),
  };
}

/** True if `price` falls within the allowed range for `estimatedTotal`. */
export function isPriceWithinAdjustmentBounds(price: number, estimatedTotal: number): boolean {
  if (!Number.isFinite(price) || price <= 0) return false;
  const { min, max } = getPriceAdjustmentBounds(estimatedTotal);
  if (min <= 0 || max <= 0) return true; // can't bound against a zero/invalid estimate
  return price >= min && price <= max;
}

/** Clamps `price` into the allowed range for `estimatedTotal`. */
export function clampPriceToAdjustmentBounds(price: number, estimatedTotal: number): number {
  const { min, max } = getPriceAdjustmentBounds(estimatedTotal);
  if (min <= 0 || max <= 0) return price;
  if (price < min) return min;
  if (price > max) return max;
  return price;
}

/**
 * Flat sanity ceiling for a mechanic-proposed parts reimbursement (see
 * parts-cost-approval-card.tsx and app/api/parts-payment-intent+api.ts).
 * Deliberately NOT the same ratio-of-estimate check above — parts cost is a
 * separate, receipt-backed line item unrelated to the labor estimate, so a
 * legitimate $40 parts cost on a $29 quick check-up would fail that ratio
 * for reasons that have nothing to do with labor-price manipulation.
 */
export const MAX_PARTS_COST_USD = 150;

/**
 * The parts-cost ceiling expressed in the request's actual charge currency.
 * A straight FX conversion of MAX_PARTS_COST_USD with NO promo discount
 * applied — this is an anti-abuse ceiling, not a customer-facing price, so
 * an MX mechanic's real-world receipt shouldn't be capped ~40% lower than a
 * US mechanic's for the same purchase. Client and server must both use this
 * so their checks agree (they previously didn't — MX was capped at 150
 * pesos client-side).
 */
export function maxPartsCostForRegion(region: RegionCode): number {
  return region === "MX" ? +(MAX_PARTS_COST_USD * USD_TO_MXN_DISPLAY).toFixed(2) : MAX_PARTS_COST_USD;
}

/** True if a proposed parts cost is a sane, non-zero amount under the region's cap. */
export function isPartsCostWithinBounds(partsCost: number, region: RegionCode): boolean {
  return Number.isFinite(partsCost) && partsCost > 0 && partsCost <= maxPartsCostForRegion(region);
}
