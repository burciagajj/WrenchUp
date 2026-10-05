import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, usePathname, useSegments, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, LogBox, Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import * as SplashScreen from "expo-splash-screen";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { StoreProvider, useStore } from "@/lib/store";
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
import { safePush, setRouterReady } from "@/lib/safe-router";
import { UserDataSync } from "@/components/user-data-sync";
import { ErrorBoundary } from "@/components/error-boundary";
import { CustomerLiveJobSync } from "@/components/customer-live-job-sync";
import { MechanicLiveJobSync } from "@/components/mechanic-live-job-sync";
import { ChatMessageSync } from "@/components/chat-message-sync";
import { RegionBootstrap } from "@/components/region-bootstrap";
import { PushTokenSync } from "@/components/push-token-sync";
import { AppDrawerProvider } from "@/lib/app-drawer-context";
import { AuthenticatedDrawer } from "@/components/authenticated-drawer";
import { SchemeColors } from "@/constants/theme";
import { buildChatNotificationRoute } from "@/lib/chat-notifications";
import { isNativePushAvailable, subscribeNotificationResponses } from "@/lib/notifications";
// Registers the background trip-location task; must load at app start so
// the OS can wake it while the app is closed.
import "@/lib/mechanic-trip-tracking";

// Keep the native splash screen (logo) visible via preventAutoHideAsync until
// AppBootstrapGate is ready. We hide it only after hydration+auth+data (or force).
// This prevents both "stuck on logo" (thanks to force timeout) and flashing the
// logo away too early.
SplashScreen.preventAutoHideAsync().catch(() => {});

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "index",
};

function RootAuthGate() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();

  // Track whether we've performed the initial routing decision.
  // Prevents a cascade of router.replace calls (which can cause the app to
  // visually "re-open" or flash) as pathname/segments update during startup.
  const initialDecisionDone = useRef(false);

  useEffect(() => {
    if (isLoading) return;

    const firstSegment = segments[0];
    const inTabsFlow = firstSegment === "(tabs)";
    const inAuthFlow = firstSegment === "auth";
    const inLegalFlow = firstSegment === "legal";
    const isAllowedPublicAuthScreen =
      pathname === "/auth/signin" ||
      pathname === "/auth/signup" ||
      pathname === "/auth/signup/customer" ||
      pathname === "/auth/signup/mechanic" ||
      pathname === "/auth/signup/email-status" ||
      pathname === "/auth/signup/identity" ||
      pathname === "/auth/signup/done" ||
      pathname === "/legal/terms" ||
      pathname === "/legal/privacy" ||
      pathname === "/legal/delete-account" ||
      pathname === "/legal/about";

    // Only act if we haven't done the startup decision, or if we need to react to an explicit auth change.
    // After the first decision we still allow important transitions (e.g. logout → signin).
    const shouldAct = !initialDecisionDone.current || !isAuthenticated;

    if (!shouldAct) return;

    if (!isAuthenticated && !isAllowedPublicAuthScreen) {
      // Avoid replacing if we're already on an auth screen
      if (!pathname.startsWith("/auth") && pathname !== "/legal/terms" && pathname !== "/legal/privacy" && pathname !== "/legal/delete-account") {
        router.replace("/auth/signin");
      }
      initialDecisionDone.current = true;
      return;
    }

    if (isAuthenticated && inAuthFlow && !inLegalFlow) {
      if (!inTabsFlow) {
        router.replace("/(tabs)");
      }
      initialDecisionDone.current = true;
      return;
    }

    // Ensure authenticated users on the bare root index use the tabs group
    const onBareIndex = !firstSegment || pathname === "/";
    if (isAuthenticated && onBareIndex && !inAuthFlow && !inLegalFlow) {
      if (!inTabsFlow) {
        router.replace("/(tabs)");
      }
      initialDecisionDone.current = true;
      return;
    }

    initialDecisionDone.current = true;
  }, [isAuthenticated, isLoading, pathname, segments]);

  // Reset decision when user logs out so a future login can route cleanly again.
  useEffect(() => {
    if (!isAuthenticated) {
      initialDecisionDone.current = false;
    }
  }, [isAuthenticated]);

  return null;
}

function NotificationRouter() {
  const lastHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "web" || !isNativePushAvailable()) return;

    let unsubscribe = () => {};

    const handle = (response: import("expo-notifications").NotificationResponse | null) => {
      const data = (response?.notification.request.content.data ?? {}) as Record<string, unknown>;
      const responseId = response?.notification.request.identifier ?? null;
      if (!responseId || lastHandledRef.current === responseId) return;
      lastHandledRef.current = responseId;

      const route: Href | null =
        typeof data.route === "string"
          ? (data.route as Href)
          : typeof data.requestId === "string"
            ? (buildChatNotificationRoute(
                data.requestId,
                typeof data.peerName === "string" ? data.peerName : null,
              ) as Href)
            : null;

      if (route) {
        safePush(route);
      }
    };

    void subscribeNotificationResponses(handle).then((remove) => {
      unsubscribe = remove;
    });

    return () => unsubscribe();
  }, []);

  return null;
}

/**
 * AppBootstrapGate
 * Renders a stable full-screen dark loader until the app is fully ready:
 *  - Store has hydrated from AsyncStorage
 *  - Auth session restore is complete
 *  - For authenticated users: user data load has finished (either "ready" or "idle" on error)
 *
 * The native splash logo stays visible when Expo keeps it mounted, and a dark
 * loading surface is rendered behind it so reloads never expose a blank root.
 * A force timeout ensures we never get stuck on the logo/loading surface.
 * The gate also prevents mounting heavy screens + auth redirects too early,
 * avoiding multiple flashes of content or the logo.
 */
