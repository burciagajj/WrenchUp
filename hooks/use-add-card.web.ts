import { useCallback } from "react";
import type { AddCardResult } from "./use-add-card.types";

/**
 * Web stub — never imports @stripe/stripe-react-native (native-only).
 * Mirrors use-payment-sheet.web.ts's pattern.
 */
export function useAddCard() {
  const addCard = useCallback(async (): Promise<AddCardResult> => {
    return { status: "failed", message: "Adding a card is unavailable on web." };
  }, []);

  return { addCard, loading: false };
}

export type { AddCardResult } from "./use-add-card.types";
