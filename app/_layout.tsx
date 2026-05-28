import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, usePathname, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { LogBox, Platform } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { StoreProvider } from "@/lib/store";
import { AppStripeProvider } from "@/components/stripe-provider";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { UserDataSync } from "@/components/user-data-sync";
import { CustomerLiveJobSync } from "@/components/customer-live-job-sync";
import { RegionBootstrap } from "@/components/region-bootstrap";
import { AppDrawerProvider } from "@/lib/app-drawer-context";
import { AuthenticatedDrawer } from "@/components/authenticated-drawer";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "index",
};

function RootAuthGate() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;

    const inAuthFlow = segments[0] === "auth";
    const inLegalFlow = segments[0] === "legal";
    const isAllowedPublicAuthScreen =
      pathname === "/auth/signin" ||
      pathname === "/auth/signup" ||
      pathname === "/legal/terms" ||
      pathname === "/legal/privacy";

    if (!isAuthenticated && !isAllowedPublicAuthScreen) {
      router.replace("/auth/signin");
      return;
    }

    if (isAuthenticated && inAuthFlow && !inLegalFlow) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, isLoading, pathname, segments]);

  return null;
}

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
  }, []);

  // Stripe RN + Expo Go can emit a harmless warning:
  // "No task registered for key StripeKeepJsAwakeTask"
  // Ignore only this exact warning to keep dev logs readable.
  useEffect(() => {
    LogBox.ignoreLogs(["No task registered for key StripeKeepJsAwakeTask"]);
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          {/* Default to hiding native headers so raw route segments don't appear (e.g. "(tabs)", "products/[id]"). */}
          {/* If a screen needs the native header, explicitly enable it and set a human title via Stack.Screen options. */}
          {/* in order for ios apps tab switching to work properly, use presentation: "fullScreenModal" for login page, whenever you decide to use presentation: "modal*/}
          <AuthProvider>
            <StoreProvider>
              <AppDrawerProvider>
                <RootAuthGate />
                <RegionBootstrap />
                <UserDataSync />
                <CustomerLiveJobSync />
                <AppStripeProvider>
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="oauth/callback" />
                    <Stack.Screen name="auth/signup" />
                    <Stack.Screen name="auth/signin" />
                    <Stack.Screen name="auth/profile-complete" />
                    <Stack.Screen name="legal/terms" />
                    <Stack.Screen name="legal/privacy" />
                    <Stack.Screen name="service-select" options={{ presentation: "modal" }} />
                    <Stack.Screen name="mechanics" />
                    <Stack.Screen name="mechanic/[id]" />
                    <Stack.Screen name="mechanic/matched" options={{ presentation: "modal" }} />
                    <Stack.Screen name="confirm" />
                    <Stack.Screen name="request-pending" />
                    <Stack.Screen name="request-another-service" />
                    <Stack.Screen name="notifications" />
                    <Stack.Screen name="tracking" />
                    <Stack.Screen name="messages" options={{ presentation: "modal" }} />
                    <Stack.Screen name="complete" />
                    <Stack.Screen name="job/[id]" />
                    <Stack.Screen name="vehicle-form" options={{ presentation: "modal" }} />
                    <Stack.Screen name="payment-methods" options={{ presentation: "modal" }} />
                    <Stack.Screen name="mechanic/incoming" options={{ presentation: "modal" }} />
                    <Stack.Screen name="mechanic/booked" />
                    <Stack.Screen name="mechanic/active" />
                  </Stack>
                  <AuthenticatedDrawer />
                </AppStripeProvider>
              </AppDrawerProvider>
            </StoreProvider>
          </AuthProvider>
          <StatusBar style="auto" />
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}
