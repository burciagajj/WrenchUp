import { Redirect, Slot } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { checkClientAdminAccess } from "@/lib/admin-access";

export default function AdminLayout() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [access, setAccess] = useState<"loading" | "allowed" | "denied">("loading");

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      setAccess("denied");
      return;
    }

    let cancelled = false;
    void checkClientAdminAccess(user).then((allowed) => {
      if (!cancelled) setAccess(allowed ? "allowed" : "denied");
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading, user]);

  if (isLoading || access === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  if (!isAuthenticated || !user) {
    return <Redirect href="/auth/signin" />;
  }

  if (access === "denied") {
    return <Redirect href="/(tabs)" />;
  }

  return <Slot />;
}
