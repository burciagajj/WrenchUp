// Staged mechanic payouts. When the customer confirms a job the card is
// charged right away, the mechanic receives a deposit immediately, and the
// rest is released once the dispute window has passed with no open dispute
// (see app/api/payment-capture-sweep+api.ts). Parts reimbursement is paid in
// full at capture on its own transfer, so it is not part of this split.

/** Share of the mechanic's service price paid out at capture. */
export const PAYOUT_DEPOSIT_FRACTION = 0.5;

/** How long after customer confirmation the held remainder stays on hold. */
export const DISPUTE_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * A job that the mechanic marked done but the customer never confirms is
 * confirmed automatically after this long, so the mechanic isn't left unpaid
 * until the card hold expires (~7 days).
 */
export const AUTO_CONFIRM_AFTER_MS = 24 * 60 * 60 * 1000;

export type PayoutSplit = {
  /** Everything the mechanic is owed for the job (service price + tip). */
  totalCents: number;
  /** Paid at capture. */
  depositCents: number;
  /** Paid after the dispute window. depositCents + remainderCents === totalCents. */
  remainderCents: number;
};

/**
 * Splits the mechanic's share of a job. `offeredPrice` is the customer-facing
 * total (service * (1 + feeRate)), so the platform's fee is stripped first.
 * The tip is never part of the deposit — it goes with the remainder.
 */
export function computePayoutSplit(input: {
  offeredPrice: number;
  tip: number;
  feeRate: number;
}): PayoutSplit {
  const offered = Number.isFinite(input.offeredPrice) && input.offeredPrice > 0 ? input.offeredPrice : 0;
  const tip = Number.isFinite(input.tip) && input.tip > 0 ? input.tip : 0;
  const servicePortion = offered / (1 + input.feeRate);
  const totalCents = Math.round((servicePortion + tip) * 100);
  const depositCents = Math.min(totalCents, Math.floor(servicePortion * 100 * PAYOUT_DEPOSIT_FRACTION));
  return { totalCents, depositCents, remainderCents: totalCents - depositCents };
}
