import { useCallback, useState } from "react";
import { useStripe } from "@stripe/stripe-react-native";
import { getApiUrl } from "@/lib/api-base-url";
import { PAYMENT_SHEET_APPEARANCE } from "@/lib/stripe-appearance";
import type { AddCardResult } from "./use-add-card.types";

/**
 * Native add-a-card flow. Creates a SetupIntent server-side (attaching to the
 * user's Stripe Customer), collects a card via PaymentSheet's setup mode (no
 * charge), then confirms server-side and returns the saved card's display
 * details. See use-add-card.web.ts for the web stub.
 */
export function useAddCard() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [loading, setLoading] = useState(false);

  const addCard = useCallback(
    async (sessionToken: string): Promise<AddCardResult> => {
      setLoading(true);
      try {
        const setupRes = await fetch(getApiUrl("/api/setup-intent"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
        });

        const setupText = await setupRes.text().catch(() => "");
        let setupParsed: {
          setupIntentId?: string;
          setupIntentClientSecret?: string;
          ephemeralKeySecret?: string;
          customerId?: string;
          error?: string;
        } = {};
        if (setupText) {
          try {
            setupParsed = JSON.parse(setupText);
          } catch {
            setupParsed = { error: setupText };
          }
        }

        if (
          !setupRes.ok ||
          !setupParsed.setupIntentId ||
          !setupParsed.setupIntentClientSecret ||
          !setupParsed.ephemeralKeySecret ||
          !setupParsed.customerId
        ) {
          return {
            status: "failed",
            message: setupParsed.error || `Could not start card setup (${setupRes.status})`,
          };
        }

        const initResult = await initPaymentSheet({
          setupIntentClientSecret: setupParsed.setupIntentClientSecret,
          customerId: setupParsed.customerId,
          customerEphemeralKeySecret: setupParsed.ephemeralKeySecret,
          merchantDisplayName: "WrenchUp",
          appearance: PAYMENT_SHEET_APPEARANCE,
        });

        if (initResult.error) {
          return { status: "failed", message: initResult.error.message || "Failed to initialize card setup." };
        }

        const presentResult = await presentPaymentSheet();
        if (presentResult.error) {
          if (presentResult.error.code === "Canceled") {
            return { status: "canceled" };
          }
          return { status: "failed", message: presentResult.error.message };
        }

        const confirmRes = await fetch(getApiUrl("/api/setup-intent-confirm"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ setupIntentId: setupParsed.setupIntentId }),
        });

        const confirmText = await confirmRes.text().catch(() => "");
        let confirmParsed: {
          paymentMethodId?: string;
          card?: { brand: string; last4: string; expMonth: number; expYear: number };
          error?: string;
        } = {};
        if (confirmText) {
          try {
            confirmParsed = JSON.parse(confirmText);
          } catch {
            confirmParsed = { error: confirmText };
          }
        }

        if (!confirmRes.ok || !confirmParsed.card || !confirmParsed.paymentMethodId) {
          return {
            status: "failed",
            message: confirmParsed.error || "Card was saved but details could not be confirmed.",
          };
        }

        return {
          status: "completed",
          paymentMethodId: confirmParsed.paymentMethodId,
          card: confirmParsed.card,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not add card";
        return { status: "failed", message: msg };
      } finally {
        setLoading(false);
      }
    },
    [initPaymentSheet, presentPaymentSheet],
  );

  return { addCard, loading };
}

export type { AddCardResult } from "./use-add-card.types";
