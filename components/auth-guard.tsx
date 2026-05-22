/**
 * Auth Guard — redirects unauthenticated users to sign-in.
 * Lives outside app/ so Expo Router does not treat it as a route.
 */

import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth-context";

export function AuthGuard() {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/auth/signin");
    }
  }, [isAuthenticated, isLoading]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#FF8C00" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return null;
}
