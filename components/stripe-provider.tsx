import type { ReactNode } from "react";
import { getPublishableKey } from "@/lib/stripe";

/**
 * Native AppStripeProvider. Uses lazy require to avoid bundling
 * @stripe/stripe-react-native on web. Metro's platform-specific resolver
 * will pick `stripe-provider.web.tsx` on web, so this file is never loaded there.
 */
export function AppStripeProvider({ children }: { children: ReactNode }) {
  const publishableKey = getPublishableKey();
  if (!publishableKey) {
    if (__DEV__) {
      console.warn(
        "EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing. PaymentSheet will be disabled until it is set.",
      );
    }
    return <>{children}</>;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { StripeProvider } = require("@stripe/stripe-react-native") as {
    StripeProvider: React.ComponentType<{
      publishableKey: string;
      merchantIdentifier: string;
      urlScheme: string;
      children: ReactNode;
    }>;
  };

  return (
    <StripeProvider
      publishableKey={publishableKey}
      merchantIdentifier="merchant.space.manus.wrenchup"
      urlScheme="manus20260511003727"
    >
      <>{children}</>
    </StripeProvider>
  );
}
