import { Stack, Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "@/lib/auth-context";

export default function MainLayout() {
  const { user, isLoading, isAuthenticated } = useAuth();

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
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="book-service" />
      <Stack.Screen name="booked-requests" />
      <Stack.Screen name="activity" />
      <Stack.Screen name="vehicles" />
      <Stack.Screen name="earnings" />
      <Stack.Screen name="disputes" />
      <Stack.Screen name="requirements" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}
