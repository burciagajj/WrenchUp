import { Redirect, Slot, usePathname } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "@/lib/auth-context";

// Screens under app/auth/ that a freshly-authenticated (but not yet fully
// onboarded) user must still be able to reach. Without this allowlist, the
// blanket "authenticated -> go to (tabs)" redirect below fires the instant
// signUp()/signIn() sets the session — before the user ever sees these
// screens — which would silently skip required onboarding steps (including
// the mandatory profile photo, see app/auth/profile-complete.tsx).
const ALLOWED_AUTHENTICATED_PATHS = new Set(["/auth/profile-complete"]);

export default function AuthLayout() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const pathname = usePathname();

  // Still loading session
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  // Not logged in → show sign in / sign up screens
  if (!isAuthenticated || !user) {
    return <Slot />;
  }

  // Authenticated but still mid-onboarding on an allowed screen — let it render.
  if (ALLOWED_AUTHENTICATED_PATHS.has(pathname)) {
    return <Slot />;
  }

  // Already logged in and onboarded → go to main app
  return <Redirect href="/(tabs)" />;
}