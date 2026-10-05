import { getApiUrl } from "@/lib/api-base-url";
import type { StripeCurrency } from "@/lib/stripe";

export async function verifyPaymentBeforeDispatch({
  sessionToken,
  paymentIntentId,
  amount,
  currency,
}: {
  sessionToken: string;
  paymentIntentId: string;
  amount: number;
  currency: StripeCurrency;
}): Promise<void> {
  const res = await fetch(getApiUrl("/api/payment-verify"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ paymentIntentId, amount, currency }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.data?.verified) {
    throw new Error(data?.error || "Payment could not be verified.");
  }
}
