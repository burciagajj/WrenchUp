import { Redirect, Slot } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "@/lib/auth-context";

export default function AuthLayout() {
  const { user, isLoading, isAuthenticated } = useAuth();

  // Still loading session
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  // Not logged in → show sign in / sign up screens
  if (!isAuthenticated || !user) {
    return <Slot />;
  }

  // Already logged in → go to main app
  return <Redirect href="/(tabs)" />;
}