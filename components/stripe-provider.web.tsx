import type { ReactNode } from "react";

/**
 * Web fallback for AppStripeProvider. The native Stripe RN SDK pulls in
 * codegen-only modules (NativeCommands, NativeCardField, etc.) that crash
 * Metro's web bundler, so on web we render children unchanged. A future
 * iteration can mount Stripe Elements (via @stripe/react-stripe-js) here.
 */
export function AppStripeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
