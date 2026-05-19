import { useCallback, useState } from "react";
import type { PresentArgs, PresentResult } from "./use-payment-sheet.types";

/**
 * Web stub — never imports @stripe/stripe-react-native (native-only).
 * Callers fall back to saved-card UI on confirm.tsx.
 */
export function usePaymentSheet() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const present = useCallback(async (_args: PresentArgs): Promise<PresentResult> => {
    return { status: "unsupported" };
  }, []);

  return { present, loading, error };
}

export type { PresentArgs, PresentResult } from "./use-payment-sheet.types";
