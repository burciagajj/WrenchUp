import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Linking from "expo-linking";
import { getApiUrl } from "@/lib/api-base-url";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import type { AuthUser } from "@/lib/auth-context";
import { useRegion } from "@/hooks/use-locale";

export type ConnectPayoutStatus = {
  accountId: string | null;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
};

const IDLE_STATUS: ConnectPayoutStatus = {
  accountId: null,
  detailsSubmitted: false,
  chargesEnabled: false,
  payoutsEnabled: false,
};

/**
 * Drives the mechanic "Set up payouts" flow: checks/refreshes Stripe Connect
 * onboarding status, and opens Stripe's hosted onboarding when the mechanic
 * taps to start or continue setup.
 *
 * Status is re-checked automatically when the app returns to the foreground
 * (the mechanic backgrounds the app to complete onboarding in the system
 * browser, then comes back) — same pattern as mechanic-live-job-sync.tsx's
 * AppState handling, rather than relying solely on the account.updated
 * webhook, which can lag by a few seconds.
 */
export function useConnectPayouts(user: AuthUser | null | undefined, enabled: boolean) {
  const [status, setStatus] = useState<ConnectPayoutStatus>(IDLE_STATUS);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [startingOnboarding, setStartingOnboarding] = useState(false);
  const [openingSettings, setOpeningSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wasBackgroundedRef = useRef(false);
  // Sent with onboarding so a new Stripe account is created in the right
  // country (it can never be changed later).
  const region = useRegion();

  const refreshStatus = useCallback(async () => {
    if (!enabled) return;
    setLoadingStatus(true);
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) return;
      const res = await fetch(getApiUrl("/api/connect-account-status"), {
        method: "POST",
        headers: { Authorization: `Bearer ${resolved.sessionToken}` },
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.data) {
        setStatus(json.data as ConnectPayoutStatus);
      }
    } catch (err) {
      console.warn("[useConnectPayouts] Status refresh failed:", err);
    } finally {
      setLoadingStatus(false);
    }
  }, [enabled, user]);

  useEffect(() => {
    if (!enabled) return;
    void refreshStatus();
  }, [enabled, refreshStatus]);

  useEffect(() => {
    if (!enabled) return;
    const handleAppStateChange = (next: AppStateStatus) => {
      if (next === "background" || next === "inactive") {
        wasBackgroundedRef.current = true;
      } else if (next === "active" && wasBackgroundedRef.current) {
        wasBackgroundedRef.current = false;
        void refreshStatus();
      }
    };
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, [enabled, refreshStatus]);

  const startOnboarding = useCallback(async () => {
    setStartingOnboarding(true);
    setError(null);
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) {
        setError("Please sign in again to continue.");
        return;
      }
      const returnUrl = Linking.createURL("/mechanic/payouts-return", { queryParams: { result: "return" } });
      const refreshUrl = Linking.createURL("/mechanic/payouts-return", { queryParams: { result: "refresh" } });

      const res = await fetch(getApiUrl("/api/connect-account-link"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resolved.sessionToken}`,
        },
        body: JSON.stringify({ returnUrl, refreshUrl, region }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) {
        setError(json?.error || "Could not start payout setup. Please try again.");
        return;
      }
      const supported = await Linking.canOpenURL(json.url);
      if (!supported) {
        setError("Could not open the payout setup page.");
        return;
      }
      await Linking.openURL(json.url);
      // The AppState "active" listener above picks up the status refresh
      // once the mechanic returns from the browser.
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not start payout setup.";
      setError(message);
    } finally {
      setStartingOnboarding(false);
    }
  }, [region, user]);

  // Opens the Stripe Express dashboard so an already-onboarded mechanic can
  // change their bank/card or personal details.
  const openPayoutSettings = useCallback(async () => {
    setOpeningSettings(true);
    setError(null);
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) {
        setError("Please sign in again to continue.");
        return;
      }
      const res = await fetch(getApiUrl("/api/connect-dashboard-link"), {
        method: "POST",
        headers: { Authorization: `Bearer ${resolved.sessionToken}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) {
        setError(json?.error || "Could not open payout settings. Please try again.");
        return;
      }
      await Linking.openURL(json.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open payout settings.");
    } finally {
      setOpeningSettings(false);
    }
  }, [user]);

  return {
    status,
    loadingStatus,
    startingOnboarding,
    openingSettings,
    error,
    refreshStatus,
    startOnboarding,
    openPayoutSettings,
  };
}
