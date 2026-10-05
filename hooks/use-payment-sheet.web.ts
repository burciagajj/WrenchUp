import { useCallback } from "react";
import { createMockPaymentIntent } from "@/lib/mock-payment";
import { shouldUseMockPaymentsRuntime } from "@/lib/mock-payments-runtime";
import type { PresentArgs, PresentResult } from "./use-payment-sheet.types";

/**
 * Web stub — never imports @stripe/stripe-react-native (native-only).
 * Callers fall back to saved-card UI on confirm.tsx.
 */
export function usePaymentSheet() {
  const isMockPaymentsEnabled = shouldUseMockPaymentsRuntime();

  const present = useCallback(async (args: PresentArgs): Promise<PresentResult> => {
    if (isMockPaymentsEnabled) {
      const mockIntent = createMockPaymentIntent(args.amount, args.currency);
      return { status: "completed", paymentIntentId: mockIntent.id };
    }
    return { status: "failed", message: "Stripe PaymentSheet is unavailable on web." };
  }, [isMockPaymentsEnabled]);

  return { present, loading: false, error: null };
}

export type { PresentArgs, PresentResult } from "./use-payment-sheet.types";
