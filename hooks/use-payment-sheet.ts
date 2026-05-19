import { useCallback, useState } from "react";
import { useStripe } from "@stripe/stripe-react-native";
import { createMockPaymentIntent, simulatePaymentSheetResult } from "@/lib/mock-payment";
import type { PresentArgs, PresentResult } from "./use-payment-sheet.types";

/**
 * Native PaymentSheet hook. Loaded only on iOS/Android (see use-payment-sheet.web.ts).
 */
export function usePaymentSheet() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const present = useCallback(
    async (args: PresentArgs): Promise<PresentResult> => {
      setLoading(true);
      setError(null);

      try {
        const intent = createMockPaymentIntent(args.amount, args.currency);

        const initResult = await initPaymentSheet({
          paymentIntentClientSecret: intent.clientSecret,
          merchantDisplayName: "WrenchUp",
          customerId: args.customerEmail,
        });

        if (initResult.error) {
          throw new Error(initResult.error.message);
        }

        const presentResult = await presentPaymentSheet();

        if (presentResult.error) {
          if (presentResult.error.code === "Canceled") {
            return { status: "canceled" };
          }
          return { status: "failed", message: presentResult.error.message };
        }

        const intentStatus = simulatePaymentSheetResult(intent.clientSecret);

        if (
          intentStatus.status === "succeeded" ||
          intentStatus.status === "requires_action" ||
          intentStatus.status === "processing"
        ) {
          return { status: "completed", paymentMethodId: intent.id };
        }

        return { status: "failed", message: "Payment could not be completed" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Payment failed";
        setError(msg);
        return { status: "failed", message: msg };
      } finally {
        setLoading(false);
      }
    },
    [initPaymentSheet, presentPaymentSheet],
  );

  return { present, loading, error };
}

export type { PresentArgs, PresentResult } from "./use-payment-sheet.types";
