import { useCallback, useState } from "react";
import { useStripe } from "@stripe/stripe-react-native";
import { getApiUrl } from "@/lib/api-base-url";
import { createMockPaymentIntent } from "@/lib/mock-payment";
import { shouldUseMockPaymentsRuntime } from "@/lib/mock-payments-runtime";
import { PAYMENT_SHEET_APPEARANCE } from "@/lib/stripe-appearance";
import type { PresentArgs, PresentResult } from "./use-payment-sheet.types";

/**
 * Native PaymentSheet hook. Loaded only on iOS/Android (see use-payment-sheet.web.ts).
 */
export function usePaymentSheet() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMockPaymentsEnabled = shouldUseMockPaymentsRuntime();

  const present = useCallback(
    async (args: PresentArgs): Promise<PresentResult> => {
      setLoading(true);
      setError(null);

      try {
        if (isMockPaymentsEnabled) {
          const mockIntent = createMockPaymentIntent(args.amount, args.currency);
          return { status: "completed", paymentIntentId: mockIntent.id };
        }

        if (!args.sessionToken) {
          return {
            status: "failed",
            message: "Your session expired. Please sign in again and retry payment.",
          };
        }

        const intentRes = await fetch(getApiUrl(args.endpoint ?? "/api/payment-intent"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${args.sessionToken}`,
          },
          body: JSON.stringify({
            amount: args.amount,
            estimatedTotal: args.estimatedTotal ?? null,
            currency: args.currency,
            customerEmail: args.customerEmail ?? null,
            ...(args.extraParams ?? {}),
          }),
        });

        const text = await intentRes.text().catch(() => "");
        let parsed: {
          paymentIntentId?: string;
          clientSecret?: string;
          error?: string;
          customerId?: string;
          ephemeralKeySecret?: string;
        } = {};
        if (text) {
          try {
            parsed = JSON.parse(text) as typeof parsed;
          } catch {
            parsed = { error: text };
          }
        }

        if (!intentRes.ok || !parsed.clientSecret || !parsed.paymentIntentId) {
          const message = parsed.error || `Payment authorization failed (${intentRes.status})`;
          return { status: "failed", message };
        }

        const initResult = await initPaymentSheet({
          paymentIntentClientSecret: parsed.clientSecret,
          merchantDisplayName: "WrenchUp",
          appearance: PAYMENT_SHEET_APPEARANCE,
          // Without these, the sheet has no way to look up this customer's
          // saved cards — it always presents blank, regardless of what the
          // app's own card-selector UI shows as "selected". Optional here
          // (endpoints like parts-payment-intent don't return them yet) so
          // this stays backward compatible.
          ...(parsed.customerId && parsed.ephemeralKeySecret
            ? { customerId: parsed.customerId, customerEphemeralKeySecret: parsed.ephemeralKeySecret }
            : {}),
        });

        if (initResult.error) {
          return { status: "failed", message: initResult.error.message || "Failed to initialize payment sheet." };
        }

        const presentResult = await presentPaymentSheet();

        if (presentResult.error) {
          if (presentResult.error.code === "Canceled") {
            return { status: "canceled" };
          }
          return { status: "failed", message: presentResult.error.message };
        }

        return { status: "completed", paymentIntentId: parsed.paymentIntentId };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Payment failed";
        setError(msg);
        return { status: "failed", message: msg };
      } finally {
        setLoading(false);
      }
    },
    [initPaymentSheet, presentPaymentSheet, isMockPaymentsEnabled],
  );

  return { present, loading, error };
}

export type { PresentArgs, PresentResult } from "./use-payment-sheet.types";
