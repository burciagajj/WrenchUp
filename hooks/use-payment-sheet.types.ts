import type { StripeCurrency } from "@/lib/stripe";

export type PresentResult =
  | { status: "completed"; paymentMethodId?: string; paymentIntentId?: string }
  | { status: "canceled" }
  | { status: "failed"; message: string }
  | { status: "unsupported" };

export type PresentArgs = {
  amount: number;
  /** Pre-adjustment computed fare estimate, same units/currency as `amount` (cents). Lets the server sanity-check `amount` against it. */
  estimatedTotal?: number;
  currency: StripeCurrency;
  sessionToken: string;
  customerEmail?: string;
  /**
   * Which route creates the PaymentIntent — defaults to "/api/payment-intent"
   * (the main job hold). Pass "/api/parts-payment-intent" to present the
   * separate parts-reimbursement hold instead; that route ignores `amount`/
   * `estimatedTotal` from the client and reads the proposed cost server-side.
   */
  endpoint?: string;
  /** Extra fields to send in the intent-creation request body (e.g. requestId for the parts endpoint). */
  extraParams?: Record<string, unknown>;
};