function AppBootstrapGate({ children }: { children: React.ReactNode }) {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { state } = useStore();
  const loadingBackground = SchemeColors.dark.background;

  const hydratedAndAuthLoaded = state.hydrated && !authLoading;

  // Allow proceeding to real UI even if user data load failed (sets "idle").
  // This prevents getting permanently stuck on the splash logo if Supabase calls
  // fail (network, token, etc.).
  const userDataOk =
    !isAuthenticated ||
    state.userDataStatus === "ready" ||
    state.userDataStatus === "idle";

  const [forceReady, setForceReady] = useState(false);
  const [hasReleased, setHasReleased] = useState(false);
  const ready = hasReleased || (hydratedAndAuthLoaded && userDataOk) || forceReady;

  // Safety: after a hard timeout, force the content to render even if user data
  // bootstrap is still pending or errored. This guarantees we never stay stuck on the launch logo.
  const forceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (forceReady) return;
    forceTimerRef.current = setTimeout(() => {
      setForceReady(true);
      console.warn("[AppBootstrapGate] Force-ready after timeout");
    }, 5000);
    return () => {
      if (forceTimerRef.current) clearTimeout(forceTimerRef.current);
    };
  }, []); // run once on mount

  // Hide native splash (with loading logo) only when we're ready to show real UI.
  // This keeps the splash logo stable during async bootstrap instead of flashing it away early.
  useEffect(() => {
    if (ready) {
      if (!hasReleased) {
        setHasReleased(true);
      }
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [hasReleased, ready]);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: loadingBackground,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  // Mark router as ready for safeReplace / safePush (must happen once after mount)
  useEffect(() => {
    setRouterReady();
  }, []);

  // NOTE: We intentionally do NOT hide the native splash here.
  // Splash is kept visible (via preventAutoHideAsync) during bootstrap so the
  // launch logo shows stably. We hide it only when AppBootstrapGate decides
  // the app is ready (or force timeout). This prevents flashing the logo and
  // avoids getting stuck on it (force ensures we proceed).

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

  // Use the canonical dark background from the theme so navigation scenes (and root) are never white.
  // This fixes sign-in/sign-up (and other auth/public screens) appearing white when the navigator's
  // default scene background (light theme) leaks through.
  const darkBackground = SchemeColors.dark.background;

  const content = (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: darkBackground }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          {/* Default to hiding native headers so raw route segments don't appear (e.g. "(tabs)", "products/[id]"). */}
          {/* If a screen needs the native header, explicitly enable it and set a human title via Stack.Screen options. */}
          {/* in order for ios apps tab switching to work properly, use presentation: "fullScreenModal" for login page, whenever you decide to use presentation: "modal*/}
          <AuthProvider>
            <StoreProvider>
              <AppDrawerProvider>
                <ErrorBoundary>
                  {/* Data / side-effect components run unconditionally so they can advance
                      the "ready" state that controls the bootstrap gate below. */}
                  <RegionBootstrap />
                  <UserDataSync />
                  <PushTokenSync />
                  <CustomerLiveJobSync />
                  <MechanicLiveJobSync />
                  <ChatMessageSync />
                  <NotificationRouter />

                  <AppBootstrapGate>
                    <RootAuthGate />
                    <AppStripeProvider>
                      <Stack
                        screenOptions={{
                          headerShown: false,
                          contentStyle: { backgroundColor: darkBackground },
                          // Explicit animation so Android matches iOS's slide
                          // instead of falling back to its native-stack
                          // default (a flatter fade/slide combo).
                          animation: "slide_from_right",
                        }}
                      >
                    <Stack.Screen name="index" />
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="oauth/callback" />
                    <Stack.Screen name="auth" />
                    <Stack.Screen name="admin" />
                    <Stack.Screen name="legal/terms" />
                    <Stack.Screen name="legal/privacy" />
                    <Stack.Screen name="legal/delete-account" />
                    <Stack.Screen name="legal/about" />
                    <Stack.Screen name="service-select" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                    <Stack.Screen name="mechanic/approval-pending" />
                    <Stack.Screen name="approval-pending" />
                    <Stack.Screen name="matched-mechanic" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                    <Stack.Screen name="confirm" />
                    <Stack.Screen name="request-pending" />
                    <Stack.Screen name="request-another-service" />
                    <Stack.Screen name="notifications" />
                    <Stack.Screen name="tracking" />
                    <Stack.Screen name="messages" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                    <Stack.Screen name="complete" />
                    <Stack.Screen name="job/[id]" />
                    <Stack.Screen name="vehicle-form" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                    <Stack.Screen name="payment-methods" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                    <Stack.Screen name="mechanic/incoming" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                    <Stack.Screen name="mechanic/booked" />
                    <Stack.Screen name="mechanic/cancel-booked" />
                    <Stack.Screen name="mechanic/active" />
                    <Stack.Screen name="mechanic/rate-customer" />
                    <Stack.Screen name="booked-service-edit" />
                  </Stack>
                  <AuthenticatedDrawer />
                </AppStripeProvider>
                </AppBootstrapGate>
                </ErrorBoundary>
              </AppDrawerProvider>
            </StoreProvider>
          </AuthProvider>
          <StatusBar style="light" />
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
