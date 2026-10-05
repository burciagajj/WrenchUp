export type AddCardResult =
  | {
      status: "completed";
      paymentMethodId: string;
      card: { brand: string; last4: string; expMonth: number; expYear: number };
    }
  | { status: "canceled" }
  | { status: "failed"; message: string };
