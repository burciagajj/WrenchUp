/**
 * Pure decision logic for app/mechanic/incoming.tsx's 60s accept/decline
 * countdown, kept separate so it's unit-testable without React Native.
 */

export type IncomingOfferExpiryInput = {
  /** True once the mechanic has accepted or explicitly declined. */
  alreadyResolved: boolean;
  /** True once the mechanic has sent a counteroffer for this request. */
  counterOfferSent: boolean;
};

/**
 * Decides whether the countdown hitting zero should auto-decline (and
 * reassign to the next mechanic). A sent counteroffer means the mechanic DID
 * respond within the window — just not with a flat accept/decline — so
 * expiry must not silently kill the negotiation and reassign the job out
 * from under them.
 */
export function shouldAutoDeclineOnExpiry(input: IncomingOfferExpiryInput): boolean {
  return !input.alreadyResolved && !input.counterOfferSent;
}
