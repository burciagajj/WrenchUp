import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { safeReplace } from "@/lib/safe-router";

/**
 * Deep-link target for Stripe Connect's hosted onboarding return_url and
 * refresh_url (see hooks/use-connect-payouts.ts). There's nothing to show
 * here — Stripe redirects here after the mechanic finishes (or backs out of)
 * onboarding in the system browser, and the earnings screen's AppState
 * listener already re-checks payout status when the app comes back to the
 * foreground. This screen just bounces straight back to Earnings so the
 * mechanic isn't left looking at a blank deep-link landing page.
 */
export default function PayoutsReturnScreen() {
  useEffect(() => {
    safeReplace("/(tabs)/earnings" as any);
  }, []);

  return (
    <ScreenContainer edges={["top", "bottom"]}>
      <View style={styles.container}>
        <ActivityIndicator color="#FB923C" />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
