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
        "Set a pk_test_ Stripe publishable key in EXPO_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY (or the legacy EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY alias) for dev builds. Live keys (EXPO_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY) are only used in real production builds.",
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
      merchantIdentifier="merchant.com.wrenchup.app"
      urlScheme="wrenchup"
    >
      <>{children}</>
    </StripeProvider>
  );
}
