import type { StripeCurrency } from "@/lib/stripe";

export type PresentResult =
  | { status: "completed"; paymentMethodId?: string }
  | { status: "canceled" }
  | { status: "failed"; message: string }
  | { status: "unsupported" };

export type PresentArgs = {
  amount: number;
  currency: StripeCurrency;
  customerEmail?: string;
};
