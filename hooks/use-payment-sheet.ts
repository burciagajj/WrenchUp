import { useCallback, useState } from "react";
import { useStripe } from "@stripe/stripe-react-native";
import Constants from "expo-constants";
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
        // In Expo Go, Stripe PaymentSheet cannot run against mocked PI ids.
        // Return unsupported so caller can fall back to app-local simulated flow.
        if (Constants.appOwnership === "expo") {
          return { status: "unsupported" };
        }

        const initResult = await initPaymentSheet({
          // Real backend-generated client secret must be wired before enabling this path.
          // For now, keep the fallback behavior for unsupported/back-end pending setups.
          paymentIntentClientSecret: "",
          merchantDisplayName: "WrenchUp",
          customerId: args.customerEmail,
        });

        if (initResult.error) {
          return { status: "unsupported" };
        }

        const presentResult = await presentPaymentSheet();

        if (presentResult.error) {
          if (presentResult.error.code === "Canceled") {
            return { status: "canceled" };
          }
          return { status: "failed", message: presentResult.error.message };
        }

        return { status: "completed" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Payment failed";
        setError(msg);
        return { status: "unsupported" };
      } finally {
        setLoading(false);
      }
    },
    [initPaymentSheet, presentPaymentSheet],
  );

  return { present, loading, error };
}

export type { PresentArgs, PresentResult } from "./use-payment-sheet.types";
