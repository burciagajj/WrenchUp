import { useEffect, useState } from "react";
import { Stack, Redirect, usePathname } from "expo-router";
import { View, ActivityIndicator, type LayoutChangeEvent } from "react-native";

import { useAuth, getSessionToken } from "@/lib/auth-context";
import { useStore } from "@/lib/store";
import { useL } from "@/hooks/use-locale";
import { MainBottomNav, type MainNavKey, type MainBottomNavLabels } from "@/components/main-bottom-nav";
import { VerificationPendingBanner } from "@/components/verification-pending-banner";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";

type ApprovalGateState = { pending: boolean; rejected: boolean } | null;

// Advisory gate: catches any path into (tabs) — deep link, cold relaunch, or
// otherwise — for an account that isn't fully approved yet, same checks as
// app/approval-pending.tsx. Doesn't block navigation (see MainLayout) — just
// reports status so a persistent banner can nudge the user to finish up.
function useApprovalGate(userId: string | undefined, role: string | null | undefined) {
  const [gate, setGate] = useState<ApprovalGateState>(null);

  useEffect(() => {
    // Admins (and any other/unknown role) aren't subject to the photo-review
    // gate — only the two roles migration 034 applies to.
    if (!userId || (role !== "customer" && role !== "mechanic")) {
      setGate(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getSessionToken();
        if (!token) {
          if (!cancelled) setGate(null);
          return;
        }
        const profile = await supabaseUserData.getOrCreateProfile(userId, role, token);
        if (cancelled) return;
        const avatarApproved = profile.avatar_status === "approved" && !!profile.avatar_url;
        const docsApproved = role !== "mechanic" || profile.verification_status === "approved";
        const rejected = profile.avatar_status === "rejected" || (role === "mechanic" && profile.verification_status === "rejected");
        setGate({ pending: !(avatarApproved && docsApproved), rejected });
      } catch (err) {
        console.error("[MainLayout] Approval gate check failed:", err);
        if (!cancelled) setGate(null); // fail open — don't lock users out on a network blip
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, role]);

  return gate;
}

export default function MainLayout() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { state } = useStore();
  const pathname = usePathname();
  const L = useL();
  const gate = useApprovalGate(user?.id, user?.role);
  // The bar's real height varies by device (safe-area inset for the system
  // nav bar/home indicator differs a lot, especially with edgeToEdgeEnabled
  // on Android) — a fixed guess left content clipped under the bar on
  // devices with a taller inset. Measure it and pad the Stack to match.
  const [tabBarHeight, setTabBarHeight] = useState(90);
  const handleTabBarLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    if (height > 0 && height !== tabBarHeight) setTabBarHeight(height);
  };

  const activeRole = state.dashboardRoleOverride ?? state.role;
  const isMechanicView = activeRole === "mechanic";

  const bottomNavLabels: MainBottomNavLabels = {
    home: L("Home", "Inicio"),
    book: L("Book", "Reservar"),
    booked: L("Booked", "Agendado"),
    activity: L("Activity", "Actividad"),
    menu: L("Menu", "Menú"),
  };

  // Determine if we should show the bottom bar (main tabs)
  const norm = (pathname || "/").replace(/\/$/, "");
  const showBar = !isMechanicView && (
    norm === "/" || norm === "/index" || norm === "/(tabs)" ||
    norm.endsWith("/index") || norm.includes("book-service") ||
    norm.includes("booked-requests") || norm.includes("activity") || norm.includes("profile")
  );

  // Compute active key for the bar
  let activeKey: MainNavKey = "home";
  if (norm.includes("book-service")) activeKey = "book";
  else if (norm.includes("booked-requests")) activeKey = "booked";
  else if (norm.includes("activity")) activeKey = "activity";
  else if (norm.includes("profile")) activeKey = "menu";

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  if (!isAuthenticated || !user) {
    return <Redirect href="/auth/signin" />;
  }

  return (
    <View style={{ flex: 1 }}>
      {gate?.pending ? <VerificationPendingBanner rejected={gate.rejected} /> : null}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { paddingBottom: showBar ? tabBarHeight : 0 },
          // Bottom-nav taps go through router.replace (see main-bottom-nav.tsx),
          // so this Stack stands in for tab switching, not page navigation —
          // a full slide push/pop here reads as a jarring screen change
          // instead of a tab switch, so use a quick cross-fade instead.
          animation: "fade",
          animationDuration: 180,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="book-service" />
        <Stack.Screen name="booked-requests" />
        <Stack.Screen name="activity" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="vehicles" />
        <Stack.Screen name="earnings" />
        <Stack.Screen name="disputes" />
        <Stack.Screen name="requirements" />
      </Stack>

      {showBar && (
        <View
          onLayout={handleTabBarLayout}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10,
          }}
        >
          <MainBottomNav activeKey={activeKey} labels={bottomNavLabels} />
        </View>
      )}
    </View>
  );
}
